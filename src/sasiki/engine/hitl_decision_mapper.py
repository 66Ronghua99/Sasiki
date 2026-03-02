"""HITL (Human-in-the-Loop) decision mapper.

Centralizes the mapping of human decisions to StageResult objects,
eliminating duplicate logic between ask_human and step_failure handlers.
"""

from __future__ import annotations

from sasiki.engine.human_interface import HumanDecision
from sasiki.engine.refiner_state import StageResult
from sasiki.engine.replay_models import AgentAction


class HITLDecisionMapper:
    """Maps human decisions to StageResult objects.

    This class centralizes the decision-to-result mapping logic that was
    previously duplicated in _handle_ask_human and _handle_step_failure methods.

    Example:
        mapper = HITLDecisionMapper()
        result = mapper.map_decision_to_result(
            decision=HumanDecision.ABORT,
            context={...}
        )
    """

    def map_decision_to_result(
        self,
        decision: HumanDecision,
        stage_name: str,
        steps_taken: int,
        taken_actions: list[AgentAction],
        history: list[str],
        feedback: str | None = None,
        error: Exception | None = None,
        is_ask_human: bool = False,
    ) -> StageResult:
        """Map a human decision to a StageResult.

        Args:
            decision: The human's decision
            stage_name: Name of the current stage
            steps_taken: Number of steps taken so far
            taken_actions: List of actions taken in this stage
            history: Shared history list (may be modified for CONTINUE/INPUT)
            feedback: Optional feedback from the human
            error: The error that caused failure (if applicable)
            is_ask_human: Whether this was triggered by ask_human (vs failure)

        Returns:
            StageResult based on the decision
        """
        error_prefix = "Aborted by user" if is_ask_human else f"Aborted by user after: {error}"
        continue_prefix = "Continue requested" if is_ask_human else f"Continue requested after: {error}"
        retry_prefix = "Retry requested" if is_ask_human else f"Retry requested after: {error}"
        input_prefix = "Input provided" if is_ask_human else f"Continue requested after: {error}"

        if decision == HumanDecision.ABORT:
            return StageResult(
                stage_name=stage_name,
                status="failed",
                steps_taken=steps_taken,
                actions=taken_actions,
                error=error_prefix,
            )

        elif decision == HumanDecision.SKIP_STAGE:
            return StageResult(
                stage_name=stage_name,
                status="skipped",
                steps_taken=steps_taken,
                actions=taken_actions,
            )

        elif decision == HumanDecision.RETRY:
            return StageResult(
                stage_name=stage_name,
                status="paused",
                steps_taken=steps_taken,
                actions=taken_actions,
                error=f"{retry_prefix} - resume with --start-stage",
            )

        elif decision == HumanDecision.CONTINUE:
            if feedback:
                history.append(f"Human: {feedback}")
            return StageResult(
                stage_name=stage_name,
                status="paused",
                steps_taken=steps_taken,
                actions=taken_actions,
                error=f"{continue_prefix} - manual intervention required",
            )

        elif decision == HumanDecision.PROVIDE_INPUT:
            if feedback:
                history.append(f"Human: {feedback}")
            return StageResult(
                stage_name=stage_name,
                status="paused",
                steps_taken=steps_taken,
                actions=taken_actions,
                error=f"{input_prefix} - manual intervention required",
            )

        # Default fallback
        return StageResult(
            stage_name=stage_name,
            status="paused",
            steps_taken=steps_taken,
            actions=taken_actions,
        )

    def map_no_handler_result(
        self,
        stage_name: str,
        steps_taken: int,
        taken_actions: list[AgentAction],
        error: Exception | None = None,
    ) -> StageResult:
        """Get default result when no handler is configured.

        Args:
            stage_name: Name of the current stage
            steps_taken: Number of steps taken so far
            taken_actions: List of actions taken in this stage
            error: The error that caused failure (if applicable)

        Returns:
            StageResult with paused or failed status
        """
        if error:
            return StageResult(
                stage_name=stage_name,
                status="failed",
                steps_taken=steps_taken,
                actions=taken_actions,
                error=f"Action failed after retry: {error}",
            )
        else:
            return StageResult(
                stage_name=stage_name,
                status="paused",
                steps_taken=steps_taken,
                actions=taken_actions,
            )
