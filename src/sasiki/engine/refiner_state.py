"""Refiner execution state management.

This module provides the RefinerState class for tracking and managing
the execution state of a WorkflowRefiner run.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from sasiki.engine.replay_models import AgentAction, EpisodeEntry


class StageResult(BaseModel):
    """Result of executing a single stage."""

    stage_name: str
    status: Literal["success", "failed", "skipped", "paused"]
    steps_taken: int
    actions: list[AgentAction] = Field(default_factory=list)
    episode_log: list[EpisodeEntry] = Field(default_factory=list)
    verified: bool = False
    verification_evidence: str | None = None
    world_state_summary: str | None = None
    error: str | None = None


class ExecutionStageReport(BaseModel):
    """Structured execution report for a single stage."""

    stage_name: str
    status: Literal["success", "failed", "skipped", "paused"]
    steps_taken: int
    verified: bool = False
    verification_evidence: str | None = None
    world_state_summary: str | None = None
    episode_log: list[EpisodeEntry] = Field(default_factory=list)
    error: str | None = None


class ExecutionReport(BaseModel):
    """Structured execution report for a workflow run."""

    workflow_id: str
    workflow_name: str
    status: Literal["completed", "failed", "paused"]
    total_steps: int
    stages: list[ExecutionStageReport] = Field(default_factory=list)
    error: str | None = None


class RefineResult(BaseModel):
    """Overall result of the workflow refinement process."""

    workflow_id: str
    workflow_name: str
    status: Literal["completed", "failed", "paused"]
    stage_results: list[StageResult] = Field(default_factory=list)
    total_steps: int = 0
    final_workflow_path: str | None = None
    execution_report: ExecutionReport | None = None
    execution_report_path: str | None = None
    error: str | None = None


class RefinerState:
    """Manages the execution state of a WorkflowRefiner run.

    This class encapsulates all mutable state during workflow refinement,
    providing a clean interface for state transitions and queries.

    Example:
        state = RefinerState()
        state.add_stage_result(StageResult(...))
        if state.should_stop_on_failure():
            break
    """

    def __init__(self) -> None:
        """Initialize a fresh execution state."""
        self._stage_results: list[StageResult] = []
        self._total_steps: int = 0
        self._final_status: Literal["completed", "failed", "paused"] = "completed"
        self._error: str | None = None

    # --- State Transitions ---

    def add_stage_result(self, result: StageResult) -> None:
        """Add a stage result and update aggregate state."""
        self._stage_results.append(result)
        self._total_steps += result.steps_taken

        if result.status == "failed":
            self._final_status = "failed"
            self._error = result.error
        elif result.status == "paused" and self._final_status == "completed":
            self._final_status = "paused"

    def mark_failed(self, error: str) -> None:
        """Mark the entire run as failed."""
        self._final_status = "failed"
        self._error = error

    def mark_paused(self) -> None:
        """Mark the run as paused (if not already failed)."""
        if self._final_status != "failed":
            self._final_status = "paused"

    def skip_remaining_stages(self, remaining_stages: list[str]) -> None:
        """Mark remaining stages as skipped."""
        for stage_name in remaining_stages:
            self._stage_results.append(
                StageResult(
                    stage_name=stage_name,
                    status="skipped",
                    steps_taken=0,
                    actions=[],
                )
            )

    # --- State Queries ---

    @property
    def stage_results(self) -> list[StageResult]:
        """Get all stage results."""
        return self._stage_results.copy()

    @property
    def total_steps(self) -> int:
        """Get total steps taken across all stages."""
        return self._total_steps

    @property
    def final_status(self) -> Literal["completed", "failed", "paused"]:
        """Get the current final status."""
        return self._final_status

    @property
    def error(self) -> str | None:
        """Get the error message if any."""
        return self._error

    def should_stop_execution(self) -> bool:
        """Check if execution should stop (failed or paused)."""
        return self._final_status in ("failed", "paused")

    def is_failed(self) -> bool:
        """Check if the run has failed."""
        return self._final_status == "failed"

    def is_paused(self) -> bool:
        """Check if the run is paused."""
        return self._final_status == "paused"

    # --- Result Building ---

    def build_refine_result(
        self,
        workflow_id: str,
        workflow_name: str,
        final_workflow_path: str | None = None,
        execution_report: ExecutionReport | None = None,
        execution_report_path: str | None = None,
    ) -> RefineResult:
        """Build the final RefineResult from current state."""
        return RefineResult(
            workflow_id=workflow_id,
            workflow_name=workflow_name,
            status=self._final_status,
            stage_results=self._stage_results.copy(),
            total_steps=self._total_steps,
            final_workflow_path=final_workflow_path,
            execution_report=execution_report,
            execution_report_path=execution_report_path,
            error=self._error,
        )

    def build_execution_report(
        self,
        workflow_id: str,
        workflow_name: str,
    ) -> ExecutionReport:
        """Build structured execution report from current state."""
        return ExecutionReport(
            workflow_id=workflow_id,
            workflow_name=workflow_name,
            status=self._final_status,
            total_steps=self._total_steps,
            stages=[
                ExecutionStageReport(
                    stage_name=result.stage_name,
                    status=result.status,
                    steps_taken=result.steps_taken,
                    verified=result.verified,
                    verification_evidence=result.verification_evidence,
                    world_state_summary=result.world_state_summary,
                    episode_log=result.episode_log.copy(),
                    error=result.error,
                )
                for result in self._stage_results
            ],
            error=self._error,
        )

    def get_last_stage_result(self) -> StageResult | None:
        """Get the most recent stage result."""
        if not self._stage_results:
            return None
        return self._stage_results[-1]

    def pop_last_stage_result(self) -> StageResult | None:
        """Remove and return the last stage result (for checkpoint repeat)."""
        if not self._stage_results:
            return None
        result = self._stage_results.pop()
        self._total_steps -= result.steps_taken
        return result
