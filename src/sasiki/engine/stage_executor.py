"""Stage execution engine for running a single workflow stage.

This module provides the StageExecutor class for executing individual workflow
stages with step-by-step Agent control, retry logic, and HITL handling.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sasiki.engine.hitl_decision_mapper import HITLDecisionMapper
from sasiki.engine.refiner_state import StageResult
from sasiki.engine.replay_models import AgentAction, RetryContext
from sasiki.utils.logger import get_logger

if TYPE_CHECKING:
    from playwright.async_api import Page

    from sasiki.engine.human_interface import HumanInteractionHandler
    from sasiki.engine.replay_agent import ReplayAgent


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
        get_logger().info(
            "stage_start",
            stage_index=stage_index,
            stage_name=stage_name,
            goal=goal,
        )

        # Clear history at start of each stage
        history.clear()

        taken_actions: list[AgentAction] = []
        steps_taken = 0

        # Track last action for detecting repetition
        last_action_key: str | None = None
        repeat_count = 0

        while steps_taken < self.max_steps:
            try:
                # Get next action from agent
                action = await self.agent.step(
                    page, goal,
                    action_history=history[-5:]  # Last 5 steps
                )
                taken_actions.append(action)
                steps_taken += 1

                # Check for repetitive action patterns
                action_key = f"{action.action_type}:{action.target_id}:{action.value}"
                if action_key == last_action_key:
                    repeat_count += 1
                    if repeat_count >= self.max_repeats:
                        return StageResult(
                            stage_name=stage_name,
                            status="failed",
                            steps_taken=steps_taken,
                            actions=taken_actions,
                            error=f"Action repetition detected: {action.action_type} repeated {self.max_repeats} times",
                        )
                else:
                    repeat_count = 0
                    last_action_key = action_key

                # Execute the action
                await self.agent.execute_action(page, action)

                # Accumulate thought to history
                if action.thought:
                    history.append(action.thought)

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
                    )

                # Check for human pause request
                if action.action_type == "ask_human":
                    return await self._handle_ask_human(
                        stage_name, stage_index, steps_taken, taken_actions, action, goal, history
                    )

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
                    failed_action=action if 'action' in locals() else None,
                    error_message=str(e),
                    error_type=self._classify_error(e),
                    attempt_number=2,
                    max_attempts=2,
                )

                try:
                    action = await self.agent.step_with_context(
                        page, goal,
                        retry_context=retry_ctx,
                        action_history=history[-5:]
                    )
                    taken_actions.append(action)
                    steps_taken += 1
                    await self.agent.execute_action(page, action)

                    if action.thought:
                        history.append(action.thought)

                    if action.action_type == "done":
                        return StageResult(
                            stage_name=stage_name,
                            status="success",
                            steps_taken=steps_taken,
                            actions=taken_actions,
                        )

                    if action.action_type == "ask_human":
                        return await self._handle_ask_human(
                            stage_name, stage_index, steps_taken, taken_actions, action, goal, history
                        )

                except Exception as e2:
                    get_logger().error(
                        "action_failed_after_retry",
                        stage_index=stage_index,
                        step=steps_taken,
                        error=str(e2),
                    )
                    # Retry failed, enter HITL
                    return await self._handle_step_failure(
                        stage_name, stage_index, steps_taken, taken_actions, e2, goal, history
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
            error=f"Maximum steps ({self.max_steps}) reached",
        )

    def _build_stage_goal(self, stage: dict[str, Any], history: list[str]) -> str:
        """Build an independent goal string for a stage.

        This creates a focused goal that includes the stage name and actions,
        without overwhelming the agent with the entire workflow.
        """
        stage_name = stage["name"]
        actions_list = stage.get("actions", [])
        application = stage.get("application")

        lines = [f"Complete stage: {stage_name}"]

        if application:
            lines.append(f"Application/Context: {application}")

        if actions_list:
            lines.append("\nActions to perform:")
            for i, action in enumerate(actions_list, 1):
                lines.append(f"  {i}. {action}")

        # Include recent history if available
        if history:
            lines.append("\nRecent progress:")
            for thought in history[-5:]:  # Last 5 thoughts
                lines.append(f"  - {thought[:100]}..." if len(thought) > 100 else f"  - {thought}")

        return "\n".join(lines)

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

    async def _handle_ask_human(
        self,
        stage_name: str,
        stage_index: int,
        steps_taken: int,
        taken_actions: list[AgentAction],
        action: AgentAction,
        goal: str,
        history: list[str],
    ) -> StageResult:
        """Handle ask_human action type."""
        from sasiki.engine.human_interface import HITLContext

        get_logger().info(
            "stage_paused_for_human",
            stage_index=stage_index,
            stage_name=stage_name,
            message=action.message,
        )

        # If no handler, return paused status (backwards compatible)
        if self.human_handler is None:
            return HITLDecisionMapper().map_no_handler_result(
                stage_name, steps_taken, taken_actions, error=None
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

        # Map decision to result using centralized mapper
        return HITLDecisionMapper().map_decision_to_result(
            decision=decision,
            stage_name=stage_name,
            steps_taken=steps_taken,
            taken_actions=taken_actions,
            history=history,
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
        error: Exception,
        goal: str,
        history: list[str],
    ) -> StageResult:
        """Handle step failure after retry exhaustion."""
        from sasiki.engine.human_interface import HITLContext

        # If no handler, return failed status (backwards compatible)
        if self.human_handler is None:
            return HITLDecisionMapper().map_no_handler_result(
                stage_name, steps_taken, taken_actions, error=error
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
            feedback=feedback,
            error=error,
            is_ask_human=False,
        )
