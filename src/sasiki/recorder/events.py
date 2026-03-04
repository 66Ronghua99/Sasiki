"""Event data models for recording sessions."""

from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class EventType(str, Enum):
    """Types of user events that can be recorded."""
    # Mouse events
    MOUSE_CLICK = "mouse_click"
    MOUSE_DOUBLE_CLICK = "mouse_double_click"
    MOUSE_DRAG = "mouse_drag"
    MOUSE_SCROLL = "mouse_scroll"

    # Keyboard events
    KEY_PRESS = "key_press"
    KEY_COMBINATION = "key_combination"  # Cmd+C, etc.
    TEXT_INPUT = "text_input"  # Batch text input

    # Window/Application events
    APP_SWITCH = "app_switch"
    WINDOW_FOCUS = "window_focus"
    WINDOW_RESIZE = "window_resize"

    # System events
    CLIPBOARD_COPY = "clipboard_copy"
    CLIPBOARD_PASTE = "clipboard_paste"
    FILE_SAVE = "file_save"
    FILE_OPEN = "file_open"

    # Composite events (detected by analyzer)
    SEARCH = "search"
    NAVIGATE = "navigate"
    SELECT_TEXT = "select_text"
    FORM_SUBMIT = "form_submit"

    # Control events
    RECORDING_START = "recording_start"
    RECORDING_STOP = "recording_stop"
    RECORDING_PAUSE = "recording_pause"


class Event(BaseModel):
    """A single event in a recording session."""

    id: UUID = Field(default_factory=uuid4)
    timestamp: datetime = Field(default_factory=datetime.now)
    event_type: EventType

    # Context
    app_name: str | None = None
    window_title: str | None = None

    # Mouse position (if applicable)
    mouse_x: int | None = None
    mouse_y: int | None = None

    # Event data
    data: dict[str, Any] = Field(default_factory=dict)
    # Examples:
    # - MOUSE_CLICK: {"button": "left"}
    # - KEY_PRESS: {"key": "enter"}
    # - TEXT_INPUT: {"text": "hello world", "duration_ms": 500}
    # - APP_SWITCH: {"from": "Chrome", "to": "Excel"}
    # - CLIPBOARD_COPY: {"content_type": "text", "content_preview": "Law article..."}

    # Screenshot reference
    screenshot_path: Path | None = None
    screenshot_timestamp: float | None = None  # Relative to recording start

    # Analysis results (populated later)
    description: str | None = None  # VLM description
    intent: str | None = None  # Classified intent


class RecordingMetadata(BaseModel):
    """Metadata for a recording session."""

    id: UUID = Field(default_factory=uuid4)
    name: str | None = None
    description: str | None = None

    created_at: datetime = Field(default_factory=datetime.now)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_seconds: float | None = None

    # Stats
    total_events: int = 0
    total_screenshots: int = 0
    apps_used: list[str] = Field(default_factory=list)

    # User annotations
    tags: list[str] = Field(default_factory=list)


class RecordingSession(BaseModel):
    """A complete recording session with events and metadata."""

    metadata: RecordingMetadata = Field(default_factory=RecordingMetadata)
    events: list[Event] = Field(default_factory=list)

    # File paths
    base_path: Path | None = None
    screenshots_dir: Path | None = None

    def add_event(self, event: Event) -> None:
        """Add an event to the session."""
        self.events.append(event)
        self.metadata.total_events = len(self.events)

    def get_events_by_type(self, event_type: EventType) -> list[Event]:
        """Get all events of a specific type."""
        return [e for e in self.events if e.event_type == event_type]

    def get_events_in_range(self, start_sec: float, end_sec: float) -> list[Event]:
        """Get events within a time range (relative to recording start)."""
        if not self.metadata.started_at:
            return []

        start_time = self.metadata.started_at.timestamp() + start_sec
        end_time = self.metadata.started_at.timestamp() + end_sec

        return [
            e for e in self.events
            if start_time <= e.timestamp.timestamp() <= end_time
        ]

    def get_app_switches(self) -> list[Event]:
        """Get application switch events - useful for stage detection."""
        return self.get_events_by_type(EventType.APP_SWITCH)
