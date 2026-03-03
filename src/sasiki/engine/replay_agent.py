"""The Replay Agent that executes tasks by observing the DOM and asking the LLM."""

import json
from typing import Any, Dict, Optional, cast
from playwright.async_api import Page

from sasiki.engine.page_observer import AccessibilityObserver, AriaSnapshot, CompressedNode
from sasiki.engine.replay_models import AgentAction, AgentDecision, RetryContext
from sasiki.llm.client import LLMClient
from sasiki.utils.logger import get_logger


# System prompt for normal execution
NORMAL_SYSTEM_PROMPT = """You are a highly capable web automation agent.
You are given a compressed representation of the current page's Accessibility Tree.
Your task is to choose the single next action to take to progress towards the user's goal.
You MUST output your choice in a valid JSON format matching this schema:
{
  "thought": "Reasoning based on DOM and goal",
  "action_type": "click" | "fill" | "navigate" | "hover" | "press" | "extract_text" | "assert_visible" | "ask_human" | "done",
  "target": {"role": "searchbox", "name": "Search"}, // Preferred target format
  "target_id": 12, // Legacy fallback target format
  "value": "text to fill or key to press", // Optional
  "message": "Message to user if asking human or done", // Optional
  "semantic_meaning": "What this step means at a semantic level",
  "progress_assessment": "Short progress update toward completion"
}
Always include semantic_meaning and progress_assessment.
Ensure the output is strictly parseable JSON."""

# System prompt for retry execution
RETRY_SYSTEM_PROMPT = """You are a highly capable web automation agent handling a RETRY scenario.
The previous action failed. Analyze the error and try a DIFFERENT approach.

You are given:
1. The goal you're trying to achieve
2. Information about what went wrong
3. Current page state (Accessibility Tree)

CRITICAL: Choose a different strategy than before. Consider:
- If element not found: Wait for page to load, scroll, or look for alternative elements
- If action failed: Check if element is visible, enabled, or try a different element
- If navigation error: Wait for page to stabilize

You MUST output your choice in valid JSON format:
{
  "thought": "Analysis of failure and new strategy",
  "action_type": "click" | "fill" | "navigate" | "hover" | "press" | "extract_text" | "assert_visible" | "ask_human" | "done",
  "target": {"role": "button", "name": "Submit"},
  "target_id": 12,
  "value": "...",
  "message": "...",
  "semantic_meaning": "What this retry action means semantically",
  "progress_assessment": "How this action changes stage progress"
}"""


class ReplayAgent:
    def __init__(self) -> None:
        self.observer = AccessibilityObserver()
        self.llm = LLMClient()

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
        action_history: Optional[list[str]] = None,
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
        )

    async def step_with_context(
        self,
        page: Page,
        goal: str,
        retry_context: Optional[RetryContext] = None,
        action_history: Optional[list[str]] = None,
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
        # Log concise goal summary (first line only)
        goal_summary = goal.split('\n')[0] if goal else ""
        get_logger().info(
            "replay_agent_step_start",
            goal_summary=goal_summary,
            is_retry=retry_context is not None,
            attempt=retry_context.attempt_number if retry_context else 1,
        )

        # 1. Observe the page (只在这里观测一次)
        observation = await self.observer.observe(page)
        compressed_tree = observation.compressed_tree
        snapshot = observation.snapshot
        self.current_node_map = observation.node_map
        observation_payload = snapshot if snapshot is not None else compressed_tree

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

        # 3. Call LLM
        response_str = await self.llm.complete_async(
            messages=messages,
            temperature=0.1,
            response_format={"type": "json_object"}
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
            action = AgentAction(**action_data)
            get_logger().info("replay_agent_action_decided", action=action.model_dump())
            return action
        except Exception as e:
            get_logger().error("Failed to parse LLM action", error=str(e), response=response_str)
            raise

    def _build_normal_prompt(
        self,
        goal: str,
        compressed_tree: Any,
        action_history: Optional[list[str]] = None,
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
        action_history: Optional[list[str]] = None,
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
                await locator.click()
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

    def _resolve_locator(self, page: Page, action: AgentDecision) -> Any | None:
        """Resolve Playwright locator from semantic target or node map metadata."""
        role: str | None = None
        name: str | None = None

        if action.target is not None:
            role = action.target.role
            name = action.target.name
        elif action.target_id is not None and action.target_id in self.current_node_map:
            locator_info = self.current_node_map[action.target_id].locator_args
            role = locator_info.role
            name = locator_info.name

        if not role:
            return None
        if name:
            return page.get_by_role(cast(Any, role), name=name)
        return page.get_by_role(cast(Any, role))

    def _resolve_target_id(self, action: AgentDecision) -> int | None:
        """Resolve legacy target_id from semantic target for compatibility path."""
        if action.target is None:
            return None
        for node_id, node_info in self.current_node_map.items():
            locator = node_info.locator_args
            if locator.role != action.target.role:
                continue
            if action.target.name and locator.name != action.target.name:
                continue
            return node_id
        return None
