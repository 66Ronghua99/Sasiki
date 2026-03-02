"""Checkpoint coordination for workflow execution.

Provides checkpoint lookup and handling, separating checkpoint logic from
the main WorkflowRefiner flow.
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

from sasiki.engine.refiner_state import StageResult
from sasiki.utils.logger import get_logger

if TYPE_CHECKING:
    from sasiki.engine.human_interface import HumanInteractionHandler


class CheckpointCoordinator:
    """Coordinates checkpoint operations during workflow execution.

    This class encapsulates checkpoint lookup and handling,
    making checkpoint behavior independently testable.

    Example:
        coordinator = CheckpointCoordinator(human_handler)
        checkpoint = coordinator.find_checkpoint(checkpoints, stage_index)
        should_continue, should_repeat = await coordinator.handle_checkpoint(...)
    """

    def __init__(
        self,
        human_handler: HumanInteractionHandler | None = None,
        enable_checkpoints: bool = True,
    ):
        """Initialize the checkpoint coordinator.

        Args:
            human_handler: Handler for checkpoint interactions
            enable_checkpoints: Whether checkpoints are enabled
        """
        self.human_handler = human_handler
        self.enable_checkpoints = enable_checkpoints

    def find_checkpoint(
        self,
        checkpoints: list[dict[str, Any]],
        after_stage_index: int,
    ) -> dict[str, Any] | None:
        """Find checkpoint that should trigger after the given stage.

        Args:
            checkpoints: List of checkpoint definitions
            after_stage_index: Index of the stage just completed

        Returns:
            Checkpoint dict if found, None otherwise
        """
        for cp in checkpoints:
            if cp["after_stage"] == after_stage_index:
                return cp
        return None

    async def handle_checkpoint(
        self,
        checkpoint: dict[str, Any],
        stage_index: int,
        stage_result: StageResult,
    ) -> tuple[bool, bool]:
        """Handle a checkpoint pause.

        Args:
            checkpoint: The checkpoint definition
            stage_index: Index of stage just completed
            stage_result: Result of the completed stage

        Returns:
            (should_continue, should_repeat):
            - should_continue: Whether to continue to next stage
            - should_repeat: Whether to repeat current stage
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
            return False, True  # Don't continue, but repeat current stage

        return should_continue, False
