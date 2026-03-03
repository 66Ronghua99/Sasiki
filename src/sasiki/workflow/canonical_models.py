"""Canonical action models for deterministic semantic generation."""

from typing import Literal

from pydantic import BaseModel, Field


class PostconditionSpec(BaseModel):
    """Structured postcondition contract consumed by verifier/generator."""

    type: Literal[
        "url_contains",
        "url_not_contains",
        "element_visible",
        "element_not_visible",
        "text_contains",
        "count_at_least",
        "value_equals",
    ]
    value: str | None = None
    role: str | None = None
    name: str | None = None
    min_count: int | None = None
    timeout_ms: int = 3000
    poll_interval_ms: int = 200
    settle_ms: int = 300


class TargetLocator(BaseModel):
    """Semantic target descriptor used by role/name execution."""

    role: str | None = None
    name: str | None = None
    tag_name: str | None = None
    test_id: str | None = None
    element_id: str | None = None
    class_names: list[str] = Field(default_factory=list)


class TargetFallback(BaseModel):
    """Fallback strategy for unstable targets."""

    type: Literal["press", "selector", "click_retry", "navigate_retry"]
    value: str


class TargetStrategy(BaseModel):
    """Preferred semantic locator plus deterministic fallback list."""

    preferred: TargetLocator | None = None
    fallbacks: list[TargetFallback] = Field(default_factory=list)


class RetryHint(BaseModel):
    """Retry policy hints for executor/refiner."""

    max_attempts: int = 2
    fallback_order: list[str] = Field(default_factory=list)


class CanonicalAction(BaseModel):
    """Single-source semantic action consumed by generator."""

    action_id: int = Field(description="Stable integer id for LLM stage references.")
    canonical_action_id: str
    source_event_ids: list[int] = Field(default_factory=list)
    intent_category: Literal[
        "search",
        "open",
        "filter",
        "interact",
        "navigate",
        "submit",
        "extract",
        "assert",
        "other",
    ]
    intent_label: str
    action_type: Literal["click", "fill", "navigate", "press", "submit", "other"]
    target_strategy: TargetStrategy = Field(default_factory=TargetStrategy)
    input: str | None = None
    preconditions: list[PostconditionSpec] = Field(default_factory=list)
    postconditions: list[PostconditionSpec] = Field(default_factory=list)
    retry_hint: RetryHint = Field(default_factory=RetryHint)
    evidence_refs: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    needs_review: bool = False
    page_url: str = ""
    triggered_by: str | None = None


class CanonicalWarning(BaseModel):
    """Canonicalization warning item."""

    code: str
    message: str
    event_ids: list[int] = Field(default_factory=list)
    canonical_action_id: str | None = None


class CanonicalDiagnostics(BaseModel):
    """Diagnostics emitted during canonical conversion."""

    warnings: list[CanonicalWarning] = Field(default_factory=list)
    dropped_event_ids: list[int] = Field(default_factory=list)
    low_confidence_action_ids: list[str] = Field(default_factory=list)
