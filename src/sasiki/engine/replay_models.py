"""Data models for the Replay Agent's actions."""

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field


class AgentTarget(BaseModel):
    """Semantic target descriptor for role-based interaction."""

    role: str | None = Field(
        None,
        description="Accessible role, e.g. button/searchbox/link.",
    )
    name: str | None = Field(None, description="Accessible name for role matching.")
    element_id: str | None = Field(
        None,
        description="DOM element id fallback (e.g., search-input).",
    )
    test_id: str | None = Field(
        None,
        description="data-testid fallback.",
    )


class AgentDecision(BaseModel):
    """Agent decision model (AI-native schema with compatibility fields)."""

    thought: str = Field(..., description="Reasoning for the chosen action based on current context.")
    action_type: Literal[
        "click", "fill", "navigate", "hover", "press", "extract_text",
        "assert_visible", "ask_human", "done"
    ] = Field(..., description="The type of action to perform.")
    target: AgentTarget | None = Field(
        None,
        description="Semantic target using accessibility role and name (preferred).",
    )
    target_id: int | None = Field(
        None,
        description="Legacy node ID target from compressed tree (backward compatibility).",
    )
    value: str | None = Field(
        None,
        description="Fill text or key to press (e.g. Enter).",
    )
    message: str | None = Field(
        None,
        description="Message for ask_human or done.",
    )
    evidence: str | None = Field(
        None,
        description="Concrete evidence when declaring done.",
    )
    semantic_meaning: str | None = Field(
        None,
        description="Semantic narrative of this step.",
    )
    progress_assessment: str | None = Field(
        None,
        description="Progress assessment toward stage completion.",
    )


@dataclass
class RetryContext:
    """Retry 时的失败上下文"""
    failed_action: AgentDecision | None  # 失败的 action (forward reference)
    error_message: str                      # 错误信息
    error_type: str                         # "execution_error", "element_not_found", "navigation_error", "timeout"
    attempt_number: int                     # 当前是第几次尝试（从1开始）
    max_attempts: int                       # 最大尝试次数


class EpisodeEntry(BaseModel):
    """Structured episode memory entry for a single step."""

    step: int
    action_type: str
    target_description: str = ""
    value: str | None = None
    result: Literal["success", "failed", "skipped"]
    error: str | None = None
    page_url_before: str = ""
    page_url_after: str = ""
    dom_hash_before: str | None = None
    dom_hash_after: str | None = None
    page_changed: bool = False
    thought: str = ""
    semantic_meaning: str | None = None
    progress_assessment: str | None = None


class AgentAction(AgentDecision):
    """Backward-compatible alias for legacy code paths."""
