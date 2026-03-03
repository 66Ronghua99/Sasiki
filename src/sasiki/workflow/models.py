"""Workflow data models."""

from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class VariableType(str, Enum):
    """Types of workflow variables."""
    TEXT = "text"
    NUMBER = "number"
    FILE = "file"
    URL = "url"
    DATE = "date"
    CHOICE = "choice"


class WorkflowVariable(BaseModel):
    """A parameter that can be customized when running a workflow."""

    name: str
    description: str = ""
    var_type: VariableType = VariableType.TEXT
    default_value: str | None = None
    example: str | None = None
    required: bool = True

    # For choice type
    options: list[str] = Field(default_factory=list)


class WorkflowStage(BaseModel):
    """A single stage in a workflow."""

    name: str
    description: str = ""
    application: str | None = None  # e.g., "Chrome", "Excel"

    # Actions in this stage
    actions: list[str] = Field(default_factory=list)
    action_details: list[dict[str, Any]] = Field(default_factory=list)
    objective: str = ""
    success_criteria: str = ""
    context_hints: list[str] = Field(default_factory=list)
    reference_actions: list[dict[str, Any]] = Field(default_factory=list)

    # Data flow
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)

    # Execution
    estimated_duration_seconds: int | None = None

    # Visual references (from recording)
    reference_screenshot: Path | None = None


class Checkpoint(BaseModel):
    """A point in the workflow where execution pauses for verification."""

    after_stage: int  # Index of stage after which to pause
    description: str
    manual_confirmation: bool = True

    # What to verify
    verify_outputs: list[str] = Field(default_factory=list)
    expected_state: str | None = None


class Workflow(BaseModel):
    """A reusable workflow extracted from a recording session."""

    id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    # Metadata
    name: str
    description: str = ""
    tags: list[str] = Field(default_factory=list)

    # Source
    source_session_id: UUID | None = None

    # Structure
    stages: list[WorkflowStage] = Field(default_factory=list)
    variables: list[WorkflowVariable] = Field(default_factory=list)
    checkpoints: list[Checkpoint] = Field(default_factory=list)

    # Execution info
    estimated_duration_minutes: int | None = None
    success_count: int = 0
    failure_count: int = 0

    # Status
    is_active: bool = True
    version: int = 1

    def get_variable(self, name: str) -> WorkflowVariable | None:
        """Get a variable by name."""
        for var in self.variables:
            if var.name == name:
                return var
        return None

    def validate_inputs(self, inputs: dict[str, Any]) -> tuple[bool, list[str]]:
        """Validate input values against variable definitions.

        Returns (is_valid, list_of_errors).
        """
        errors = []

        for var in self.variables:
            if var.required and var.name not in inputs:
                errors.append(f"Missing required variable: {var.name}")
                continue

            if var.name in inputs and var.var_type == VariableType.CHOICE:
                if inputs[var.name] not in var.options:
                    errors.append(
                        f"Invalid value for {var.name}: must be one of {var.options}"
                    )

        return len(errors) == 0, errors

    def to_execution_plan(self, inputs: dict[str, Any]) -> dict[str, Any]:
        """Convert workflow to an executable plan with resolved variables.

        Returns an execution plan containing both human-readable actions
        and structured action_details for agent consumption.
        """
        # Validate inputs
        is_valid, errors = self.validate_inputs(inputs)
        if not is_valid:
            raise ValueError(f"Invalid inputs: {', '.join(errors)}")

        def _resolve_value(value: Any) -> Any:
            if isinstance(value, str):
                resolved_value = value
                for var_name, var_value in inputs.items():
                    placeholder = f"{{{{{var_name}}}}}"
                    resolved_value = resolved_value.replace(placeholder, str(var_value))
                return resolved_value
            if isinstance(value, list):
                return [_resolve_value(item) for item in value]
            if isinstance(value, dict):
                return {key: _resolve_value(item) for key, item in value.items()}
            return value

        # Substitute variables in actions and AI-native stage fields
        resolved_stages = []
        for stage in self.stages:
            resolved_actions = [_resolve_value(action) for action in stage.actions]

            # Resolve variables in action_details
            resolved_action_details = [_resolve_value(detail) for detail in stage.action_details]
            resolved_reference_actions = [_resolve_value(detail) for detail in stage.reference_actions]

            resolved_stages.append({
                "name": stage.name,
                "application": stage.application,
                "actions": resolved_actions,
                "action_details": resolved_action_details,
                "objective": _resolve_value(stage.objective),
                "success_criteria": _resolve_value(stage.success_criteria),
                "context_hints": _resolve_value(stage.context_hints),
                "reference_actions": resolved_reference_actions,
                "inputs": stage.inputs,
                "outputs": stage.outputs,
            })

        return {
            "workflow_id": str(self.id),
            "workflow_name": self.name,
            "stages": resolved_stages,
            "checkpoints": [
                {
                    "after_stage": cp.after_stage,
                    "description": cp.description,
                    "manual_confirmation": cp.manual_confirmation,
                }
                for cp in self.checkpoints
            ],
        }
