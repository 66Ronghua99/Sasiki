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
from sasiki.engine.replay_models import AgentAction, RetryContext
from sasiki.engine.human_interface import HumanInteractionHandler, HITLContext, HumanDecision
from sasiki.workflow.models import Workflow
from sasiki.workflow.storage import WorkflowStorage
from sasiki.utils.logger import get_logger


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
        human_handler: Optional[HumanInteractionHandler] = None,
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

        stage_results: list[StageResult] = []
        total_steps = 0
        final_status: Literal["completed", "failed", "paused"] = "completed"

        try:
            stages = plan["stages"]
            checkpoints = plan.get("checkpoints", [])

            for stage_index, stage in enumerate(stages):
                # Skip stages before start_stage
                if stage_index < start_stage:
                    get_logger().info("skipping_stage", stage_index=stage_index, stage_name=stage["name"])
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
                    get_logger().error(
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
                    get_logger().info(
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
                    should_continue, should_repeat = await self._handle_checkpoint(
                        checkpoint, stage_index, result
                    )
                    if should_repeat:
                        # User wants to repeat this stage
                        # Remove the result we just added and continue without advancing
                        stage_results.pop()
                        # Mark remaining stages as skipped for now, will restart this one
                        for remaining_stage in stages[stage_index + 1 :]:
                            stage_results.append(
                                StageResult(
                                    stage_name=remaining_stage["name"],
                                    status="skipped",
                                    steps_taken=0,
                                    actions=[],
                                )
                            )
                        final_status = "paused"
                        break
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
            get_logger().error("workflow_refiner_error", error=str(e))
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
            get_logger().info("browser_stopped")

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
        get_logger().info(
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
                action = await self.agent.step(
                    page, goal,
                    action_history=self._history[-5:]  # 最近5步
                )
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
                        stage_name, stage_index, steps_taken, taken_actions, action, goal
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
                        action_history=self._history[-5:]
                    )
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

                    if action.action_type == "ask_human":
                        return await self._handle_ask_human(
                            stage_name, stage_index, steps_taken, taken_actions, action, goal
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
                        stage_name, stage_index, steps_taken, taken_actions, e2, goal
                    )

        # Max steps reached
        get_logger().error(
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

    def _classify_error(self, error: Exception) -> str:
        """分类错误类型，用于 retry 策略。

        Args:
            error: 发生的异常

        Returns:
            错误类型字符串
        """
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
    ) -> StageResult:
        """Handle ask_human action type.

        Args:
            stage_name: Name of the current stage
            stage_index: Index of the current stage
            steps_taken: Number of steps taken so far
            taken_actions: List of actions taken in this stage
            action: The ask_human action
            goal: The current goal

        Returns:
            StageResult based on user decision
        """
        get_logger().info(
            "stage_paused_for_human",
            stage_index=stage_index,
            stage_name=stage_name,
            message=action.message,
        )

        # If no handler, return paused status (backwards compatible)
        if self.human_handler is None:
            return StageResult(
                stage_name=stage_name,
                status="paused",
                steps_taken=steps_taken,
                actions=taken_actions,
            )

        # Build HITL context
        hitl_context = HITLContext(
            stage_name=stage_name,
            stage_index=stage_index,
            step_number=steps_taken,
            agent_message=action.message,
            last_action=action,
            current_goal=goal,
            history=self._history[-5:],
        )

        # Wait for user decision
        decision, feedback = await self.human_handler.handle_hitl_pause(hitl_context)

        if decision == HumanDecision.ABORT:
            return StageResult(
                stage_name=stage_name,
                status="failed",
                steps_taken=steps_taken,
                actions=taken_actions,
                error="Aborted by user",
            )
        elif decision == HumanDecision.SKIP_STAGE:
            return StageResult(
                stage_name=stage_name,
                status="skipped",
                steps_taken=steps_taken,
                actions=taken_actions,
            )
        elif decision == HumanDecision.RETRY:
            # Mark as success but with retry flag - the caller should repeat this stage
            # For now, we return paused and let the user resume with start_stage
            return StageResult(
                stage_name=stage_name,
                status="paused",
                steps_taken=steps_taken,
                actions=taken_actions,
                error="Retry requested - resume with --start-stage",
            )
        elif decision == HumanDecision.CONTINUE:
            if feedback:
                self._history.append(f"Human: {feedback}")
            # Continue execution from this point
            return StageResult(
                stage_name=stage_name,
                status="paused",
                steps_taken=steps_taken,
                actions=taken_actions,
                error="Continue requested - manual intervention required",
            )
        elif decision == HumanDecision.PROVIDE_INPUT:
            if feedback:
                self._history.append(f"Human: {feedback}")
            return StageResult(
                stage_name=stage_name,
                status="paused",
                steps_taken=steps_taken,
                actions=taken_actions,
                error="Input provided - manual intervention required",
            )

        return StageResult(
            stage_name=stage_name,
            status="paused",
            steps_taken=steps_taken,
            actions=taken_actions,
        )

    async def _handle_step_failure(
        self,
        stage_name: str,
        stage_index: int,
        steps_taken: int,
        taken_actions: list[AgentAction],
        error: Exception,
        goal: str,
    ) -> StageResult:
        """Handle step failure after retry exhaustion.

        Args:
            stage_name: Name of the current stage
            stage_index: Index of the current stage
            steps_taken: Number of steps taken so far
            taken_actions: List of actions taken in this stage
            error: The error that caused the failure
            goal: The current goal

        Returns:
            StageResult based on user decision or default failure
        """
        # If no handler, return failed status (backwards compatible)
        if self.human_handler is None:
            return StageResult(
                stage_name=stage_name,
                status="failed",
                steps_taken=steps_taken,
                actions=taken_actions,
                error=f"Action failed after retry: {error}",
            )

        # Build HITL context with error information
        hitl_context = HITLContext(
            stage_name=stage_name,
            stage_index=stage_index,
            step_number=steps_taken,
            error_message=str(error),
            last_action=taken_actions[-1] if taken_actions else None,
            current_goal=goal,
            history=self._history[-5:],
        )

        # Wait for user decision
        decision, feedback = await self.human_handler.handle_hitl_pause(hitl_context)

        if decision == HumanDecision.ABORT:
            return StageResult(
                stage_name=stage_name,
                status="failed",
                steps_taken=steps_taken,
                actions=taken_actions,
                error=f"Aborted by user after: {error}",
            )
        elif decision == HumanDecision.SKIP_STAGE:
            return StageResult(
                stage_name=stage_name,
                status="skipped",
                steps_taken=steps_taken,
                actions=taken_actions,
            )
        elif decision == HumanDecision.RETRY:
            # Return paused status - user should resume with start_stage
            return StageResult(
                stage_name=stage_name,
                status="paused",
                steps_taken=steps_taken,
                actions=taken_actions,
                error=f"Retry requested after: {error}",
            )
        elif decision == HumanDecision.CONTINUE or decision == HumanDecision.PROVIDE_INPUT:
            if feedback:
                self._history.append(f"Human: {feedback}")
            return StageResult(
                stage_name=stage_name,
                status="paused",
                steps_taken=steps_taken,
                actions=taken_actions,
                error=f"Continue requested after: {error}",
            )

        return StageResult(
            stage_name=stage_name,
            status="failed",
            steps_taken=steps_taken,
            actions=taken_actions,
            error=f"Action failed after retry: {error}",
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

    async def _handle_checkpoint(
        self,
        checkpoint: dict,
        stage_index: int,
        stage_result: StageResult,
    ) -> tuple[bool, bool]:  # (should_continue, should_repeat_stage)
        """Handle a checkpoint pause.

        Args:
            checkpoint: The checkpoint definition
            stage_index: Index of stage just completed
            stage_result: Result of the completed stage

        Returns:
            (should_continue, should_repeat): 是否继续执行，是否重试当前 stage
        """
        description = checkpoint.get("description", "Checkpoint")
        manual_confirmation = checkpoint.get("manual_confirmation", True)

        get_logger().info(
            "checkpoint_reached",
            stage_index=stage_index,
            stage_name=stage_result.stage_name,
            description=description,
            manual_confirmation=manual_confirmation,
        )

        # If no handler, return default behavior (backwards compatible)
        if self.human_handler is None:
            print(f"\n{'='*50}")
            print(f"⏸️  CHECKPOINT after stage {stage_index + 1}")
            print(f"   {description}")
            print(f"{'='*50}")
            print("   [No handler configured - continuing]")
            return True, False

        # Use the handler for checkpoint interaction
        should_continue, action = await self.human_handler.handle_checkpoint(
            stage_index=stage_index,
            stage_name=stage_result.stage_name,
            description=description,
            manual_confirmation=manual_confirmation,
        )

        if action == "repeat":
            return False, True  # 不继续，但重试当前 stage

        return should_continue, False

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

        get_logger().info(
            "final_workflow_saved",
            workflow_id=str(workflow.id),
            path=str(final_path),
        )

        return final_path
