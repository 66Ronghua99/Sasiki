"""Final workflow persistence writer.

Handles saving refined workflows to YAML/JSON files,
separating persistence logic from execution logic.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

from pydantic_yaml import to_yaml_file

from sasiki.utils.logger import get_logger

if TYPE_CHECKING:
    from sasiki.engine.refiner_state import StageResult
    from sasiki.workflow.models import Workflow

from sasiki.workflow.storage import WorkflowStorage


class FinalWorkflowWriter:
    """Writes final workflow files after refinement.

    This class encapsulates the workflow persistence logic,
    including YAML/JSON serialization and directory management.

    Example:
        writer = FinalWorkflowWriter(storage)
        path = writer.save(workflow, stage_results, "_final")
    """

    def __init__(
        self,
        storage: WorkflowStorage | None = None,
    ):
        """Initialize the workflow writer.

        Args:
            storage: Optional WorkflowStorage instance
        """
        self._storage = storage

    def save(
        self,
        workflow: Workflow,
        stage_results: list[StageResult],
        output_suffix: str = "_final",
    ) -> Path:
        """Save the refined workflow to files.

        Args:
            workflow: Original workflow
            stage_results: Results from execution
            output_suffix: Suffix to add to filename

        Returns:
            Path to the saved YAML file
        """
        storage = self._storage
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
            json.dump(final_workflow.model_dump(mode="json"), f, indent=2)

        get_logger().info(
            "final_workflow_saved",
            workflow_id=str(workflow.id),
            path=str(final_path),
        )

        return final_path

    def get_workflow_dir(self, workflow_id: str) -> Path:
        """Get the directory where workflow files are stored.

        Args:
            workflow_id: ID of the workflow

        Returns:
            Path to the workflow directory
        """
        storage = self._storage
        if storage is None:
            storage = WorkflowStorage()

        return storage.base_dir / workflow_id
