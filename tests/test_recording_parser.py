"""Tests for recording parser module."""

import json
import tempfile
from pathlib import Path

import pytest

from sasiki.workflow.recording_parser import RecordingMetadata, RecordingParser
from sasiki.server.websocket_protocol import RecordedAction, ActionType


class TestRecordingMetadata:
    """Tests for RecordingMetadata."""

    def test_duration_seconds(self):
        """Test duration calculation."""
        from datetime import datetime

        metadata = RecordingMetadata(
            session_id="test",
            started_at=datetime.now(),
            duration_ms=5500,
        )
        assert metadata.duration_seconds == 5.5

    def test_to_dict(self):
        """Test conversion to dictionary."""
        from datetime import datetime

        metadata = RecordingMetadata(
            session_id="test_123",
            started_at=datetime(2024, 1, 1, 12, 0, 0),
            stopped_at=datetime(2024, 1, 1, 12, 1, 30),
            action_count=10,
            duration_ms=90000,
        )
        d = metadata.to_dict()
        assert d["session_id"] == "test_123"
        assert d["action_count"] == 10
        assert d["duration_seconds"] == 90.0


class TestRecordingParser:
    """Tests for RecordingParser."""

    @pytest.fixture
    def sample_recording(self):
        """Create a sample recording file."""
        metadata = {
            "_meta": True,
            "session_id": "test_session",
            "started_at": "2024-01-01T12:00:00.000000",
            "stopped_at": "2024-01-01T12:01:30.000000",
            "action_count": 2,
            "duration_ms": 90000,
        }

        action1 = {
            "timestamp": 1704110400000,
            "type": "navigate",
            "session_id": "test_session",
            "page_context": {
                "url": "https://example.com",
                "title": "Example",
                "tab_id": 123,
            },
            "url": "https://example.com",
            "triggered_by": "url_change",
        }

        action2 = {
            "timestamp": 1704110401000,
            "type": "click",
            "session_id": "test_session",
            "page_context": {
                "url": "https://example.com/page",
                "title": "Example Page",
                "tab_id": 123,
            },
            "target_hint": {
                "role": "button",
                "name": "Submit",
                "tag_name": "button",
                "placeholder": None,
                "parent_role": None,
                "sibling_texts": [],
            },
            "triggers_navigation": False,
        }

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".jsonl", delete=False
        ) as f:
            f.write(json.dumps(metadata) + "\n")
            f.write(json.dumps(action1) + "\n")
            f.write(json.dumps(action2) + "\n")
            return Path(f.name)

    def test_init_file_not_found(self):
        """Test parser raises error for non-existent file."""
        with pytest.raises(FileNotFoundError):
            RecordingParser(Path("/nonexistent/file.jsonl"))

    def test_parse_metadata(self, sample_recording):
        """Test metadata parsing."""
        parser = RecordingParser(sample_recording)
        metadata = parser.parse_metadata()

        assert metadata.session_id == "test_session"
        assert metadata.action_count == 2
        assert metadata.duration_ms == 90000

    def test_parse_actions(self, sample_recording):
        """Test action parsing."""
        parser = RecordingParser(sample_recording)
        actions = parser.parse_actions()

        assert len(actions) == 2
        assert actions[0].type == ActionType.NAVIGATE
        assert actions[1].type == ActionType.CLICK
        assert actions[1].target_hint.name == "Submit"

    def test_to_compact_narrative(self, sample_recording):
        """Test narrative generation."""
        parser = RecordingParser(sample_recording)
        narrative = parser.to_compact_narrative()

        assert "=== Recording Summary ===" in narrative
        assert "test_session" in narrative
        assert "navigate" in narrative
        assert "click" in narrative
        # target_hint should be compressed (no null values)
        assert '"role":"button"' in narrative
        assert '"name":"Submit"' in narrative
        assert "placeholder" not in narrative or '"placeholder":null' not in narrative

    def test_to_compact_narrative_truncation(self, sample_recording):
        """Test narrative truncation."""
        parser = RecordingParser(sample_recording)
        narrative = parser.to_compact_narrative(max_actions=1)

        assert "truncated" in narrative
        assert "=== Actions ===" in narrative

    def test_to_json_summary(self, sample_recording):
        """Test JSON summary generation."""
        parser = RecordingParser(sample_recording)
        summary = parser.to_json_summary()

        assert summary["metadata"]["session_id"] == "test_session"
        assert len(summary["actions"]) == 2
        assert summary["actions"][0]["type"] == "navigate"

    def test_filter_actions_by_type(self, sample_recording):
        """Test filtering actions by type."""
        parser = RecordingParser(sample_recording)
        clicks = parser.filter_actions(action_types=["click"])

        assert len(clicks) == 1
        assert clicks[0].type == ActionType.CLICK

    def test_filter_actions_by_url(self, sample_recording):
        """Test filtering actions by URL pattern."""
        parser = RecordingParser(sample_recording)
        filtered = parser.filter_actions(url_pattern="/page")

        assert len(filtered) == 1
        assert "/page" in filtered[0].page_context.url

    def test_group_by_page(self, sample_recording):
        """Test grouping actions by page."""
        parser = RecordingParser(sample_recording)
        groups = parser.group_by_page()

        # Should have 2 groups (example.com and example.com/page)
        assert len(groups) == 2
        keys = list(groups.keys())
        assert any("example.com" in k for k in keys)

    def teardown_method(self):
        """Clean up temp files."""
        # Note: tempfile cleanup happens automatically on process exit
        pass
