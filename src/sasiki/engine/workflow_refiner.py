"""Workflow Refiner - Rehearsal execution engine for refining workflows."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from playwright.async_api import Page

from sasiki.engine.checkpoint_coordinator import CheckpointCoordinator
from sasiki.engine.human_interface import HumanInteractionHandler
from sasiki.engine.playwright_env import PlaywrightEnvironment
from sasiki.engine.refiner_state import RefineResult, RefinerState, StageResult
from sasiki.engine.replay_agent import ReplayAgent
from sasiki.engine.stage_executor import StageExecutor
from sasiki.utils.logger import get_logger
from sasiki.workflow.final_workflow_writer import FinalWorkflowWriter
from sasiki.workflow.models import Workflow


class WorkflowRefiner:
    """Refines a workflow by running it stage by stage with an Agent.

    This is the Phase 3 "Rehearsal" execution engine. It takes a draft workflow,
    runs it step by step with ReplayAgent, handles checkpoints, and produces
    a validated *_final.yaml workflow file.
    """

    def __init__(
        self,
        headless: bool = False,
        cdp_url: str | None = None,
        user_data_dir: str | None = None,
        max_steps_per_stage: int = 20,
        enable_checkpoints: bool = True,
        human_handler: HumanInteractionHandler | None = None,
    ):
        """Initialize the WorkflowRefiner.

        Args:
            headless: Run browser in headless mode
            cdp_url: Connect to existing browser via CDP (e.g., 'http://localhost:9222')
            user_data_dir: Path to Chrome user data directory for persistent profile
            max_steps_per_stage: Maximum steps before marking a stage as failed
            enable_checkpoints: Whether to pause at checkpoints for user confirmation
            human_handler: Handler for human-in-the-loop interactions.
                          If None, HITL/checkpoint will raise an error.
        """
        self.env = PlaywrightEnvironment(
            cdp_url=cdp_url,
            user_data_dir=user_data_dir,
            headless=headless,
        )
        self.agent = ReplayAgent()
        self.max_steps_per_stage = max_steps_per_stage
        self.enable_checkpoints = enable_checkpoints
        self.human_handler = human_handler
        self._history: list[str] = []

    async def run(
        self,
        workflow: Workflow,
        inputs: dict[str, str],
        start_stage: int = 0,
        output_suffix: str = "_final",
    ) -> RefineResult:
        """Execute the workflow refinement process.

        Args:
            workflow: The workflow to refine
            inputs: Variable inputs for the workflow
            start_stage: Index of stage to start from (for resuming)
            output_suffix: Suffix for the final workflow file

        Returns:
            RefineResult containing the execution status and results
        """
        get_logger().info(
            "workflow_refiner_start",
            workflow_id=str(workflow.id),
            workflow_name=workflow.name,
            start_stage=start_stage,
        )

        # Generate execution plan with resolved variables
        try:
            plan = workflow.to_execution_plan(inputs)
        except ValueError as e:
            get_logger().error("workflow_plan_failed", error=str(e))
            return RefineResult(
                workflow_id=str(workflow.id),
                workflow_name=workflow.name,
                status="failed",
                stage_results=[],
                total_steps=0,
                error=f"Failed to create execution plan: {e}",
            )

        # Start browser environment
        try:
            page = await self.env.start()
            get_logger().info("browser_started", url=page.url)
        except Exception as e:
            get_logger().error("browser_start_failed", error=str(e))
            return RefineResult(
                workflow_id=str(workflow.id),
                workflow_name=workflow.name,
                status="failed",
                stage_results=[],
                total_steps=0,
                error=f"Failed to start browser: {e}",
            )

        state = RefinerState()

        try:
            stages = plan["stages"]
            checkpoints = plan.get("checkpoints", [])

            for stage_index, stage in enumerate(stages):
                # Skip stages before start_stage
                if stage_index < start_stage:
                    get_logger().info("skipping_stage", stage_index=stage_index, stage_name=stage["name"])
                    state.add_stage_result(
                        StageResult(
                            stage_name=stage["name"],
                            status="skipped",
                            steps_taken=0,
                            actions=[],
                        )
                    )
                    continue

                # Execute the stage
                result = await self._execute_stage(page, stage, stage_index)
                state.add_stage_result(result)

                # Handle stage failure or pause
                if result.status == "failed":
                    get_logger().error(
                        "stage_failed",
                        stage_index=stage_index,
                        stage_name=stage["name"],
                        error=result.error,
                    )
                    self._skip_tail(stages, stage_index, state)
                    break

                if result.status == "paused":
                    get_logger().info(
                        "stage_paused",
                        stage_index=stage_index,
                        stage_name=stage["name"],
                    )
                    self._skip_tail(stages, stage_index, state)
                    break

                # Check for checkpoint after this stage
                coordinator = CheckpointCoordinator(
                    human_handler=self.human_handler,
                    enable_checkpoints=self.enable_checkpoints,
                )
                checkpoint = coordinator.find_checkpoint(checkpoints, stage_index)
                if checkpoint and self.enable_checkpoints:
                    should_continue, should_repeat = await coordinator.handle_checkpoint(
                        checkpoint, stage_index, result
                    )
                    if should_repeat:
                        # User wants to repeat this stage
                        # Remove the result we just added and continue without advancing
                        state.pop_last_stage_result()
                        # Mark remaining stages as skipped for now, will restart this one
                        self._skip_tail(stages, stage_index, state)
                        state.mark_paused()
                        break
                    if not should_continue:
                        state.mark_paused()
                        # Mark remaining stages as skipped
                        self._skip_tail(stages, stage_index, state)
                        break

            # Save final workflow if completed or paused (not on failure)
            final_workflow_path: Path | None = None
            if state.final_status in ("completed", "paused"):
                writer = FinalWorkflowWriter()
                final_workflow_path = writer.save(
                    workflow, state.stage_results, output_suffix
                )

            return state.build_refine_result(
                workflow_id=str(workflow.id),
                workflow_name=workflow.name,
                final_workflow_path=str(final_workflow_path) if final_workflow_path else None,
            )

        except Exception as e:
            get_logger().error("workflow_refiner_error", error=str(e))
            state.mark_failed(str(e))
            return state.build_refine_result(
                workflow_id=str(workflow.id),
                workflow_name=workflow.name,
            )

        finally:
            await self.env.stop()
            get_logger().info("browser_stopped")

    async def _execute_stage(
        self,
        page: Page,
        stage: dict[str, Any],
        stage_index: int,
    ) -> StageResult:
        """Execute a single stage using StageExecutor.

        Args:
            page: The Playwright page to interact with
            stage: The stage definition from execution plan
            stage_index: Index of the stage for logging

        Returns:
            StageResult containing the execution outcome
        """
        executor = StageExecutor(
            agent=self.agent,
            human_handler=self.human_handler,
            max_steps=self.max_steps_per_stage,
            max_repeats=3,
        )
        return await executor.execute(page, stage, stage_index, self._history)

    def _skip_tail(
        self,
        stages: list[dict[str, Any]],
        current_index: int,
        state: RefinerState,
    ) -> None:
        """Mark all stages after current_index as skipped.

        Centralizes the "skip remaining stages" logic to avoid repetition
        across failure, pause, and checkpoint branches.
        """
        state.skip_remaining_stages([
            s["name"] for s in stages[current_index + 1:]
        ])
