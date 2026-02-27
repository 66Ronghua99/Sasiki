"""WebSocket protocol definitions for Sasiki Extension <-> Python communication.

This module defines the message formats used for bidirectional communication
between the Chrome Extension (recording layer) and the Python backend
(Agent service layer).
"""

from enum import Enum
from typing import Any, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class ActionType(str, Enum):
    """Types of user actions that can be recorded."""

    CLICK = "click"
    TYPE = "type"
    SELECT = "select"
    NAVIGATE = "navigate"
    SCROLL = "scroll"
    TAB_SWITCH = "tab_switch"
    PAGE_ENTER = "page_enter"


class WSMessageType(str, Enum):
    """WebSocket message types."""

    REGISTER = "register"
    ACTION = "action"
    CONTROL = "control"
    ERROR = "error"
    ACTION_LOGGED = "action_logged"


class ElementFingerprint(BaseModel):
    """Element fingerprint for resilient element identification during replay.

    Captures semantic and contextual information about an element to enable
    reliable matching even when DOM structure changes or ref_ids differ.
    """

    model_config = ConfigDict(populate_by_name=True)

    role: str = Field(description="ARIA role of the element")
    name: str = Field(description="Accessible name/label of the element")
    tag_name: str = Field(
        validation_alias=AliasChoices("tag_name", "tagName"),
        description="HTML tag name (lowercase)",
    )
    placeholder: Optional[str] = Field(
        default=None, description="Placeholder text for input elements"
    )
    # Context for disambiguation
    parent_role: Optional[str] = Field(
        validation_alias=AliasChoices("parent_role", "parentRole"),
        default=None, description="ARIA role of parent container"
    )
    sibling_texts: list[str] = Field(
        validation_alias=AliasChoices("sibling_texts", "siblingTexts"),
        default_factory=list,
        description="Text content of sibling elements (up to 3, for disambiguation)",
    )

    def to_selector_hint(self) -> dict[str, Any]:
        """Convert to selector hint format for Playwright/Agent execution."""
        return {
            "role": self.role,
            "name_contains": self.name[:30] if self.name else None,
            "tag_name": self.tag_name.upper(),
            "placeholder": self.placeholder,
            "context": {
                "parent_role": self.parent_role,
                "sibling_texts": self.sibling_texts[:2],
            },
        }


class PageContext(BaseModel):
    """Context about the page where an action occurred."""

    model_config = ConfigDict(populate_by_name=True)

    url: str = Field(description="Page URL at time of recording")
    title: str = Field(default="", description="Page title at time of recording")
    tab_id: Optional[int] = Field(
        validation_alias=AliasChoices("tab_id", "tabId"),
        default=None, description="Extension tab ID for multi-tab workflows"
    )


class RecordedAction(BaseModel):
    """A single recorded user action.

    This is the core data structure for capturing browser interactions.
    It includes both the action details and element fingerprint for replay.
    """

    model_config = ConfigDict(populate_by_name=True)

    timestamp: int = Field(description="Unix timestamp in milliseconds")
    type: ActionType = Field(description="Type of action performed")
    session_id: Optional[str] = Field(
        validation_alias=AliasChoices("session_id", "sessionId"),
        default=None, description="Recording session ID for grouping actions"
    )
    # Element fingerprint for replay matching
    target_hint: Optional[ElementFingerprint] = Field(
        validation_alias=AliasChoices("target_hint", "targetHint"),
        default=None, description="Element fingerprint (None for page-level actions)"
    )
    # Action-specific data
    value: Optional[str] = Field(
        default=None, description="Input value for type/select actions"
    )
    url: Optional[str] = Field(
        default=None, description="Target URL for navigate actions"
    )
    scroll_direction: Optional[str] = Field(
        validation_alias=AliasChoices("scroll_direction", "scrollDirection"),
        default=None, description="Scroll direction for scroll actions"
    )
    # Navigation tracking fields
    triggers_navigation: Optional[bool] = Field(
        validation_alias=AliasChoices("triggers_navigation", "triggersNavigation"),
        default=None, description="For click actions: whether the click triggered a navigation"
    )
    triggered_by: Optional[str] = Field(
        validation_alias=AliasChoices("triggered_by", "triggeredBy"),
        default=None, description="For navigate actions: source of navigation ('click', 'url_change', 'redirect')"
    )
    is_same_tab: Optional[bool] = Field(
        validation_alias=AliasChoices("is_same_tab", "isSameTab"),
        default=None, description="Whether navigation occurred in the same tab"
    )
    # Page context
    page_context: PageContext = Field(
        validation_alias=AliasChoices("page_context", "pageContext"),
        description="Page state when action occurred",
    )

    def to_execution_step(self) -> dict[str, Any]:
        """Convert to execution step format for Skill generation."""
        step = {
            "action": self.type.value,
            "timestamp": self.timestamp,
            "page_context": self.page_context.model_dump(),
        }

        if self.target_hint:
            step["target_hint"] = self.target_hint.to_selector_hint()

        if self.value:
            step["value"] = self.value

        if self.url:
            step["url"] = self.url

        return step


class WSMessage(BaseModel):
    """WebSocket message wrapper.

    All messages between Extension and Python use this format.
    """

    type: WSMessageType = Field(description="Message type")
    payload: Any = Field(default=None, description="Message payload")
    timestamp: Optional[int] = Field(
        default=None, description="Message timestamp (ms)"
    )
    client: Optional[str] = Field(
        default=None, description="Client identifier (extension, cli, server)"
    )
    version: Optional[str] = Field(default=None, description="Protocol version")

    @classmethod
    def register(
        cls, client: str, version: str = "1.0"
    ) -> "WSMessage":
        """Create a registration message."""
        return cls(
            type=WSMessageType.REGISTER,
            client=client,
            version=version,
            timestamp=_now_ms(),
        )

    @classmethod
    def action(cls, action: RecordedAction) -> "WSMessage":
        """Create an action message from a recorded action."""
        return cls(
            type=WSMessageType.ACTION,
            payload=action.model_dump(),
            timestamp=_now_ms(),
        )

    @classmethod
    def control(cls, command: str, session_id: Optional[str] = None) -> "WSMessage":
        """Create a control message (start/stop/pause recording)."""
        payload = {"command": command}
        if session_id:
            payload["session_id"] = session_id
        return cls(
            type=WSMessageType.CONTROL,
            payload=payload,
            timestamp=_now_ms(),
        )

    @classmethod
    def action_logged(cls, action: dict[str, Any]) -> "WSMessage":
        """Create an action_logged confirmation message."""
        return cls(
            type=WSMessageType.ACTION_LOGGED,
            payload=action,
            timestamp=_now_ms(),
        )

    @classmethod
    def error(cls, message: str, details: Optional[dict] = None) -> "WSMessage":
        """Create an error message."""
        payload = {"message": message}
        if details:
            payload.update(details)
        return cls(
            type=WSMessageType.ERROR,
            payload=payload,
            timestamp=_now_ms(),
        )


def _now_ms() -> int:
    """Get current timestamp in milliseconds."""
    import time

    return int(time.time() * 1000)
