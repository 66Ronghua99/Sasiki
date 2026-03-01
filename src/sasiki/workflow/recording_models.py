"""Data models for browser recordings."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional


@dataclass
class RecordingMetadata:
    """Metadata from a recording session."""

    session_id: str
    started_at: datetime
    stopped_at: Optional[datetime] = None
    action_count: int = 0
    duration_ms: int = 0

    @property
    def duration_seconds(self) -> float:
        """Get duration in seconds."""
        return self.duration_ms / 1000

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "session_id": self.session_id,
            "started_at": self.started_at.isoformat(),
            "stopped_at": self.stopped_at.isoformat() if self.stopped_at else None,
            "action_count": self.action_count,
            "duration_seconds": round(self.duration_seconds, 2),
        }
