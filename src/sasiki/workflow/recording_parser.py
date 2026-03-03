"""Recording parser for converting JSONL files to structured actions.

This module handles parsing of browser recording files and converting them
into a compact narrative format suitable for LLM processing.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from sasiki.server.websocket_protocol import RecordedAction
from sasiki.utils.logger import get_logger
from sasiki.workflow.recording_models import RecordingMetadata


class RecordingParser:
    """Parser for JSONL recording files.

    Reads JSONL files, extracts metadata and actions, and converts them
    to a compact narrative format for LLM processing.
    """

    def __init__(self, filepath: Path):
        """Initialize parser with a recording file path.

        Args:
            filepath: Path to the JSONL recording file
        """
        self.filepath = Path(filepath)
        self._metadata: Optional[RecordingMetadata] = None
        self._actions: Optional[list[RecordedAction]] = None

        if not self.filepath.exists():
            raise FileNotFoundError(f"Recording file not found: {filepath}")

    def _parse_timestamp(self, ts_str: str) -> datetime:
        """Parse ISO timestamp string to datetime."""
        # Handle various ISO formats
        ts_str = ts_str.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(ts_str)
        except ValueError:
            # Fallback for different formats
            return datetime.strptime(ts_str.split("+")[0], "%Y-%m-%dT%H:%M:%S.%f")

    def parse_metadata(self) -> RecordingMetadata:
        """Parse metadata from the first line of the JSONL file.

        Returns:
            RecordingMetadata object with session information
        """
        if self._metadata is not None:
            return self._metadata

        with open(self.filepath, "r", encoding="utf-8") as f:
            first_line = f.readline().strip()

        try:
            data = json.loads(first_line)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in first line: {e}")

        if not data.get("_meta"):
            raise ValueError("First line is not metadata (missing _meta flag)")

        started_at = self._parse_timestamp(data["started_at"])
        stopped_at = None
        if data.get("stopped_at"):
            stopped_at = self._parse_timestamp(data["stopped_at"])

        self._metadata = RecordingMetadata(
            session_id=data["session_id"],
            started_at=started_at,
            stopped_at=stopped_at,
            action_count=data.get("action_count", 0),
            duration_ms=data.get("duration_ms", 0),
        )

        return self._metadata

    @property
    def metadata(self) -> RecordingMetadata:
        """Get recording metadata (parsed on first access)."""
        if self._metadata is None:
            self._metadata = self.parse_metadata()
        return self._metadata

    def parse_actions(self) -> list[RecordedAction]:
        """Parse all action records from the JSONL file.

        Returns:
            List of RecordedAction objects
        """
        if self._actions is not None:
            return self._actions

        actions: list[RecordedAction] = []

        with open(self.filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()

        # Skip first line (metadata)
        for line_num, line in enumerate(lines[1:], start=2):
            line = line.strip()
            if not line:
                continue

            try:
                data = json.loads(line)
            except json.JSONDecodeError as e:
                get_logger().warning("json_parse_error", line=line_num, error=str(e))
                continue

            # Skip metadata lines
            if data.get("_meta"):
                continue

            try:
                action = RecordedAction.model_validate(data)
                actions.append(action)
                if action.type.value == "navigate" and not action.triggered_by:
                    get_logger().warning(
                        "navigate_missing_triggered_by",
                        line=line_num,
                        page_url=action.page_context.url,
                    )
            except Exception as e:
                get_logger().warning("action_validation_error", line=line_num, error=str(e))
                continue

        self._actions = actions
        get_logger().info(
            "actions_parsed",
            filepath=str(self.filepath),
            count=len(actions),
        )
        return actions

    def _compress_target_hint(self, hint: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
        """Compress target hint by removing null/empty values.

        Args:
            hint: Raw target hint dictionary

        Returns:
            Compressed hint with only non-null values
        """
        if not hint:
            return None

        # Fields to keep if they have values
        key_fields = [
            "role",
            "name",
            "tag_name",
            "placeholder",
            "parent_role",
            "class_name",
            "class_names",
            "element_id",
            "test_id",
        ]

        compressed = {}
        for key in key_fields:
            value = hint.get(key)
            if value is not None and value != "" and value != []:
                compressed[key] = value

        # Handle sibling_texts specially - keep if non-empty
        siblings = hint.get("sibling_texts", [])
        if siblings:
            # Limit to first 2 siblings to keep compact
            compressed["sibling_texts"] = siblings[:2]

        return compressed if compressed else None

    def _select_actions(
        self, max_actions: Optional[int] = None
    ) -> tuple[list[RecordedAction], bool]:
        """Select actions with optional truncation strategy.

        Returns:
            Tuple of (selected_actions, truncated)
        """
        actions = self.parse_actions()
        if max_actions and len(actions) > max_actions:
            keep_first = max_actions // 2
            keep_last = max_actions - keep_first
            return actions[:keep_first] + actions[-keep_last:], True
        return actions, False

    def _action_to_compact_dict(self, action: RecordedAction) -> dict[str, Any]:
        """Convert action to compact dictionary for narrative.

        Args:
            action: RecordedAction to convert

        Returns:
            Compact dictionary representation
        """
        # Base fields always included
        compact: dict[str, Any] = {
            "type": action.type.value,
            "url": action.page_context.url,
        }

        # Add timestamp (relative to start could be added later)
        compact["timestamp"] = action.timestamp

        # Add page title if available
        if action.page_context.title:
            compact["page_title"] = action.page_context.title

        # Add target hint (compressed)
        target_hint = action.normalized_target_hint or action.target_hint
        if target_hint:
            hint_dict = target_hint.model_dump()
            compressed_hint = self._compress_target_hint(hint_dict)
            if compressed_hint:
                compact["target_hint"] = compressed_hint

        # Prefer explicit value; fall back to value_after for newer protocol samples.
        effective_value = action.value if action.value is not None else action.value_after
        if effective_value:
            compact["value"] = effective_value

        # Add URL for navigate actions
        if action.url and action.type.value == "navigate":
            compact["navigate_to"] = action.url

        # Add navigation trigger info
        if action.triggers_navigation is not None:
            compact["triggers_navigation"] = action.triggers_navigation

        if action.triggered_by:
            compact["triggered_by"] = action.triggered_by

        if action.page_context.frame_id:
            compact["frame_id"] = action.page_context.frame_id

        return compact

    def to_compact_narrative(self, max_actions: Optional[int] = None) -> str:
        """Convert actions to a compact narrative format for LLM processing.

        This format preserves all key information while being token-efficient.

        Args:
            max_actions: Maximum number of actions to include (None for all)

        Returns:
            Compact narrative string in structured format
        """
        actions, truncated = self._select_actions(max_actions=max_actions)
        metadata = self.metadata

        lines: list[str] = []

        # Header with metadata
        lines.append("=== Recording Summary ===")
        lines.append(f"Session: {metadata.session_id}")
        lines.append(f"Duration: {metadata.duration_seconds:.1f}s")
        lines.append(f"Total Actions: {metadata.action_count}")
        if truncated:
            lines.append(f"Showing: {len(actions)} actions (truncated)")
        lines.append("")

        # Actions in structured format (TOML-like for readability)
        lines.append("=== Actions ===")
        lines.append("")

        prev_url = ""
        for i, action in enumerate(actions, 1):
            compact = self._action_to_compact_dict(action)

            # Group by URL - only show when URL changes
            current_url = compact.get("url", "")
            if current_url and current_url != prev_url:
                lines.append(f"# Page: {current_url}")
                if compact.get("page_title"):
                    lines.append(f"# Title: {compact['page_title']}")
                prev_url = current_url

            # Action header
            action_type = compact["type"]
            lines.append(f"[[action.{i}]]")
            lines.append(f'type = "{action_type}"')

            # Add fields in consistent order
            if "target_hint" in compact:
                hint = compact["target_hint"]
                hint_str = json.dumps(hint, ensure_ascii=False, separators=(",", ":"))
                lines.append(f"target_hint = {hint_str}")

            if "value" in compact:
                value = compact["value"]
                # Escape quotes in value
                value = value.replace('"', '\\"')
                lines.append(f'value = "{value}"')

            if "navigate_to" in compact:
                lines.append(f'navigate_to = "{compact["navigate_to"]}"')

            if "triggered_by" in compact:
                lines.append(f'triggered_by = "{compact["triggered_by"]}"')

            lines.append("")

        return "\n".join(lines)

    def to_structured_packet(self, max_actions: Optional[int] = None) -> dict[str, Any]:
        """Convert actions to a structured packet for LLM semantic extraction.

        The packet preserves replay-critical fields deterministically while still
        exposing compact hints for token efficiency.
        """
        actions, truncated = self._select_actions(max_actions=max_actions)
        metadata = self.metadata
        total_actions = len(self.parse_actions())

        packet_actions: list[dict[str, Any]] = []
        page_groups: dict[str, list[int]] = {}

        for idx, action in enumerate(actions, 1):
            action_id = idx
            hint_raw = action.target_hint.model_dump() if action.target_hint else None
            raw_hint = action.raw_target_hint.model_dump() if action.raw_target_hint else None
            normalized_hint = (
                action.normalized_target_hint.model_dump()
                if action.normalized_target_hint
                else hint_raw
            )
            action_data = {
                "action_id": action_id,
                "raw": {
                    "type": action.type.value,
                    "timestamp": action.timestamp,
                    "event_id": action.event_id,
                    "trace_id": action.trace_id,
                    "parent_event_id": action.parent_event_id,
                    "value": action.value if action.value is not None else action.value_after,
                    "value_before": action.value_before,
                    "value_after": action.value_after,
                    "input_masked": action.input_masked,
                    "url": action.url,
                    "triggers_navigation": action.triggers_navigation,
                    "triggered_by": action.triggered_by,
                },
                "page_context": action.page_context.model_dump(),
                "target_hint_raw": hint_raw,
                "target_hint_compact": self._compress_target_hint(hint_raw),
                "raw_target_hint_raw": raw_hint,
                "raw_target_hint_compact": self._compress_target_hint(raw_hint),
                "normalized_target_hint_raw": normalized_hint,
                "normalized_target_hint_compact": self._compress_target_hint(normalized_hint),
            }
            packet_actions.append(action_data)

            page_key = action.page_context.url or ""
            page_groups.setdefault(page_key, []).append(action_id)

        return {
            "metadata": {
                **metadata.to_dict(),
                "selected_action_count": len(packet_actions),
                "truncated": truncated,
                "total_action_count": total_actions,
            },
            "actions": packet_actions,
            "page_groups": page_groups,
        }

    def to_json_summary(self) -> dict[str, Any]:
        """Generate a JSON-serializable summary of the recording.

        Returns:
            Dictionary with metadata and compact action list
        """
        actions = self.parse_actions()
        metadata = self.metadata

        return {
            "metadata": metadata.to_dict(),
            "actions": [self._action_to_compact_dict(a) for a in actions],
        }

    def filter_actions(
        self,
        action_types: Optional[list[str]] = None,
        url_pattern: Optional[str] = None,
    ) -> list[RecordedAction]:
        """Filter actions by criteria.

        Args:
            action_types: List of action types to include (e.g., ['click', 'type'])
            url_pattern: URL substring to match

        Returns:
            Filtered list of actions
        """
        actions = self.parse_actions()
        filtered = actions

        if action_types:
            types_lower = [t.lower() for t in action_types]
            filtered = [a for a in filtered if a.type.value in types_lower]

        if url_pattern:
            filtered = [
                a
                for a in filtered
                if url_pattern in (a.page_context.url or "")
            ]

        return filtered

    def group_by_page(self) -> dict[str, list[RecordedAction]]:
        """Group actions by page URL (hostname + path).

        Returns:
            Dictionary mapping URL patterns to action lists
        """
        from urllib.parse import urlparse

        actions = self.parse_actions()
        groups: dict[str, list[RecordedAction]] = {}

        for action in actions:
            url = action.page_context.url
            if not url:
                continue

            try:
                parsed = urlparse(url)
                # Group by hostname + base path
                key = f"{parsed.hostname}{parsed.path.split('?')[0]}"
            except Exception:
                key = url

            if key not in groups:
                groups[key] = []
            groups[key].append(action)

        return groups
