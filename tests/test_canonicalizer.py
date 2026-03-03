"""Tests for deterministic canonicalizer rules and diagnostics."""

from typing import Any

import pytest

from sasiki.workflow.canonicalizer import Canonicalizer


def _packet_action(
    action_id: int,
    event_type: str,
    timestamp: int,
    *,
    page_url: str = "https://example.com",
    value: str | None = None,
    target: dict[str, Any] | None = None,
    triggered_by: str | None = None,
    url: str | None = None,
) -> dict[str, Any]:
    return {
        "action_id": action_id,
        "raw": {
            "type": event_type,
            "timestamp": timestamp,
            "value": value,
            "url": url,
            "triggered_by": triggered_by,
        },
        "page_context": {
            "url": page_url,
            "title": "",
            "tab_id": 1,
        },
        "target_hint_raw": target,
        "normalized_target_hint_raw": target,
    }


def test_explicit_submit_event_maps_to_submit_intent() -> None:
    canonicalizer = Canonicalizer()
    actions, diagnostics = canonicalizer.canonicalize(
        [
            _packet_action(
                1,
                "submit",
                1000,
                page_url="https://example.com/search?keyword=boots",
                target={"role": "button", "name": "搜索", "tag_name": "button"},
            )
        ]
    )

    assert len(actions) == 1
    assert actions[0].intent_category == "submit"
    assert actions[0].action_type == "submit"
    assert actions[0].confidence == pytest.approx(1.0)
    assert diagnostics.warnings == []


def test_fill_plus_enter_emits_fill_and_submit_pair() -> None:
    canonicalizer = Canonicalizer()
    actions, _ = canonicalizer.canonicalize(
        [
            _packet_action(
                1,
                "fill",
                1000,
                value="spring outfit",
                target={"role": "textbox", "name": "Search", "tag_name": "input"},
            ),
            _packet_action(2, "press", 2500, value="Enter"),
            _packet_action(3, "navigate", 3200, page_url="https://example.com/search?keyword=spring"),
        ]
    )

    assert [action.action_type for action in actions[:2]] == ["fill", "submit"]
    assert actions[1].intent_category == "submit"
    assert set(actions[1].source_event_ids) == {1, 2}


def test_repeated_fill_on_same_target_is_merged() -> None:
    canonicalizer = Canonicalizer()
    actions, _ = canonicalizer.canonicalize(
        [
            _packet_action(
                1,
                "fill",
                1000,
                value="a",
                target={"role": "textbox", "name": "Search", "tag_name": "input"},
            ),
            _packet_action(
                2,
                "fill",
                1800,
                value="ab",
                target={"role": "textbox", "name": "Search", "tag_name": "input"},
            ),
            _packet_action(
                3,
                "fill",
                2600,
                value="abc",
                target={"role": "textbox", "name": "Search", "tag_name": "input"},
            ),
        ]
    )

    assert len(actions) == 1
    assert actions[0].action_type == "fill"
    assert actions[0].input == "abc"
    assert actions[0].source_event_ids == [1, 2, 3]


def test_navigate_redirect_generates_low_confidence_warning() -> None:
    canonicalizer = Canonicalizer()
    actions, diagnostics = canonicalizer.canonicalize(
        [
            _packet_action(
                1,
                "navigate",
                1000,
                page_url="https://example.com/explore/item/123",
                url="https://example.com/explore/item/123",
                triggered_by="redirect",
            )
        ]
    )

    assert len(actions) == 1
    assert actions[0].confidence == pytest.approx(0.80)
    assert actions[0].canonical_action_id in diagnostics.low_confidence_action_ids
    assert any(w.code == "LOW_CONFIDENCE_INTENT" for w in diagnostics.warnings)


def test_unknown_sequence_falls_back_to_other() -> None:
    canonicalizer = Canonicalizer()
    actions, _ = canonicalizer.canonicalize(
        [_packet_action(1, "scroll", 1000, page_url="https://example.com/feed")]
    )

    assert len(actions) == 1
    assert actions[0].intent_category == "other"
    assert actions[0].needs_review is True


def test_missing_postcondition_emits_warning_and_drops_action() -> None:
    canonicalizer = Canonicalizer()
    actions, diagnostics = canonicalizer.canonicalize(
        [
            _packet_action(
                1,
                "click",
                1000,
                page_url="",
                target=None,
            )
        ]
    )

    assert actions == []
    assert diagnostics.dropped_event_ids == [1]
    assert any(w.code == "MISSING_POSTCONDITION" for w in diagnostics.warnings)


def test_invalid_schema_fails_fast() -> None:
    canonicalizer = Canonicalizer()
    with pytest.raises(ValueError, match="Invalid recording action schema"):
        canonicalizer.canonicalize(
            [
                {
                    "action_id": 1,
                    "raw": {"type": "click", "timestamp": "bad-ts"},
                    "page_context": {"url": "https://example.com"},
                }
            ]
        )
