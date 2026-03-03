"""Stage execution engine for running a single workflow stage.

This module provides the StageExecutor class for executing individual workflow
stages with step-by-step Agent control, retry logic, and HITL handling.

Extension Point (Path B):
StageExecutor now supports pluggable ExecutionStrategy for different
execution modes (browser/api/hybrid). The default strategy is BrowserExecutionStrategy
which preserves existing browser-first behavior.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Literal

from sasiki.engine.execution_strategy import (
    BrowserExecutionStrategy,
    ExecutionContext,
    ExecutionStrategy,
)
from sasiki.engine.hitl_decision_mapper import HITLDecisionMapper
from sasiki.engine.refiner_state import StageResult
from sasiki.engine.replay_models import AgentAction, AgentDecision, EpisodeEntry, RetryContext
from sasiki.engine.stage_verifier import StageVerifier
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
    previous_world_state: str | None = None

    def build_prompt(self) -> str:
        """Build prompt text for the stage with semantic and action-level guidance."""
        lines = [f"Complete stage: {self.stage_name}"]

        if self.application:
            lines.append(f"Application/Context: {self.application}")
        if self.previous_world_state:
            lines.append(f"World state from previous stage: {self.previous_world_state}")

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
        max_stagnant_steps: int = 5,
        max_retry_attempts: int = 3,
        stage_verifier: StageVerifier | None = None,
        execution_strategy: ExecutionStrategy | None = None,
    ):
        """Initialize the stage executor.

        Args:
            agent: The ReplayAgent for making decisions
            human_handler: Handler for HITL interactions
            max_steps: Maximum steps before failing the stage
            max_repeats: Maximum repetitions of same action before failing
            max_stagnant_steps: Maximum consecutive identical dom_hash snapshots
            max_retry_attempts: Maximum attempts including initial try (L1/L2 escalation)
            stage_verifier: Optional verifier for done-evidence checks
            execution_strategy: Optional custom execution strategy. Defaults to
                BrowserExecutionStrategy for browser-first behavior (Path A).
                Use custom strategy for Path B (api/hybrid) execution modes.
        """
        self.agent = agent
        self.human_handler = human_handler
        self.max_steps = max_steps
        self.max_repeats = max_repeats
        self.max_stagnant_steps = max_stagnant_steps
        self.max_retry_attempts = max_retry_attempts
        self.stage_verifier = stage_verifier or StageVerifier()
        # Path B Extension Point: Use custom strategy for api/hybrid execution
        # Pass agent to BrowserExecutionStrategy for backward compatibility
        self.execution_strategy = execution_strategy or BrowserExecutionStrategy(agent=agent)

    async def execute(
        self,
        page: Page,
        stage: dict[str, Any],
        stage_index: int,
        history: list[str],
        previous_world_state: str | None = None,
    ) -> StageResult:
        """Execute a single stage.

        Uses the configured execution_strategy (default: BrowserExecutionStrategy)
        to observe environment state and execute AgentDecisions. This abstraction
        enables Path B extensions (API/hybrid execution modes).

        Args:
            page: The Playwright page to interact with
            stage: The stage definition from execution plan
            stage_index: Index of the stage for logging
            history: Shared history list to accumulate thoughts
            previous_world_state: Summary from previous stage

        Returns:
            StageResult containing the execution outcome
        """
        stage_name = stage["name"]
        actions_list = stage.get("actions", [])
        success_criteria = stage.get("success_criteria", "")

        # Build independent goal for this stage
        goal = self._build_stage_goal(stage, history, previous_world_state=previous_world_state)

        # Build concise summary for logging
        action_count = len(stage.get("actions", []))
        action_details_count = len(stage.get("action_details", []))
        get_logger().info(
            "stage_start",
            stage_index=stage_index,
            stage_name=stage_name,
            action_count=action_details_count or action_count,
            application=stage.get("application"),
            strategy_type=self.execution_strategy.strategy_type,
        )

        # Initialize execution strategy
        await self.execution_strategy.initialize(page)

        # Build execution context for strategy
        execution_context = ExecutionContext(
            stage_name=stage_name,
            objective=stage.get("objective", ""),
            success_criteria=success_criteria,
            context_hints=stage.get("context_hints", []),
            previous_world_state=previous_world_state,
        )

        # Clear history at start of each stage
        history.clear()

        taken_actions: list[AgentAction] = []
        episode_log: list[EpisodeEntry] = []
        steps_taken = 0

        # Track last action for detecting repetition
        last_action_key: str | None = None
        repeat_count = 0
        last_dom_hash: str | None = None
        stagnant_count = 0

        try:
            while steps_taken < self.max_steps:
                action: AgentAction | None = None
                try:
                    # Observe current state using execution strategy
                    # Path B Extension: Strategy observes environment (browser/api/hybrid)
                    observation = await self.execution_strategy.observe(
                        page, execution_context
                    )

                    # Get next action from agent
                    # Include observation summary in action history for better context
                    action_history = self._build_action_history(history, episode_log)
                    if observation.summary:
                        action_history.append(f"Current state: {observation.summary[:200]}")

                    action = await self.agent.step(
                        page,
                        goal,
                        action_history=action_history,
                    )
                    taken_actions.append(action)
                    steps_taken += 1

                    # Get dom_hash from observation for stagnation detection
                    # Fallback to _safe_dom_hash() for backward compatibility (tests)
                    current_dom_hash = observation.state_hash or self._safe_dom_hash()

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

                    # Execute the action using execution strategy
                    # Path B Extension: Strategy handles execution (browser/api/hybrid)
                    page_url_before = self._safe_page_url(page)
                    exec_result = await self.execution_strategy.execute(
                        page, action, execution_context
                    )
                    page_url_after = self._safe_page_url(page)

                    if not exec_result.success:
                        # Execution failed, raise for retry handling
                        raise RuntimeError(
                            f"Execution failed: {exec_result.error or 'unknown error'}"
                        )

                    # Update execution context with latest episode log for next observation
                    execution_context.episode_log = [
                        entry.model_dump()
                        for entry in episode_log
                    ]

                    self._record_episode(
                        episode_log=episode_log,
                        step=steps_taken,
                        action=action,
                        result="success",
                        page_url_before=page_url_before,
                        page_url_after=page_url_after,
                        dom_hash_before=current_dom_hash,
                        dom_hash_after=current_dom_hash,
                    )

                    page_changed = page_url_before != page_url_after
                    last_dom_hash, stagnant_count = self._update_stagnation(
                        current_dom_hash,
                        last_dom_hash,
                        stagnant_count,
                        page_changed=page_changed,
                    )
                    if current_dom_hash and stagnant_count >= self.max_stagnant_steps:
                        return StageResult(
                            stage_name=stage_name,
                            status="failed",
                            steps_taken=steps_taken,
                            actions=taken_actions,
                            episode_log=episode_log.copy(),
                            error=(
                                "DOM stagnation detected: "
                                f"dom_hash {current_dom_hash} unchanged for {stagnant_count} steps"
                            ),
                        )

                    # Check for done using execution strategy's completion check
                    if action.action_type == "done":
                        is_complete, evidence = await self.execution_strategy.check_completion(
                            page, success_criteria, action
                        )
                        # Also verify with stage_verifier for backward compatibility
                        verification = self.stage_verifier.verify_done(success_criteria, action)

                        if not is_complete or not verification.verified:
                            return StageResult(
                                stage_name=stage_name,
                                status="failed",
                                steps_taken=steps_taken,
                                actions=taken_actions,
                                episode_log=episode_log.copy(),
                                verification_evidence=verification.evidence or evidence,
                                error=f"Done rejected by StageVerifier: {verification.reason or 'completion criteria not met'}",
                            )
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
                            verified=verification.verified,
                            verification_evidence=verification.evidence or evidence,
                            world_state_summary=self._build_world_state_summary(
                                page, verification.evidence or evidence
                            ),
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
                    (
                        steps_taken,
                        last_dom_hash,
                        stagnant_count,
                        retry_result,
                        should_continue,
                    ) = await self._run_retry_attempts(
                        page=page,
                        goal=goal,
                        success_criteria=success_criteria,
                        stage_name=stage_name,
                        stage_index=stage_index,
                        history=history,
                        taken_actions=taken_actions,
                        episode_log=episode_log,
                        steps_taken=steps_taken,
                        last_dom_hash=last_dom_hash,
                        stagnant_count=stagnant_count,
                        failed_action=action,
                        initial_error=e,
                    )
                    if should_continue:
                        continue
                    if retry_result is not None:
                        return retry_result

        finally:
            # Cleanup execution strategy resources
            await self.execution_strategy.cleanup()

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

    def _build_stage_goal(
        self,
        stage: dict[str, Any],
        history: list[str],
        previous_world_state: str | None = None,
    ) -> str:
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
            previous_world_state=previous_world_state,
        )
        return context.build_prompt()

    def _build_world_state_summary(self, page: Page, verification_evidence: str | None) -> str:
        """Build a concise stage-end state summary for next-stage prompts."""
        current_url = self._safe_page_url(page)
        if verification_evidence:
            return f"URL: {current_url}; Evidence: {verification_evidence}"
        return f"URL: {current_url}"

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

    async def _run_retry_attempts(
        self,
        page: Page,
        goal: str,
        success_criteria: str,
        stage_name: str,
        stage_index: int,
        history: list[str],
        taken_actions: list[AgentAction],
        episode_log: list[EpisodeEntry],
        steps_taken: int,
        last_dom_hash: str | None,
        stagnant_count: int,
        failed_action: AgentAction | None,
        initial_error: Exception,
    ) -> tuple[int, str | None, int, StageResult | None, bool]:
        """Run multi-level retries and return updated loop state.

        Uses execution_strategy for action execution to support Path B extensions
        (api/hybrid execution modes).
        """
        # Build execution context for strategy
        execution_context = ExecutionContext(
            stage_name=stage_name,
            objective="",
            success_criteria=success_criteria,
            context_hints=[],
            episode_log=[entry.model_dump() for entry in episode_log],
        )

        if failed_action is not None:
            current_url = self._safe_page_url(page)
            # Get dom_hash from strategy observation if available
            observation = await self.execution_strategy.observe(page, execution_context)
            current_dom_hash = observation.state_hash
            self._record_episode(
                episode_log=episode_log,
                step=steps_taken + 1,
                action=failed_action,
                result="failed",
                error=str(initial_error),
                page_url_before=current_url,
                page_url_after=current_url,
                dom_hash_before=current_dom_hash,
                dom_hash_after=current_dom_hash,
            )

        retry_error: Exception = initial_error
        retry_failed_action: AgentAction | None = failed_action

        for attempt_number in range(2, self.max_retry_attempts + 1):
            retry_ctx = RetryContext(
                failed_action=retry_failed_action,
                error_message=str(retry_error),
                error_type=self._classify_error(retry_error),
                attempt_number=attempt_number,
                max_attempts=self.max_retry_attempts,
            )
            retry_action: AgentAction | None = None
            try:
                # Observe current state
                observation = await self.execution_strategy.observe(page, execution_context)
                current_dom_hash = observation.state_hash

                retry_action = await self.agent.step_with_context(
                    page,
                    goal,
                    retry_context=retry_ctx,
                    action_history=self._build_action_history(history, episode_log),
                )
                taken_actions.append(retry_action)
                steps_taken += 1
                page_url_before = self._safe_page_url(page)

                # Execute using execution_strategy (Path B extension point)
                exec_result = await self.execution_strategy.execute(
                    page, retry_action, execution_context
                )

                if not exec_result.success:
                    raise RuntimeError(
                        f"Retry execution failed: {exec_result.error or 'unknown error'}"
                    )

                page_url_after = self._safe_page_url(page)
                self._record_episode(
                    episode_log=episode_log,
                    step=steps_taken,
                    action=retry_action,
                    result="success",
                    page_url_before=page_url_before,
                    page_url_after=page_url_after,
                    dom_hash_before=current_dom_hash,
                    dom_hash_after=current_dom_hash,
                )

                page_changed = page_url_before != page_url_after
                last_dom_hash, stagnant_count = self._update_stagnation(
                    current_dom_hash,
                    last_dom_hash,
                    stagnant_count,
                    page_changed=page_changed,
                )
                if current_dom_hash and stagnant_count >= self.max_stagnant_steps:
                    return (
                        steps_taken,
                        last_dom_hash,
                        stagnant_count,
                        StageResult(
                            stage_name=stage_name,
                            status="failed",
                            steps_taken=steps_taken,
                            actions=taken_actions,
                            episode_log=episode_log.copy(),
                            error=(
                                "DOM stagnation detected: "
                                f"dom_hash {current_dom_hash} unchanged for {stagnant_count} steps"
                            ),
                        ),
                        False,
                    )

                if retry_action.action_type == "done":
                    # Check completion using execution_strategy
                    is_complete, evidence = await self.execution_strategy.check_completion(
                        page, success_criteria, retry_action
                    )
                    verification = self.stage_verifier.verify_done(success_criteria, retry_action)

                    if not is_complete or not verification.verified:
                        return (
                            steps_taken,
                            last_dom_hash,
                            stagnant_count,
                            StageResult(
                                stage_name=stage_name,
                                status="failed",
                                steps_taken=steps_taken,
                                actions=taken_actions,
                                episode_log=episode_log.copy(),
                                verification_evidence=verification.evidence or evidence,
                                error=f"Done rejected by StageVerifier: {verification.reason or 'completion criteria not met'}",
                            ),
                            False,
                        )
                    return (
                        steps_taken,
                        last_dom_hash,
                        stagnant_count,
                        StageResult(
                            stage_name=stage_name,
                            status="success",
                            steps_taken=steps_taken,
                            actions=taken_actions,
                            episode_log=episode_log.copy(),
                            verified=verification.verified,
                            verification_evidence=verification.evidence or evidence,
                            world_state_summary=self._build_world_state_summary(
                                page, verification.evidence or evidence
                            ),
                        ),
                        False,
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
                        return steps_taken, last_dom_hash, stagnant_count, None, True
                    return steps_taken, last_dom_hash, stagnant_count, result, False

                return steps_taken, last_dom_hash, stagnant_count, None, True

            except Exception as retry_exc:
                retry_error = retry_exc
                if retry_action is not None:
                    retry_failed_action = retry_action
                    current_url = self._safe_page_url(page)
                    observation = await self.execution_strategy.observe(page, execution_context)
                    current_dom_hash = observation.state_hash
                    self._record_episode(
                        episode_log=episode_log,
                        step=steps_taken + 1,
                        action=retry_action,
                        result="failed",
                        error=str(retry_exc),
                        page_url_before=current_url,
                        page_url_after=current_url,
                        dom_hash_before=current_dom_hash,
                        dom_hash_after=current_dom_hash,
                    )
                get_logger().warning(
                    "action_retry_attempt_failed",
                    stage_index=stage_index,
                    step=steps_taken,
                    attempt=attempt_number,
                    error=str(retry_exc),
                )

        get_logger().error(
            "action_failed_after_retry",
            stage_index=stage_index,
            step=steps_taken,
            attempts=self.max_retry_attempts,
            error=str(retry_error),
        )
        failure_result = await self._handle_step_failure(
            stage_name,
            stage_index,
            steps_taken,
            taken_actions,
            episode_log,
            retry_error,
            goal,
            history,
        )
        if failure_result == "continue":
            return steps_taken, last_dom_hash, stagnant_count, None, True
        return steps_taken, last_dom_hash, stagnant_count, failure_result, False

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
    ) -> StageResult | Literal["continue"]:
        """Handle step failure after retry exhaustion."""
        from sasiki.engine.human_interface import HITLContext, HumanDecision

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

        if decision == HumanDecision.PROVIDE_INPUT:
            if feedback:
                history.append(f"Human: {feedback}")
                get_logger().info("human_input_received_after_failure", feedback=feedback)
            return "continue"

        if decision == HumanDecision.CONTINUE:
            if feedback:
                history.append(f"Human: {feedback}")
            return "continue"

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

    def _safe_dom_hash(self) -> str | None:
        """Get latest dom_hash from execution strategy observation, if available.

        Path B Extension: For browser strategies, returns DOM hash for stagnation
        detection. For API/hybrid strategies, may return state hash or None.

        Backward Compatibility: Falls back to agent.last_dom_hash for tests.
        """
        # Get dom_hash from execution_strategy (supports both browser and Path B strategies)
        if hasattr(self.execution_strategy, "last_dom_hash"):
            dom_hash = self.execution_strategy.last_dom_hash
            if isinstance(dom_hash, str) and dom_hash:
                return dom_hash

        # Backward compatibility: fall back to agent.last_dom_hash (used in tests)
        agent_dom_hash = getattr(self.agent, "last_dom_hash", None)
        return agent_dom_hash if isinstance(agent_dom_hash, str) and agent_dom_hash else None

    def _update_stagnation(
        self,
        current_dom_hash: str | None,
        last_dom_hash: str | None,
        stagnant_count: int,
        page_changed: bool = False,
    ) -> tuple[str | None, int]:
        """Update stagnation counters based on dom_hash continuity."""
        if page_changed:
            # Navigation or URL transition is meaningful progress even if semantic
            # interactive set is similar across pages.
            return current_dom_hash or last_dom_hash, 1 if current_dom_hash else 0
        if not current_dom_hash:
            return last_dom_hash, 0
        if current_dom_hash == last_dom_hash:
            return last_dom_hash, stagnant_count + 1
        return current_dom_hash, 1

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
        dom_hash_before: str | None = None,
        dom_hash_after: str | None = None,
        error: str | None = None,
    ) -> None:
        """Append one structured episode memory entry."""
        semantic_meaning = action.semantic_meaning or self._default_semantic_meaning(action)
        progress_assessment = action.progress_assessment or self._default_progress_assessment(
            action,
            result,
            len(episode_log) + 1,
        )
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
                dom_hash_before=dom_hash_before,
                dom_hash_after=dom_hash_after,
                page_changed=page_url_before != page_url_after,
                thought=action.thought,
                semantic_meaning=semantic_meaning,
                progress_assessment=progress_assessment,
            )
        )

    def _default_semantic_meaning(self, action: AgentAction) -> str:
        """Provide deterministic semantic fallback when model omits it."""
        target = self._target_description(action)
        if target:
            return f"{action.action_type} on {target}"
        return action.action_type

    def _default_progress_assessment(
        self,
        action: AgentAction,
        result: Literal["success", "failed", "skipped"],
        step_number: int,
    ) -> str:
        """Provide deterministic progress fallback when model omits it."""
        if action.action_type == "done" and result == "success":
            return "Stage objective achieved"
        return f"Step {step_number}: {result}"
