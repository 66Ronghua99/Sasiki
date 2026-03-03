"""Pydantic models for LLM-based skill generation."""

from typing import Optional
from pydantic import BaseModel, Field


class SemanticStagePlan(BaseModel):
    """LLM output for a semantic stage."""

    name: str
    action_ids: list[int] = Field(default_factory=list)
    description: str = ""
    application: str = "Chrome"
    objective: str = ""
    success_criteria: str = ""
    context_hints: list[str] = Field(default_factory=list)
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)


class SemanticVariablePlan(BaseModel):
    """LLM output for a semantic variable."""

    name: str
    description: str = ""
    type: str = "text"
    example: Optional[str] = None
    required: bool = True
    default: Optional[str] = None
    options: list[str] = Field(default_factory=list)


class SemanticCheckpointPlan(BaseModel):
    """LLM output for a checkpoint."""

    after_stage: int = 0
    description: str = ""
    manual_confirmation: bool = True
    verify_outputs: list[str] = Field(default_factory=list)
    expected_state: Optional[str] = None


class SemanticPlan(BaseModel):
    """Validated semantic plan output from LLM."""

    workflow_name: str
    description: str = ""
    stages: list[SemanticStagePlan] = Field(default_factory=list)
    variables: list[SemanticVariablePlan] = Field(default_factory=list)
    checkpoints: list[SemanticCheckpointPlan] = Field(default_factory=list)
    estimated_duration_minutes: Optional[int] = None
