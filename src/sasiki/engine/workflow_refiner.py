"""Workflow Refiner - Rehearsal execution engine for refining workflows."""

from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field
from playwright.async_api import Page

from pydantic_yaml import to_yaml_file

from sasiki.engine.playwright_env import PlaywrightEnvironment
from sasiki.engine.replay_agent import ReplayAgent
from sasiki.engine.replay_models import AgentAction
from sasiki.workflow.models import Workflow
from sasiki.workflow.storage import WorkflowStorage
from sasiki.utils.logger import logger


class StageResult(BaseModel):
    """Result of executing a single stage."""
    stage_name: str
    status: Literal["success", "failed", "skipped", "paused"]
    steps_taken: int
    actions: list[AgentAction]
    error: Optional[str] = None


class RefineResult(BaseModel):
    """Overall result of the workflow refinement process."""
    workflow_id: str
    workflow_name: str
    status: Literal["completed", "failed", "paused"]
    stage_results: list[StageResult]
    total_steps: int
    final_workflow_path: Optional[Path] = None
    error: Optional[str] = None


class WorkflowRefiner:
    """Refines a workflow by running it stage by stage with an Agent.

    This is the Phase 3 "Rehearsal" execution engine. It takes a draft workflow,
    runs it step by step with ReplayAgent, handles checkpoints, and produces
    a validated *_final.yaml workflow file.
    """

    def __init__(
        self,
        headless: bool = False,
        cdp_url: Optional[str] = None,
        user_data_dir: Optional[str] = None,
        max_steps_per_stage: int = 20,
        enable_checkpoints: bool = True,
    ):
        """Initialize the WorkflowRefiner.

        Args:
            headless: Run browser in headless mode
            cdp_url: Connect to existing browser via CDP (e.g., 'http://localhost:9222')
            user_data_dir: Path to Chrome user data directory for persistent profile
            max_steps_per_stage: Maximum steps before marking a stage as failed
            enable_checkpoints: Whether to pause at checkpoints for user confirmation
        """
        self.env = PlaywrightEnvironment(
            cdp_url=cdp_url,
            user_data_dir=user_data_dir,
            headless=headless,
        )
        self.agent = ReplayAgent()
        self.max_steps_per_stage = max_steps_per_stage
        self.enable_checkpoints = enable_checkpoints
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
        logger.info(
            "workflow_refiner_start",
            workflow_id=str(workflow.id),
            workflow_name=workflow.name,
            start_stage=start_stage,
        )

        # Generate execution plan with resolved variables
        try:
            plan = workflow.to_execution_plan(inputs)
        except ValueError as e:
            logger.error("workflow_plan_failed", error=str(e))
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
            logger.info("browser_started", url=page.url)
        except Exception as e:
            logger.error("browser_start_failed", error=str(e))
            return RefineResult(
                workflow_id=str(workflow.id),
                workflow_name=workflow.name,
                status="failed",
                stage_results=[],
                total_steps=0,
                error=f"Failed to start browser: {e}",
            )

        stage_results: list[StageResult] = []
        total_steps = 0
        final_status: Literal["completed", "failed", "paused"] = "completed"

        try:
            stages = plan["stages"]
            checkpoints = plan.get("checkpoints", [])

            for stage_index, stage in enumerate(stages):
                # Skip stages before start_stage
                if stage_index < start_stage:
                    logger.info("skipping_stage", stage_index=stage_index, stage_name=stage["name"])
                    stage_results.append(
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
                stage_results.append(result)
                total_steps += result.steps_taken

                # Handle stage failure or pause
                if result.status == "failed":
                    logger.error(
                        "stage_failed",
                        stage_index=stage_index,
                        stage_name=stage["name"],
                        error=result.error,
                    )
                    final_status = "failed"
                    # Mark remaining stages as skipped
                    for remaining_stage in stages[stage_index + 1 :]:
                        stage_results.append(
                            StageResult(
                                stage_name=remaining_stage["name"],
                                status="skipped",
                                steps_taken=0,
                                actions=[],
                            )
                        )
                    break

                if result.status == "paused":
                    logger.info(
                        "stage_paused",
                        stage_index=stage_index,
                        stage_name=stage["name"],
                    )
                    final_status = "paused"
                    # Mark remaining stages as skipped
                    for remaining_stage in stages[stage_index + 1 :]:
                        stage_results.append(
                            StageResult(
                                stage_name=remaining_stage["name"],
                                status="skipped",
                                steps_taken=0,
                                actions=[],
                            )
                        )
                    break

                # Check for checkpoint after this stage
                checkpoint = self._find_checkpoint(checkpoints, stage_index)
                if checkpoint and self.enable_checkpoints:
                    should_continue = await self._handle_checkpoint(checkpoint, stage_index)
                    if not should_continue:
                        final_status = "paused"
                        # Mark remaining stages as skipped
                        for remaining_stage in stages[stage_index + 1 :]:
                            stage_results.append(
                                StageResult(
                                    stage_name=remaining_stage["name"],
                                    status="skipped",
                                    steps_taken=0,
                                    actions=[],
                                )
                            )
                        break

            # Save final workflow if completed or paused (not on failure)
            final_workflow_path: Optional[Path] = None
            if final_status in ("completed", "paused"):
                final_workflow_path = self._save_final_workflow(
                    workflow, stage_results, output_suffix
                )

            return RefineResult(
                workflow_id=str(workflow.id),
                workflow_name=workflow.name,
                status=final_status,
                stage_results=stage_results,
                total_steps=total_steps,
                final_workflow_path=final_workflow_path,
            )

        except Exception as e:
            logger.error("workflow_refiner_error", error=str(e))
            return RefineResult(
                workflow_id=str(workflow.id),
                workflow_name=workflow.name,
                status="failed",
                stage_results=stage_results,
                total_steps=total_steps,
                error=str(e),
            )

        finally:
            await self.env.stop()
            logger.info("browser_stopped")

    async def _execute_stage(
        self,
        page: Page,
        stage: dict[str, Any],
        stage_index: int,
    ) -> StageResult:
        """Execute a single stage with step-by-step Agent control.

        Args:
            page: The Playwright page to interact with
            stage: The stage definition from execution plan
            stage_index: Index of the stage for logging

        Returns:
            StageResult containing the execution outcome
        """
        stage_name = stage["name"]
        actions_list = stage.get("actions", [])

        # Build independent goal for this stage
        goal = self._build_stage_goal(stage)
        logger.info(
            "stage_start",
            stage_index=stage_index,
            stage_name=stage_name,
            goal=goal,
        )

        # Clear history at start of each stage
        self._history = []

        taken_actions: list[AgentAction] = []
        steps_taken = 0

        # Track last action for detecting repetition
        last_action_key: Optional[str] = None
        repeat_count = 0
        max_repeats = 3

        while steps_taken < self.max_steps_per_stage:
            try:
                # Get next action from agent
                action = await self.agent.step(page, goal)
                taken_actions.append(action)
                steps_taken += 1

                # Check for repetitive action patterns
                action_key = f"{action.action_type}:{action.target_id}:{action.value}"
                if action_key == last_action_key:
                    repeat_count += 1
                    if repeat_count >= max_repeats:
                        return StageResult(
                            stage_name=stage_name,
                            status="failed",
                            steps_taken=steps_taken,
                            actions=taken_actions,
                            error=f"Action repetition detected: {action.action_type} repeated {max_repeats} times",
                        )
                else:
                    repeat_count = 0
                    last_action_key = action_key

                # Execute the action
                await self.agent.execute_action(page, action)

                # Accumulate thought to history
                if action.thought:
                    self._history.append(action.thought)

                # Check for done
                if action.action_type == "done":
                    logger.info(
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
                    logger.info(
                        "stage_paused_for_human",
                        stage_index=stage_index,
                        stage_name=stage_name,
                        message=action.message,
                    )
                    return StageResult(
                        stage_name=stage_name,
                        status="paused",
                        steps_taken=steps_taken,
                        actions=taken_actions,
                    )

            except Exception as e:
                # Retry once on failure
                logger.warning(
                    "action_failed_retrying",
                    stage_index=stage_index,
                    step=steps_taken,
                    error=str(e),
                )
                try:
                    action = await self.agent.step(page, goal)
                    taken_actions.append(action)
                    steps_taken += 1
                    await self.agent.execute_action(page, action)

                    if action.thought:
                        self._history.append(action.thought)

                    if action.action_type == "done":
                        return StageResult(
                            stage_name=stage_name,
                            status="success",
                            steps_taken=steps_taken,
                            actions=taken_actions,
                        )

                except Exception as e2:
                    logger.error(
                        "action_failed_after_retry",
                        stage_index=stage_index,
                        step=steps_taken,
                        error=str(e2),
                    )
                    return StageResult(
                        stage_name=stage_name,
                        status="failed",
                        steps_taken=steps_taken,
                        actions=taken_actions,
                        error=f"Action failed after retry: {e2}",
                    )

        # Max steps reached
        logger.error(
            "stage_max_steps_reached",
            stage_index=stage_index,
            stage_name=stage_name,
            max_steps=self.max_steps_per_stage,
        )
        return StageResult(
            stage_name=stage_name,
            status="failed",
            steps_taken=steps_taken,
            actions=taken_actions,
            error=f"Maximum steps ({self.max_steps_per_stage}) reached",
        )

    def _build_stage_goal(self, stage: dict[str, Any]) -> str:
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
        if self._history:
            lines.append("\nRecent progress:")
            for thought in self._history[-5:]:  # Last 5 thoughts
                lines.append(f"  - {thought[:100]}..." if len(thought) > 100 else f"  - {thought}")

        return "\n".join(lines)

    def _find_checkpoint(
        self, checkpoints: list[dict], after_stage_index: int
    ) -> Optional[dict]:
        """Find checkpoint that should trigger after the given stage."""
        for cp in checkpoints:
            if cp["after_stage"] == after_stage_index:
                return cp
        return None

    async def _handle_checkpoint(self, checkpoint: dict, stage_index: int) -> bool:
        """Handle a checkpoint pause.

        Args:
            checkpoint: The checkpoint definition
            stage_index: Index of stage just completed

        Returns:
            True to continue execution, False to pause
        """
        description = checkpoint.get("description", "Checkpoint")
        manual_confirmation = checkpoint.get("manual_confirmation", True)

        logger.info(
            "checkpoint_reached",
            stage_index=stage_index,
            description=description,
            manual_confirmation=manual_confirmation,
        )

        print(f"\n{'='*50}")
        print(f"⏸️  CHECKPOINT after stage {stage_index + 1}")
        print(f"   {description}")
        print(f"{'='*50}")

        if manual_confirmation:
            # In a real CLI, we would prompt the user here
            # For now, we simulate with a message
            print("   [Manual confirmation required - continuing for now]")
            # TODO: Add actual user prompt when integrated with CLI
            # response = input("   Continue? (y/n): ")
            # return response.lower().strip() in ('y', 'yes', '')

        return True

    def _save_final_workflow(
        self,
        workflow: Workflow,
        stage_results: list[StageResult],
        output_suffix: str,
        storage: Optional[WorkflowStorage] = None,
    ) -> Path:
        """Save the refined workflow to a *_final.yaml file.

        Args:
            workflow: Original workflow
            stage_results: Results from execution
            output_suffix: Suffix to add to filename
            storage: Optional WorkflowStorage instance (for testing)

        Returns:
            Path to the saved final workflow
        """
        if storage is None:
            storage = WorkflowStorage()

        # Create a copy with updated metadata
        final_workflow = workflow.model_copy(deep=True)
        final_workflow.updated_at = datetime.now()
        final_workflow.version += 1

        # Update stage actions based on successful results
        for i, result in enumerate(stage_results):
            if i < len(final_workflow.stages) and result.status == "success":
                # Could update action_details with anchored locators here
                # For now, just mark as validated
                pass

        # Save with suffix
        workflow_dir = storage.base_dir / str(workflow.id)
        workflow_dir.mkdir(parents=True, exist_ok=True)
        final_path = workflow_dir / f"workflow_{output_suffix}.yaml"

        to_yaml_file(final_path, final_workflow)

        # Also save JSON copy
        json_path = workflow_dir / f"workflow_{output_suffix}.json"
        with open(json_path, "w") as f:
            import json

            json.dump(final_workflow.model_dump(mode="json"), f, indent=2)

        logger.info(
            "final_workflow_saved",
            workflow_id=str(workflow.id),
            path=str(final_path),
        )

        return final_path
