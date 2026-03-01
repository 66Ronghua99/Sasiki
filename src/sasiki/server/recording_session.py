"""Recording session management for the WebSocket server."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import structlog
from sasiki.server.websocket_protocol import RecordedAction

logger = structlog.get_logger(__name__)


class RecordingSession:
    """A single recording session that collects actions from the extension."""

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.actions: list[RecordedAction] = []
        self.started_at: datetime = datetime.now()
        self.stopped_at: Optional[datetime] = None
        self.source_url: Optional[str] = None
        self._lock = asyncio.Lock()

    async def add_action(self, action: RecordedAction) -> None:
        """Add an action to this session (thread-safe)."""
        async with self._lock:
            self.actions.append(action)
            logger.debug(
                "action_added",
                session_id=self.session_id,
                action_type=action.type.value,
                action_count=len(self.actions),
            )

    def get_action_count(self) -> int:
        """Get the number of actions recorded."""
        return len(self.actions)

    def stop(self) -> None:
        """Mark the session as stopped."""
        self.stopped_at = datetime.now()

    @property
    def duration_ms(self) -> int:
        """Get the recording duration in milliseconds."""
        end = self.stopped_at or datetime.now()
        return int((end - self.started_at).total_seconds() * 1000)

    def save(self, recordings_dir: Path) -> Path:
        """Save session to disk as JSONL file.

        Each line is a JSON object representing one action.
        """
        recordings_dir.mkdir(parents=True, exist_ok=True)

        filepath = recordings_dir / f"{self.session_id}.jsonl"

        with open(filepath, "w", encoding="utf-8") as f:
            # Write metadata as first line (commented)
            metadata = {
                "_meta": True,
                "session_id": self.session_id,
                "started_at": self.started_at.isoformat(),
                "stopped_at": self.stopped_at.isoformat() if self.stopped_at else None,
                "action_count": len(self.actions),
                "duration_ms": self.duration_ms,
            }
            f.write(json.dumps(metadata, ensure_ascii=False) + "
")

            # Write each action
            for action in self.actions:
                f.write(action.model_dump_json() + "
")

        logger.info(
            "session_saved",
            session_id=self.session_id,
            filepath=str(filepath),
            action_count=len(self.actions),
        )

        return filepath

    def to_summary(self) -> dict[str, Any]:
        """Get a summary of this session for display."""
        action_counts: dict[str, int] = {}
        for action in self.actions:
            action_counts[action.type.value] = action_counts.get(action.type.value, 0) + 1

        return {
            "session_id": self.session_id,
            "started_at": self.started_at.isoformat(),
            "duration_ms": self.duration_ms,
            "action_count": len(self.actions),
            "action_breakdown": action_counts,
        }
