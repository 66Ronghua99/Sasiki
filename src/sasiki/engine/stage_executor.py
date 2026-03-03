"""Stage execution engine for running a single workflow stage.

This module provides the StageExecutor class for executing individual workflow
stages with step-by-step Agent control, retry logic, and HITL handling.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Literal

from sasiki.engine.hitl_decision_mapper import HITLDecisionMapper
from sasiki.engine.refiner_state import StageResult
from sasiki.engine.replay_models import AgentAction, AgentDecision, EpisodeEntry, RetryContext
from sasiki.utils.logger import get_logger

if TYPE_CHECKING:
    from playwright.async_api import Page

    from sasiki.engine.human_interface import HumanInteractionHandler
    from sasiki.engine.replay_agent import ReplayAgent


@dataclass
class StageContext:
    """Structured stage context for building agent prompts."""

    stage_name: str
    application: str | None = None
    objective: str = ""
    success_criteria: str = ""
    context_hints: list[str] = field(default_factory=list)
    reference_actions: list[dict[str, Any]] = field(default_factory=list)
    actions: list[str] = field(default_factory=list)
    action_details: list[dict[str, Any]] = field(default_factory=list)
    recent_history: list[str] = field(default_factory=list)

    def build_prompt(self) -> str:
        """Build prompt text for the stage with semantic and action-level guidance."""
        lines = [f"Complete stage: {self.stage_name}"]

        if self.application:
            lines.append(f"Application/Context: {self.application}")

        if self.objective:
            lines.append(f"\nObjective: {self.objective}")
        if self.success_criteria:
            lines.append(f"Success criteria: {self.success_criteria}")

        if self.context_hints:
            lines.append("\nContext hints:")
            for hint in self.context_hints:
                lines.append(f"  - {hint}")

        if self.reference_actions:
            lines.append("\nReference actions (hints, not strict script):")
            for i, reference_action in enumerate(self.reference_actions, 1):
                action_type = reference_action.get("type", "unknown")
                target = reference_action.get("target")
                value = reference_action.get("value")
                action_desc = f"  {i}. {action_type}"
                if target:
                    action_desc += f" on {target}"
                if value:
                    action_desc += f' with "{value}"'
                lines.append(action_desc)

        if self.action_details:
            lines.append("\nStructured actions to perform:")
            for i, detail in enumerate(self.action_details, 1):
                action_type = detail.get("action_type", "unknown")
                target_hint = detail.get("target_hint", "")
                value = detail.get("value", "")

                action_desc = f"  {i}. {action_type}"
                if target_hint:
                    action_desc += f" on {target_hint}"
                if value:
                    action_desc += f' with "{value}"'
                lines.append(action_desc)

                page_context = detail.get("page_context", {})
                url = page_context.get("url", "") if isinstance(page_context, dict) else ""
                if url:
                    lines.append(f"     (Page: {url})")
        elif self.actions:
            lines.append("\nActions to perform:")
            for i, plain_action in enumerate(self.actions, 1):
                lines.append(f"  {i}. {plain_action}")

        if self.recent_history:
            lines.append("\nRecent progress:")
            for thought in self.recent_history[-5:]:
                lines.append(f"  - {thought[:100]}..." if len(thought) > 100 else f"  - {thought}")

        return "\n".join(lines)


class StageExecutor:
    """Executes a single workflow stage with step-by-step Agent control.

    This class encapsulates the stage execution loop, including:
    - Normal step execution via Agent
    - Retry on failure
    - Repetitive action detection
    - HITL (Human-in-the-loop) interactions

    Example:
        executor = StageExecutor(agent, human_handler, max_steps=20)
        result = await executor.execute(page, stage, stage_index)
    """

    def __init__(
        self,
        agent: ReplayAgent,
        human_handler: HumanInteractionHandler | None = None,
        max_steps: int = 20,
        max_repeats: int = 3,
    ):
        """Initialize the stage executor.

        Args:
            agent: The ReplayAgent for making decisions
            human_handler: Handler for HITL interactions
            max_steps: Maximum steps before failing the stage
            max_repeats: Maximum repetitions of same action before failing
        """
        self.agent = agent
        self.human_handler = human_handler
        self.max_steps = max_steps
        self.max_repeats = max_repeats

    async def execute(
        self,
        page: Page,
        stage: dict[str, Any],
        stage_index: int,
        history: list[str],
    ) -> StageResult:
        """Execute a single stage.

        Args:
            page: The Playwright page to interact with
            stage: The stage definition from execution plan
            stage_index: Index of the stage for logging
            history: Shared history list to accumulate thoughts

        Returns:
            StageResult containing the execution outcome
        """
        stage_name = stage["name"]
        actions_list = stage.get("actions", [])

        # Build independent goal for this stage
        goal = self._build_stage_goal(stage, history)

        # Build concise summary for logging
        action_count = len(stage.get("actions", []))
        action_details_count = len(stage.get("action_details", []))
        get_logger().info(
            "stage_start",
            stage_index=stage_index,
            stage_name=stage_name,
            action_count=action_details_count or action_count,
            application=stage.get("application"),
        )

        # Clear history at start of each stage
        history.clear()

        taken_actions: list[AgentAction] = []
        episode_log: list[EpisodeEntry] = []
        steps_taken = 0

        # Track last action for detecting repetition
        last_action_key: str | None = None
        repeat_count = 0

        while steps_taken < self.max_steps:
            action: AgentAction | None = None
            try:
                # Get next action from agent
                action = await self.agent.step(
                    page,
                    goal,
                    action_history=self._build_action_history(history, episode_log),
                )
                taken_actions.append(action)
                steps_taken += 1

                # Check for repetitive action patterns
                action_key = self._action_key(action)
                if action_key == last_action_key:
                    repeat_count += 1
                    if repeat_count >= self.max_repeats:
                        return StageResult(
                            stage_name=stage_name,
                            status="failed",
                            steps_taken=steps_taken,
                            actions=taken_actions,
                            episode_log=episode_log.copy(),
                            error=f"Action repetition detected: {action.action_type} repeated {self.max_repeats} times",
                        )
                else:
                    repeat_count = 0
                    last_action_key = action_key

                # Execute the action and record structured memory
                page_url_before = self._safe_page_url(page)
                await self.agent.execute_action(page, action)
                page_url_after = self._safe_page_url(page)
                self._record_episode(
                    episode_log=episode_log,
                    step=steps_taken,
                    action=action,
                    result="success",
                    page_url_before=page_url_before,
                    page_url_after=page_url_after,
                )

                # Check for done
                if action.action_type == "done":
                    get_logger().info(
                        "stage_complete",
                        stage_index=stage_index,
                        stage_name=stage_name,
                        steps=steps_taken,
                        message=action.message,
                    )
                    return StageResult(
                        stage_name=stage_name,
                        status="success",
                        steps_taken=steps_taken,
                        actions=taken_actions,
                        episode_log=episode_log.copy(),
                    )

                # Check for human pause request
                if action.action_type == "ask_human":
                    result = await self._handle_ask_human(
                        stage_name,
                        stage_index,
                        steps_taken,
                        taken_actions,
                        episode_log,
                        action,
                        goal,
                        history,
                    )
                    if result == "continue":
                        # Human provided input, continue execution
                        continue
                    return result

            except Exception as e:
                # Retry with context on failure
                get_logger().warning(
                    "action_failed_retrying",
                    stage_index=stage_index,
                    step=steps_taken,
                    error=str(e),
                )

                # Build retry context
                retry_ctx = RetryContext(
                    failed_action=action,
                    error_message=str(e),
                    error_type=self._classify_error(e),
                    attempt_number=2,
                    max_attempts=2,
                )
                if action is not None:
                    current_url = self._safe_page_url(page)
                    self._record_episode(
                        episode_log=episode_log,
                        step=steps_taken + 1,
                        action=action,
                        result="failed",
                        error=str(e),
                        page_url_before=current_url,
                        page_url_after=current_url,
                    )

                retry_action: AgentAction | None = None
                try:
                    retry_action = await self.agent.step_with_context(
                        page,
                        goal,
                        retry_context=retry_ctx,
                        action_history=self._build_action_history(history, episode_log),
                    )
                    taken_actions.append(retry_action)
                    steps_taken += 1
                    page_url_before = self._safe_page_url(page)
                    await self.agent.execute_action(page, retry_action)
                    page_url_after = self._safe_page_url(page)
                    self._record_episode(
                        episode_log=episode_log,
                        step=steps_taken,
                        action=retry_action,
                        result="success",
                        page_url_before=page_url_before,
                        page_url_after=page_url_after,
                    )

                    if retry_action.action_type == "done":
                        return StageResult(
                            stage_name=stage_name,
                            status="success",
                            steps_taken=steps_taken,
                            actions=taken_actions,
                            episode_log=episode_log.copy(),
                        )

                    if retry_action.action_type == "ask_human":
                        result = await self._handle_ask_human(
                            stage_name,
                            stage_index,
                            steps_taken,
                            taken_actions,
                            episode_log,
                            retry_action,
                            goal,
                            history,
                        )
                        if result == "continue":
                            continue
                        return result

                except Exception as e2:
                    if retry_action is not None:
                        current_url = self._safe_page_url(page)
                        self._record_episode(
                            episode_log=episode_log,
                            step=steps_taken + 1,
                            action=retry_action,
                            result="failed",
                            error=str(e2),
                            page_url_before=current_url,
                            page_url_after=current_url,
                        )
                    get_logger().error(
                        "action_failed_after_retry",
                        stage_index=stage_index,
                        step=steps_taken,
                        error=str(e2),
                    )
                    # Retry failed, enter HITL
                    return await self._handle_step_failure(
                        stage_name,
                        stage_index,
                        steps_taken,
                        taken_actions,
                        episode_log,
                        e2,
                        goal,
                        history,
                    )

        # Max steps reached
        get_logger().error(
            "stage_max_steps_reached",
            stage_index=stage_index,
            stage_name=stage_name,
            max_steps=self.max_steps,
        )
        return StageResult(
            stage_name=stage_name,
            status="failed",
            steps_taken=steps_taken,
            actions=taken_actions,
            episode_log=episode_log.copy(),
            error=f"Maximum steps ({self.max_steps}) reached",
        )

    def _build_stage_goal(self, stage: dict[str, Any], history: list[str]) -> str:
        """Build stage goal prompt via structured StageContext."""
        context = StageContext(
            stage_name=stage["name"],
            application=stage.get("application"),
            objective=stage.get("objective", ""),
            success_criteria=stage.get("success_criteria", ""),
            context_hints=stage.get("context_hints", []),
            reference_actions=stage.get("reference_actions", []),
            actions=stage.get("actions", []),
            action_details=stage.get("action_details", []),
            recent_history=history,
        )
        return context.build_prompt()

    def _classify_error(self, error: Exception) -> str:
        """Classify error type for retry strategy."""
        error_str = str(error).lower()
        if "not found" in error_str or "backendnodeid" in error_str:
            return "element_not_found"
        elif "timeout" in error_str:
            return "timeout"
        elif "navigation" in error_str:
            return "navigation_error"
        else:
            return "execution_error"

    def _action_key(self, action: AgentDecision) -> str:
        """Create a stable action key for repetition detection."""
        if action.target_id is not None:
            target_part = f"id:{action.target_id}"
        elif action.target is not None:
            target_part = f"semantic:{action.target.role}:{action.target.name or ''}"
        else:
            target_part = "none"
        return f"{action.action_type}:{target_part}:{action.value or ''}"

    async def _handle_ask_human(
        self,
        stage_name: str,
        stage_index: int,
        steps_taken: int,
        taken_actions: list[AgentAction],
        episode_log: list[EpisodeEntry],
        action: AgentAction,
        goal: str,
        history: list[str],
    ) -> StageResult | Literal["continue"]:
        """Handle ask_human action type.

        Returns:
            StageResult: If the stage should end (abort, skip, pause)
            "continue": If the agent should continue executing the stage
        """
        from sasiki.engine.human_interface import HITLContext, HumanDecision

        get_logger().info(
            "stage_paused_for_human",
            stage_index=stage_index,
            stage_name=stage_name,
            message=action.message,
        )

        # If no handler, return paused status (backwards compatible)
        if self.human_handler is None:
            return HITLDecisionMapper().map_no_handler_result(
                stage_name,
                steps_taken,
                taken_actions,
                episode_log=episode_log,
                error=None,
            )

        # Build HITL context
        hitl_context = HITLContext(
            stage_name=stage_name,
            stage_index=stage_index,
            step_number=steps_taken,
            agent_message=action.message,
            last_action=action,
            current_goal=goal,
            history=history[-5:],
        )

        # Wait for user decision
        decision, feedback = await self.human_handler.handle_hitl_pause(hitl_context)

        # Handle PROVIDE_INPUT: add feedback to history and continue execution
        if decision == HumanDecision.PROVIDE_INPUT:
            if feedback:
                history.append(f"Human: {feedback}")
                get_logger().info("human_input_received", feedback=feedback)
            return "continue"

        # Handle CONTINUE: also continue execution (may add feedback)
        if decision == HumanDecision.CONTINUE:
            if feedback:
                history.append(f"Human: {feedback}")
            return "continue"

        # Map other decisions to result using centralized mapper
        return HITLDecisionMapper().map_decision_to_result(
            decision=decision,
            stage_name=stage_name,
            steps_taken=steps_taken,
            taken_actions=taken_actions,
            history=history,
            episode_log=episode_log,
            feedback=feedback,
            error=None,
            is_ask_human=True,
        )

    async def _handle_step_failure(
        self,
        stage_name: str,
        stage_index: int,
        steps_taken: int,
        taken_actions: list[AgentAction],
        episode_log: list[EpisodeEntry],
        error: Exception,
        goal: str,
        history: list[str],
    ) -> StageResult:
        """Handle step failure after retry exhaustion."""
        from sasiki.engine.human_interface import HITLContext

        # If no handler, return failed status (backwards compatible)
        if self.human_handler is None:
            return HITLDecisionMapper().map_no_handler_result(
                stage_name,
                steps_taken,
                taken_actions,
                episode_log=episode_log,
                error=error,
            )

        # Build HITL context with error information
        hitl_context = HITLContext(
            stage_name=stage_name,
            stage_index=stage_index,
            step_number=steps_taken,
            error_message=str(error),
            last_action=taken_actions[-1] if taken_actions else None,
            current_goal=goal,
            history=history[-5:],
        )

        # Wait for user decision
        decision, feedback = await self.human_handler.handle_hitl_pause(hitl_context)

        # Map decision to result using centralized mapper
        return HITLDecisionMapper().map_decision_to_result(
            decision=decision,
            stage_name=stage_name,
            steps_taken=steps_taken,
            taken_actions=taken_actions,
            history=history,
            episode_log=episode_log,
            feedback=feedback,
            error=error,
            is_ask_human=False,
        )

    def _safe_page_url(self, page: Page) -> str:
        """Get page url safely for mocks and real pages."""
        page_url = getattr(page, "url", "")
        return page_url if isinstance(page_url, str) else str(page_url)

    def _target_description(self, action: AgentAction) -> str:
        """Build a short target description for episode logging."""
        if action.target is not None:
            if action.target.name:
                return f"{action.target.role} '{action.target.name}'"
            return action.target.role
        if action.target_id is not None:
            return f"node_id:{action.target_id}"
        return ""

    def _build_action_history(self, history: list[str], episode_log: list[EpisodeEntry]) -> list[str]:
        """Build prompt history from structured episode memory plus human notes."""
        episode_lines: list[str] = []
        for entry in episode_log[-5:]:
            summary = entry.progress_assessment or entry.semantic_meaning or entry.thought
            if not summary:
                summary = f"{entry.action_type} {entry.target_description}".strip()
            episode_lines.append(f"Step {entry.step}: {summary}")
        return (episode_lines + history[-3:])[-5:]

    def _record_episode(
        self,
        episode_log: list[EpisodeEntry],
        step: int,
        action: AgentAction,
        result: Literal["success", "failed", "skipped"],
        page_url_before: str,
        page_url_after: str,
        error: str | None = None,
    ) -> None:
        """Append one structured episode memory entry."""
        episode_log.append(
            EpisodeEntry(
                step=step,
                action_type=action.action_type,
                target_description=self._target_description(action),
                value=action.value,
                result=result,
                error=error,
                page_url_before=page_url_before,
                page_url_after=page_url_after,
                page_changed=page_url_before != page_url_after,
                thought=action.thought,
                semantic_meaning=action.semantic_meaning,
                progress_assessment=action.progress_assessment,
            )
        )
