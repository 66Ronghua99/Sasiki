"""The Replay Agent that executes tasks by observing the DOM and asking the LLM."""

import json
from typing import Any, cast
from playwright.async_api import Page

from sasiki.engine.page_observer import AccessibilityObserver, AriaSnapshot, CompressedNode
from sasiki.engine.replay_models import AgentAction, AgentDecision, RetryContext
from sasiki.llm.client import LLMClient
from sasiki.utils.logger import get_logger


# System prompt for normal execution
NORMAL_SYSTEM_PROMPT = """You are a web automation agent. Given a compressed Accessibility Tree snapshot of the current page, choose the single best next action to progress toward the goal.

## Targeting (priority order)
1. Use `target` with `role` + `name` (maps to Playwright get_by_role — most reliable).
2. Fall back to `target_id` only when role/name are unavailable in the snapshot.

## Action guidelines
- `click` / `fill` / `hover` / `press`: interact with a specific element.
- `navigate`: go to a URL (use only when a direct navigation is needed and not achievable by clicking).
- `extract_text` / `assert_visible`: read or verify content.
- `ask_human`: use ONLY when genuinely blocked and cannot proceed autonomously (e.g., CAPTCHA, ambiguous goal, missing credential).
- `done`: declare only when success_criteria is concretely met. Provide specific `evidence` (e.g., visible text, URL, element state) that proves completion.

## Handling dynamic pages (SPA)
- If the DOM snapshot looks empty or incomplete, prefer `navigate` or `press` Enter to trigger a reload rather than clicking invisible elements.
- If an element is expected but missing, try scrolling (`press` ArrowDown / End) or waiting by re-observing before acting.

## Avoiding loops
- Do NOT repeat the same action if the DOM hash did not change after the previous step.
- If stuck (same element, same result), try an alternative element, a different action type, or `ask_human`.

## Output format
Respond with a single JSON object. Always include `semantic_meaning` and `progress_assessment`. Include `evidence` when `action_type` is `done`."""

# System prompt for retry execution
RETRY_SYSTEM_PROMPT = """You are a web automation agent handling a RETRY. The previous action failed — choose a genuinely DIFFERENT strategy.

## Error-specific recovery
- `element_not_found`: The target was not in the DOM. Try an alternative selector (different role/name), scroll first, or wait for content to load.
- `timeout`: Page or element took too long. Use `navigate` to reload, or try a lighter interaction.
- `navigation_error`: Page transition failed or is still loading. Re-observe before acting; consider navigating directly to the target URL.
- `execution_error`: Generic failure. Inspect the current DOM carefully; pick a completely different element or approach.

## Critical rules
- Do NOT repeat the exact same action that just failed.
- Prefer `target` (role + name) over `target_id` for reliability.
- If all reasonable alternatives are exhausted, use `ask_human` with a clear explanation.

## Output format
Respond with a single JSON object. Always include `semantic_meaning`, `progress_assessment`, and `thought` (explaining why the new strategy differs). Include `evidence` when `action_type` is `done`."""


class ReplayAgent:
    _INTERACTION_ACTION_TYPES = {"click", "fill", "hover", "extract_text", "assert_visible"}

    def __init__(self) -> None:
        self.observer = AccessibilityObserver()
        self.llm = LLMClient()
        self.last_dom_hash: str | None = None
        self.current_node_map: dict[int, Any] = {}
        self.current_selector_map: dict[int, str] = {}
        self._round_index = 0
        self._debug_rounds: list[dict[str, Any]] = []

    def reset_debug_rounds(self) -> None:
        """Reset in-memory LLM debug rounds for a new stage run."""
        self._debug_rounds = []

    def consume_debug_rounds(self) -> list[dict[str, Any]]:
        """Consume and clear collected LLM debug rounds."""
        rounds = self._debug_rounds.copy()
        self._debug_rounds = []
        return rounds

    async def _get_element_center(self, page: Page, backend_node_id: int) -> tuple[float, float]:
        """Gets the center coordinates of an element using CDP."""
        client = await page.context.new_cdp_session(page)
        try:
            await client.send("DOM.enable")
            res = await client.send("DOM.getBoxModel", {"backendNodeId": backend_node_id})
            quad = res["model"]["border"]
            # quad is [x1, y1, x2, y2, x3, y3, x4, y4]
            # typical order: top-left, top-right, bottom-right, bottom-left
            x = sum([quad[i] for i in range(0, 8, 2)]) / 4
            y = sum([quad[i] for i in range(1, 8, 2)]) / 4
            return x, y
        finally:
            await client.detach()

    async def step(
        self,
        page: Page,
        goal: str,
        action_history: list[str] | None = None,
        observation: Any | None = None,
    ) -> AgentAction:
        """Takes a single step towards the goal.

        Args:
            page: The Playwright page to interact with
            goal: The goal to achieve in this step
            action_history: Optional list of previous actions/thoughts for context

        Returns:
            AgentAction decided by the LLM
        """
        return await self.step_with_context(
            page=page,
            goal=goal,
            retry_context=None,
            action_history=action_history,
            observation=observation,
        )

    async def step_with_context(
        self,
        page: Page,
        goal: str,
        retry_context: RetryContext | None = None,
        action_history: list[str] | None = None,
        observation: Any | None = None,
    ) -> AgentAction:
        """执行单步，支持 retry 上下文和 action history。

        Args:
            page: The Playwright page to interact with
            goal: The goal to achieve in this step
            retry_context: Optional retry context with failure information
            action_history: Optional list of previous actions/thoughts for context

        Returns:
            AgentAction decided by the LLM
        """
        self._round_index += 1
        # Log concise goal summary (first line only)
        goal_summary = goal.split('\n')[0] if goal else ""
        get_logger().info(
            "replay_agent_step_start",
            round_index=self._round_index,
            goal_summary=goal_summary,
            is_retry=retry_context is not None,
            attempt=retry_context.attempt_number if retry_context else 1,
        )

        # 1. Observe once unless the caller provides an observation payload
        if observation is None:
            observer_result = await self.observer.observe(page)
            compressed_tree = observer_result.compressed_tree
            snapshot = observer_result.snapshot
            self.current_node_map = observer_result.node_map
            self.current_selector_map = {}
            self.last_dom_hash = snapshot.dom_hash if snapshot is not None else None
            observation_payload = snapshot if snapshot is not None else compressed_tree
        else:
            observation_payload = self._consume_external_observation(observation)

        # 2. Build the prompt based on context
        if retry_context:
            system_prompt = RETRY_SYSTEM_PROMPT
            user_prompt = self._build_retry_prompt(goal, retry_context, observation_payload, action_history)
        else:
            system_prompt = NORMAL_SYSTEM_PROMPT
            user_prompt = self._build_normal_prompt(goal, observation_payload, action_history)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        observation_json = self._serialize_tree(observation_payload)
        get_logger().info(
            "replay_agent_llm_request",
            round_index=self._round_index,
            is_retry=retry_context is not None,
            attempt=retry_context.attempt_number if retry_context else 1,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            observation_chars=len(observation_json),
            user_prompt_chars=len(user_prompt),
            system_prompt_chars=len(system_prompt),
        )
        round_trace: dict[str, Any] = {
            "round_index": self._round_index,
            "is_retry": retry_context is not None,
            "attempt": retry_context.attempt_number if retry_context else 1,
            "goal": goal,
            "action_history": action_history.copy() if action_history else [],
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "observation_payload": observation_json,
            "observation_chars": len(observation_json),
            "user_prompt_chars": len(user_prompt),
            "system_prompt_chars": len(system_prompt),
        }

        # 3. Call LLM
        try:
            response_str = await self.llm.complete_async(
                messages=messages,
                temperature=0.1,
                response_format={"type": "json_object"}
            )
        except Exception as e:
            round_trace["request_error"] = str(e)
            self._debug_rounds.append(round_trace)
            raise
        round_trace["raw_response"] = response_str
        round_trace["response_chars"] = len(response_str)
        get_logger().info(
            "replay_agent_llm_response_raw",
            round_index=self._round_index,
            response=response_str,
            response_chars=len(response_str),
        )

        # 4. Parse output
        try:
            clean_str = response_str.strip()
            if clean_str.startswith("```json"):
                clean_str = clean_str[7:]
            if clean_str.startswith("```"):
                clean_str = clean_str[3:]
            if clean_str.endswith("```"):
                clean_str = clean_str[:-3]

            action_data = json.loads(clean_str.strip())
            action_data = self._normalize_action_data(action_data)
            action = AgentAction(**action_data)
            round_trace["normalized_action"] = action.model_dump(mode="json")
            self._debug_rounds.append(round_trace)
            get_logger().info("replay_agent_action_decided", action=action.model_dump())
            return action
        except Exception as e:
            round_trace["parse_error"] = str(e)
            self._debug_rounds.append(round_trace)
            get_logger().error("Failed to parse LLM action", error=str(e), response=response_str)
            raise

    def _consume_external_observation(self, observation: Any) -> Any:
        """Load externally provided observation into local runtime state."""
        llm_payload: Any = None

        if hasattr(observation, "llm_payload"):
            llm_payload = getattr(observation, "llm_payload", None)
            node_map = getattr(observation, "node_map", {}) or {}
            selector_map = getattr(observation, "selector_map", {}) or {}
            dom_hash = getattr(observation, "dom_hash", None)
        elif isinstance(observation, dict):
            llm_payload = observation.get("llm_payload")
            node_map = observation.get("node_map", {}) or {}
            selector_map = observation.get("selector_map", {}) or {}
            dom_hash = observation.get("dom_hash")
        else:
            node_map = {}
            selector_map = {}
            dom_hash = None

        if isinstance(node_map, dict):
            self.current_node_map = {int(key): value for key, value in node_map.items()}
        else:
            self.current_node_map = {}

        if isinstance(selector_map, dict):
            self.current_selector_map = {
                int(key): str(value) for key, value in selector_map.items() if value
            }
        else:
            self.current_selector_map = {}

        self.last_dom_hash = dom_hash if isinstance(dom_hash, str) else None
        return llm_payload if llm_payload is not None else {}

    def _normalize_action_data(self, action_data: Any) -> dict[str, Any]:
        """Normalize common LLM output variants to AgentAction schema."""
        if not isinstance(action_data, dict):
            return {"thought": "Invalid action payload", "action_type": "ask_human", "message": str(action_data)}

        normalized = dict(action_data)
        for key in ("target", "target_id", "value", "message", "evidence", "url", "key", "keys"):
            raw_value = normalized.get(key)
            if isinstance(raw_value, str) and not raw_value.strip():
                normalized[key] = None

        # Normalize common action aliases
        action_type = normalized.get("action_type")
        action_alias_map = {
            "type": "fill",
            "input": "fill",
            "press_key": "press",
            "key_press": "press",
        }
        if isinstance(action_type, str):
            normalized["action_type"] = action_alias_map.get(action_type, action_type)

        # Navigate often returns `url` instead of `value`
        if normalized.get("action_type") == "navigate":
            if normalized.get("value") is None and isinstance(normalized.get("url"), str):
                normalized["value"] = normalized["url"]
            if normalized.get("value") is None and isinstance(normalized.get("target"), str):
                target_url = normalized["target"].strip()
                if target_url.startswith(("http://", "https://")):
                    normalized["value"] = target_url
                    normalized["target"] = None

        # Backward/variant fields from LLM outputs
        if normalized.get("target") is None:
            identifier_target = self._coerce_target_payload(normalized.get("element_identifier"))
            if identifier_target is not None:
                normalized["target"] = identifier_target

        coerced_target = self._coerce_target_payload(normalized.get("target"))
        if coerced_target is not None:
            normalized["target"] = coerced_target

        if normalized.get("value") is None and isinstance(normalized.get("key"), str):
            normalized["value"] = normalized["key"]
        if normalized.get("value") is None and isinstance(normalized.get("keys"), str):
            normalized["value"] = normalized["keys"]

        target_id = normalized.get("target_id")
        if isinstance(target_id, str):
            stripped_target_id = target_id.strip()
            if stripped_target_id.isdigit():
                normalized["target_id"] = int(stripped_target_id)
            elif stripped_target_id:
                fallback_target = normalized.get("target")
                if not isinstance(fallback_target, dict):
                    fallback_target = {}
                fallback_target.setdefault("element_id", stripped_target_id)
                normalized["target"] = fallback_target
                normalized["target_id"] = None
            else:
                normalized["target_id"] = None

        # Some models put URL in target.url for navigate; AgentAction expects value
        target = normalized.get("target")
        if isinstance(target, dict) and target.get("role") is None:
            target_url = target.get("url")
            if normalized.get("action_type") == "navigate" and isinstance(target_url, str):
                normalized["value"] = normalized.get("value") or target_url
                normalized["target"] = None

        # Evidence must always be a string for AgentAction schema
        evidence = normalized.get("evidence")
        if evidence is not None and not isinstance(evidence, str):
            try:
                normalized["evidence"] = json.dumps(evidence, ensure_ascii=False)
            except Exception:
                normalized["evidence"] = str(evidence)

        # Fill missing thought with a deterministic fallback
        thought = normalized.get("thought")
        if not isinstance(thought, str) or not thought.strip():
            fallback = (
                normalized.get("progress_assessment")
                or normalized.get("semantic_meaning")
                or f"Proceed with {normalized.get('action_type', 'next')} action."
            )
            normalized["thought"] = str(fallback)

        return normalized

    def _coerce_target_payload(self, target_payload: Any) -> dict[str, Any] | None:
        """Normalize target payload variants from different models."""
        if isinstance(target_payload, str):
            element_id = target_payload.strip()
            return {"element_id": element_id} if element_id else None
        if not isinstance(target_payload, dict):
            return None

        target = dict(target_payload)
        if "element_id" not in target and isinstance(target.get("elementId"), str):
            target["element_id"] = target["elementId"]
        if "test_id" not in target and isinstance(target.get("testId"), str):
            target["test_id"] = target["testId"]
        if "element_id" not in target and isinstance(target.get("id"), str):
            target["element_id"] = target["id"]
        return target

    def _build_normal_prompt(
        self,
        goal: str,
        compressed_tree: Any,
        action_history: list[str] | None = None,
    ) -> str:
        """构建正常的 prompt。"""
        parts = [f"Goal: {goal}"]

        if action_history:
            parts.append("\n📜 Recent actions:")
            for i, action in enumerate(action_history[-5:], 1):  # 最近5步
                parts.append(f"  {i}. {action}")

        parts.append(f"\nCurrent Page DOM Snapshot:\n{self._serialize_tree(compressed_tree)}")
        parts.append("\nChoose the next action.")

        return "\n".join(parts)

    def _serialize_tree(self, compressed_tree: AriaSnapshot | CompressedNode | list[CompressedNode] | dict[str, Any] | list[Any] | None) -> str:
        """Serialize compressed tree to JSON string.

        Handles both Pydantic models (new format) and plain dicts (legacy/tests).
        """
        if compressed_tree is None:
            return "{}"
        if isinstance(compressed_tree, AriaSnapshot):
            return compressed_tree.model_dump_json()
        if isinstance(compressed_tree, CompressedNode):
            return compressed_tree.model_dump_json()
        if isinstance(compressed_tree, dict):
            return json.dumps(compressed_tree, ensure_ascii=False)
        # Handle list case - check if elements are models or dicts
        if compressed_tree and isinstance(compressed_tree[0], CompressedNode):
            return json.dumps([node.model_dump() for node in compressed_tree], ensure_ascii=False)
        return json.dumps(compressed_tree, ensure_ascii=False)

    def _build_retry_prompt(
        self,
        goal: str,
        retry_context: RetryContext,
        compressed_tree: Any,
        action_history: list[str] | None = None,
    ) -> str:
        """构建 retry 时的 prompt。

        注意：DOM 信息已经在 observation 中，不需要重复塞入完整 DOM。
        我们利用 Agent 已经观测到的 compressed_tree。
        """
        parts = [
            f"Goal: {goal}",
            "",
            "⚠️  PREVIOUS ACTION FAILED ⚠️",
        ]

        if retry_context.failed_action:
            try:
                failed_action_str = retry_context.failed_action.model_dump_json()
            except Exception:
                failed_action_str = str(retry_context.failed_action)
            parts.append(f"Failed action: {failed_action_str}")

        parts.extend([
            f"Error type: {retry_context.error_type}",
            f"Error message: {retry_context.error_message}",
            f"Attempt: {retry_context.attempt_number}/{retry_context.max_attempts}",
            "",
            "IMPORTANT: Analyze why the previous action failed and try a DIFFERENT approach.",
            "Consider:",
            "- Element not found or not visible? Wait or look for alternatives.",
            "- Page navigation occurred? Wait for page to stabilize.",
            "- Network delay? Consider waiting.",
            "- Wrong target selected? Look more carefully at the DOM.",
        ])

        if action_history:
            parts.append("\n📜 Previous actions before failure:")
            for i, action in enumerate(action_history[-3:], 1):  # 最近3步
                parts.append(f"  {i}. {action}")

        parts.append(f"\nCurrent Page DOM Snapshot:\n{self._serialize_tree(compressed_tree)}")
        parts.append("\nChoose the next action carefully with a different strategy.")

        return "\n".join(parts)

    async def execute_action(self, page: Page, action: AgentAction) -> Any:
        """Executes the chosen action using Playwright."""
        
        # Actions that don't require a target
        if action.action_type == "done":
            get_logger().info("replay_agent_done", message=action.message)
            return action.message
            
        if action.action_type == "ask_human":
            get_logger().info("replay_agent_ask_human", message=action.message)
            # In a real CLI, we would use prompt/input here.
            # For now, we simulate pausing.
            print(f"\n[Agent Asks Human]: {action.message}")
            return "paused_for_human"
            
        if action.action_type == "press":
            if not action.value:
                raise ValueError("Action 'press' requires a 'value'")
            await page.keyboard.press(action.value)
            return True

        if action.action_type == "navigate":
            if not action.value:
                raise ValueError("Action 'navigate' requires a 'value' (URL)")
            await page.goto(action.value)
            # Wait for JS-rendered SPAs to finish rendering after navigation
            try:
                await page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                pass  # Timeout is acceptable; continue with current page state
            return True

        # Actions that DO require a target
        locator = self._resolve_locator(page, action)
        if locator is not None:
            if action.action_type == "click":
                await self._click_with_fallback(page, locator, action)
                try:
                    await page.wait_for_load_state("domcontentloaded", timeout=3000)
                except Exception:
                    pass
                return True
            if action.action_type == "hover":
                await locator.hover()
                return True
            if action.action_type == "fill":
                if not action.value:
                    raise ValueError("Action 'fill' requires a 'value'")
                await locator.fill(action.value)
                return True
            if action.action_type == "extract_text":
                return await locator.inner_text()
            if action.action_type == "assert_visible":
                return await locator.is_visible()

        if not action.target_id:
            action.target_id = self._resolve_target_id(action)
        if not action.target_id:
            raise ValueError(f"Action {action.action_type} requires a target/target_id")
        if action.target_id not in self.current_node_map:
            raise ValueError(f"Target ID {action.target_id} not found in node map")

        node_info = self.current_node_map[action.target_id]
        raw_node = node_info.raw_node
        backend_node_id = raw_node.get("backendDOMNodeId")
        if not backend_node_id:
            raise ValueError(f"Target ID {action.target_id} has no backendDOMNodeId")

        x, y = await self._get_element_center(page, backend_node_id)
        if action.action_type == "click":
            await page.mouse.click(x, y)
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=3000)
            except Exception:
                pass
        elif action.action_type == "hover":
            await page.mouse.move(x, y)
        elif action.action_type == "fill":
            if not action.value:
                raise ValueError("Action 'fill' requires a 'value'")
            await page.mouse.click(x, y)
            await page.keyboard.press("Meta+A")
            await page.keyboard.press("Control+A")
            await page.keyboard.press("Backspace")
            await page.keyboard.type(action.value)
        elif action.action_type == "extract_text":
            return raw_node.get("name", {}).get("value", "")
        elif action.action_type == "assert_visible":
            return True

        return True

    async def _click_with_fallback(self, page: Page, locator: Any, action: AgentDecision) -> None:
        """Click locator with conservative text fallback for unstable accessibility names."""
        try:
            await locator.click()
            return
        except Exception:
            if (
                action.target is None
                or action.target.role not in {"link", "button"}
                or not action.target.name
            ):
                raise

        fallback_name = action.target.name.strip()
        if not fallback_name:
            raise
        await page.get_by_text(fallback_name, exact=False).first.click(timeout=5000)

    def _resolve_locator(self, page: Page, action: AgentDecision) -> Any | None:
        """Resolve Playwright locator from semantic target or node map metadata."""
        role: str | None = None
        name: str | None = None

        if action.target is not None:
            if action.target.test_id:
                return page.get_by_test_id(action.target.test_id).first
            if action.target.element_id:
                return page.locator(
                    f'[id="{self._escape_css_attr_value(action.target.element_id)}"]'
                ).first
            role = action.target.role
            name = action.target.name
        elif action.target_id is not None and action.target_id in self.current_node_map:
            locator_info = self.current_node_map[action.target_id].locator_args
            role = locator_info.role
            name = locator_info.name
        elif action.target_id is not None and action.target_id in self.current_selector_map:
            return page.locator(self.current_selector_map[action.target_id]).first

        if not role:
            return None
        if (
            action.action_type in self._INTERACTION_ACTION_TYPES
            and not name
        ):
            # Role-only targeting is ambiguous on list-heavy pages (e.g. many links/buttons).
            # Let explicit target_id path handle it when provided.
            if action.target_id is not None:
                return None
            raise ValueError(
                f"Ambiguous target for {action.action_type}: role-only locator is not allowed"
            )
        if name:
            return page.get_by_role(cast(Any, role), name=name)
        return page.get_by_role(cast(Any, role))

    def _resolve_target_id(self, action: AgentDecision) -> int | None:
        """Resolve legacy target_id from semantic target for compatibility path."""
        if action.target is None or not action.target.role or not action.target.name:
            return None
        for node_id, node_info in self.current_node_map.items():
            locator = node_info.locator_args
            if locator.role != action.target.role:
                continue
            if action.target.name and locator.name != action.target.name:
                continue
            return node_id
        return None

    def _escape_css_attr_value(self, value: str) -> str:
        """Escape attribute selector value for Playwright CSS locator."""
        return value.replace("\\", "\\\\").replace('"', '\\"')
