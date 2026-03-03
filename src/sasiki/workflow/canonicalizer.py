"""Deterministic Raw Event -> Canonical Action converter."""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Literal, cast
from urllib.parse import parse_qsl, urlparse

from sasiki.workflow.canonical_models import (
    CanonicalAction,
    CanonicalDiagnostics,
    CanonicalWarning,
    PostconditionSpec,
    RetryHint,
    TargetFallback,
    TargetLocator,
    TargetStrategy,
)


@dataclass(frozen=True)
class NormalizedEvent:
    """Internal normalized raw event."""

    action_id: int
    source_event_ids: list[int]
    event_type: str
    timestamp: int
    value: str | None
    url_target: str | None
    page_url: str
    triggered_by: str | None
    tab_id: int | None
    target: dict[str, Any] | None


class Canonicalizer:
    """Convert parser actions into deterministic canonical actions."""

    _TYPE_ALIAS = {
        "type": "fill",
        "select": "fill",
    }

    _SUBMIT_LEXICON = {
        "搜索",
        "提交",
        "确认",
        "发送",
        "search",
        "submit",
        "confirm",
        "send",
    }

    _OPEN_ROLES = {"link", "listitem", "article", "card"}

    _NAV_CONFIDENCE = {
        "direct": 0.95,
        "click": 0.90,
        "submit": 0.90,
        "redirect": 0.80,
        "url_change": 0.70,
    }

    def canonicalize(
        self,
        raw_actions: list[dict[str, Any]],
    ) -> tuple[list[CanonicalAction], CanonicalDiagnostics]:
        """Build canonical actions and diagnostics from parser packet actions."""
        self._validate_raw_schema(raw_actions)
        diagnostics = CanonicalDiagnostics()

        normalized = [self._normalize_raw_action(raw_action) for raw_action in raw_actions]
        merged = self._merge_fill_events(normalized)

        actions: list[CanonicalAction] = []
        idx = 0
        while idx < len(merged):
            event = merged[idx]
            next_event = merged[idx + 1] if idx + 1 < len(merged) else None
            consumed_next = False

            if event.event_type == "submit":
                self._emit(
                    actions=actions,
                    diagnostics=diagnostics,
                    source_event_ids=event.source_event_ids,
                    event=event,
                    action_type="submit",
                    intent_category="submit",
                    intent_label="explicit_submit",
                    confidence=1.00,
                    preconditions=[],
                    postcondition_hint_event=next_event,
                )
            elif event.event_type == "fill" and next_event and self._is_press_enter(event, next_event):
                self._emit(
                    actions=actions,
                    diagnostics=diagnostics,
                    source_event_ids=event.source_event_ids,
                    event=event,
                    action_type="fill",
                    intent_category="interact",
                    intent_label="fill_input",
                    confidence=0.88,
                    preconditions=[],
                    postcondition_hint_event=next_event,
                )
                self._emit(
                    actions=actions,
                    diagnostics=diagnostics,
                    source_event_ids=event.source_event_ids + next_event.source_event_ids,
                    event=next_event,
                    action_type="submit",
                    intent_category="submit",
                    intent_label="press_enter_submit",
                    confidence=0.95,
                    preconditions=self._build_fill_preconditions(event),
                    postcondition_hint_event=merged[idx + 2] if idx + 2 < len(merged) else None,
                )
                consumed_next = True
            elif event.event_type == "fill" and next_event and self._is_click_submit(event, next_event):
                self._emit(
                    actions=actions,
                    diagnostics=diagnostics,
                    source_event_ids=event.source_event_ids,
                    event=event,
                    action_type="fill",
                    intent_category="interact",
                    intent_label="fill_input",
                    confidence=0.88,
                    preconditions=[],
                    postcondition_hint_event=next_event,
                )
                self._emit(
                    actions=actions,
                    diagnostics=diagnostics,
                    source_event_ids=event.source_event_ids + next_event.source_event_ids,
                    event=next_event,
                    action_type="submit",
                    intent_category="submit",
                    intent_label="click_submit_button",
                    confidence=0.90,
                    preconditions=self._build_fill_preconditions(event),
                    postcondition_hint_event=merged[idx + 2] if idx + 2 < len(merged) else None,
                )
                consumed_next = True
            elif event.event_type == "navigate":
                triggered_by = (event.triggered_by or "").lower()
                confidence = self._NAV_CONFIDENCE.get(triggered_by, 0.70)
                self._emit(
                    actions=actions,
                    diagnostics=diagnostics,
                    source_event_ids=event.source_event_ids,
                    event=event,
                    action_type="navigate",
                    intent_category="navigate",
                    intent_label="navigate_page",
                    confidence=confidence,
                    preconditions=[],
                    postcondition_hint_event=next_event,
                )
            elif event.event_type == "click" and self._is_open_content(event, next_event):
                self._emit(
                    actions=actions,
                    diagnostics=diagnostics,
                    source_event_ids=event.source_event_ids,
                    event=event,
                    action_type="click",
                    intent_category="open",
                    intent_label="open_content_item",
                    confidence=0.85,
                    preconditions=[],
                    postcondition_hint_event=next_event,
                )
            elif event.event_type == "click":
                self._emit(
                    actions=actions,
                    diagnostics=diagnostics,
                    source_event_ids=event.source_event_ids,
                    event=event,
                    action_type="click",
                    intent_category="interact",
                    intent_label="click_interaction",
                    confidence=0.86,
                    preconditions=[],
                    postcondition_hint_event=next_event,
                )
            elif event.event_type == "fill":
                self._emit(
                    actions=actions,
                    diagnostics=diagnostics,
                    source_event_ids=event.source_event_ids,
                    event=event,
                    action_type="fill",
                    intent_category="interact",
                    intent_label="fill_input",
                    confidence=0.88,
                    preconditions=[],
                    postcondition_hint_event=next_event,
                )
            else:
                self._emit(
                    actions=actions,
                    diagnostics=diagnostics,
                    source_event_ids=event.source_event_ids,
                    event=event,
                    action_type="other",
                    intent_category="other",
                    intent_label="unclassified",
                    confidence=0.50,
                    preconditions=[],
                    postcondition_hint_event=next_event,
                )

            idx += 2 if consumed_next else 1

        return actions, diagnostics

    def _validate_raw_schema(self, raw_actions: list[dict[str, Any]]) -> None:
        errors: list[str] = []
        for index, action in enumerate(raw_actions):
            action_id = action.get("action_id")
            if not isinstance(action_id, int):
                errors.append(f"actions[{index}].action_id must be int")

            raw = action.get("raw")
            if not isinstance(raw, dict):
                errors.append(f"actions[{index}].raw must be object")
                continue

            if not isinstance(raw.get("type"), str):
                errors.append(f"actions[{index}].raw.type must be string")
            if not isinstance(raw.get("timestamp"), int):
                errors.append(f"actions[{index}].raw.timestamp must be int")

            page_context = action.get("page_context")
            if not isinstance(page_context, dict):
                errors.append(f"actions[{index}].page_context must be object")
            elif "url" not in page_context:
                errors.append(f"actions[{index}].page_context.url is required")

        if errors:
            raise ValueError("Invalid recording action schema: " + "; ".join(errors))

    def _normalize_raw_action(self, raw_action: dict[str, Any]) -> NormalizedEvent:
        raw = raw_action["raw"]
        event_type_raw = str(raw["type"]).lower()
        event_type = self._TYPE_ALIAS.get(event_type_raw, event_type_raw)

        page_context = raw_action["page_context"]
        page_url = str(page_context.get("url") or "")
        tab_id_raw = page_context.get("tab_id")
        tab_id = int(tab_id_raw) if isinstance(tab_id_raw, int) else None

        target = (
            raw_action.get("normalized_target_hint_raw")
            or raw_action.get("target_hint_raw")
            or raw_action.get("normalized_target_hint_compact")
            or raw_action.get("target_hint_compact")
        )
        if target is not None and not isinstance(target, dict):
            target = None

        return NormalizedEvent(
            action_id=int(raw_action["action_id"]),
            source_event_ids=[int(raw_action["action_id"])],
            event_type=event_type,
            timestamp=int(raw["timestamp"]),
            value=raw.get("value"),
            url_target=raw.get("url"),
            page_url=page_url,
            triggered_by=raw.get("triggered_by"),
            tab_id=tab_id,
            target=target,
        )

    def _merge_fill_events(self, events: list[NormalizedEvent]) -> list[NormalizedEvent]:
        if not events:
            return []

        merged: list[NormalizedEvent] = []
        for event in events:
            if not merged:
                merged.append(event)
                continue

            previous = merged[-1]
            if (
                previous.event_type == "fill"
                and event.event_type == "fill"
                and self._same_target(previous, event)
                and self._same_tab(previous, event)
                and event.timestamp - previous.timestamp <= 2000
            ):
                merged_event = replace(
                    previous,
                    source_event_ids=previous.source_event_ids + event.source_event_ids,
                    timestamp=event.timestamp,
                    value=event.value or previous.value,
                    page_url=event.page_url or previous.page_url,
                )
                merged[-1] = merged_event
                continue

            merged.append(event)

        return merged

    def _emit(
        self,
        *,
        actions: list[CanonicalAction],
        diagnostics: CanonicalDiagnostics,
        source_event_ids: list[int],
        event: NormalizedEvent,
        action_type: str,
        intent_category: str,
        intent_label: str,
        confidence: float,
        preconditions: list[PostconditionSpec],
        postcondition_hint_event: NormalizedEvent | None,
    ) -> None:
        adjusted_intent, adjusted_label, adjusted_confidence, needs_review = self._apply_confidence_policy(
            intent_category=intent_category,
            intent_label=intent_label,
            confidence=confidence,
        )
        target_strategy = self._build_target_strategy(event=event, action_type=action_type)
        postconditions = self._build_postconditions(
            event=event,
            action_type=action_type,
            target_strategy=target_strategy,
            hint_event=postcondition_hint_event,
        )
        if not postconditions:
            diagnostics.warnings.append(
                CanonicalWarning(
                    code="MISSING_POSTCONDITION",
                    message=f"No postcondition can be built for action_type={action_type}",
                    event_ids=source_event_ids.copy(),
                )
            )
            diagnostics.dropped_event_ids.extend(source_event_ids)
            return

        canonical_id = f"can_{len(actions) + 1:03d}"
        canonical_action = CanonicalAction(
            action_id=len(actions) + 1,
            canonical_action_id=canonical_id,
            source_event_ids=source_event_ids,
            intent_category=cast(
                Literal[
                    "search",
                    "open",
                    "filter",
                    "interact",
                    "navigate",
                    "submit",
                    "extract",
                    "assert",
                    "other",
                ],
                self._safe_intent_category(adjusted_intent),
            ),
            intent_label=adjusted_label,
            action_type=cast(
                Literal["click", "fill", "navigate", "press", "submit", "other"],
                self._safe_action_type(action_type),
            ),
            target_strategy=target_strategy,
            input=event.value if action_type in {"fill", "press"} else None,
            preconditions=preconditions,
            postconditions=postconditions,
            retry_hint=self._build_retry_hint(action_type=action_type),
            confidence=adjusted_confidence,
            needs_review=needs_review,
            page_url=event.page_url,
            triggered_by=event.triggered_by,
        )
        actions.append(canonical_action)

        if 0.60 <= adjusted_confidence < 0.85:
            diagnostics.warnings.append(
                CanonicalWarning(
                    code="LOW_CONFIDENCE_INTENT",
                    message=(
                        f"Low confidence intent={canonical_action.intent_category} "
                        f"confidence={adjusted_confidence:.2f}"
                    ),
                    event_ids=source_event_ids.copy(),
                    canonical_action_id=canonical_id,
                )
            )
            diagnostics.low_confidence_action_ids.append(canonical_id)
        elif adjusted_confidence < 0.60:
            diagnostics.low_confidence_action_ids.append(canonical_id)

    def _build_target_strategy(self, *, event: NormalizedEvent, action_type: str) -> TargetStrategy:
        target = event.target or {}
        locator = TargetLocator(
            role=self._string_or_none(target.get("role")),
            name=self._string_or_none(target.get("name")),
            tag_name=self._string_or_none(target.get("tag_name")),
            test_id=self._string_or_none(target.get("test_id")),
            element_id=self._string_or_none(target.get("element_id")),
            class_names=self._list_of_strings(target.get("class_names")),
        )
        preferred = locator if self._has_locator(locator) else None

        fallbacks: list[TargetFallback] = []
        if action_type == "submit":
            fallbacks.append(TargetFallback(type="press", value="Enter"))
        if action_type == "navigate":
            fallbacks.append(TargetFallback(type="navigate_retry", value="reload"))
        if action_type == "click":
            fallbacks.append(TargetFallback(type="click_retry", value="scroll_into_view"))

        return TargetStrategy(preferred=preferred, fallbacks=fallbacks)

    def _build_fill_preconditions(self, event: NormalizedEvent) -> list[PostconditionSpec]:
        target = self._target_locator_from_event(event)
        if not target or not target.role or not target.name or event.value is None:
            return []
        return [
            PostconditionSpec(
                type="value_equals",
                role=target.role,
                name=target.name,
                value=event.value,
            )
        ]

    def _build_postconditions(
        self,
        *,
        event: NormalizedEvent,
        action_type: str,
        target_strategy: TargetStrategy,
        hint_event: NormalizedEvent | None,
    ) -> list[PostconditionSpec]:
        if action_type == "fill":
            target = target_strategy.preferred
            if target and target.role and target.name and event.value is not None:
                return [
                    PostconditionSpec(
                        type="value_equals",
                        role=target.role,
                        name=target.name,
                        value=event.value,
                    )
                ]
            return []

        if action_type == "submit":
            url_fragment = self._submit_url_fragment(event=event, hint_event=hint_event)
            if url_fragment:
                return [PostconditionSpec(type="url_contains", value=url_fragment)]
            target = target_strategy.preferred
            if target and target.role and target.name:
                return [
                    PostconditionSpec(type="element_visible", role=target.role, name=target.name)
                ]
            return [PostconditionSpec(type="count_at_least", role="listitem", min_count=1)]

        if action_type == "click":
            if hint_event and hint_event.event_type == "navigate":
                fragment = self._extract_url_fragment(hint_event.url_target or hint_event.page_url)
                if fragment:
                    return [PostconditionSpec(type="url_contains", value=fragment)]
            target = target_strategy.preferred
            if target and target.role and target.name:
                return [PostconditionSpec(type="element_visible", role=target.role, name=target.name)]
            return []

        if action_type == "navigate":
            fragment = self._extract_url_fragment(event.url_target or event.page_url)
            if fragment:
                return [PostconditionSpec(type="url_contains", value=fragment)]
            return []

        fragment = self._extract_url_fragment(event.page_url)
        if fragment:
            return [PostconditionSpec(type="url_contains", value=fragment)]
        return [PostconditionSpec(type="count_at_least", role="listitem", min_count=1)]

    def _build_retry_hint(self, *, action_type: str) -> RetryHint:
        if action_type == "submit":
            return RetryHint(max_attempts=2, fallback_order=["press_enter", "click_submit_button"])
        if action_type == "fill":
            return RetryHint(max_attempts=2, fallback_order=["focus_and_refill"])
        if action_type == "click":
            return RetryHint(max_attempts=2, fallback_order=["scroll_into_view", "retry_click"])
        if action_type == "navigate":
            return RetryHint(max_attempts=2, fallback_order=["retry_navigate", "refresh_page"])
        return RetryHint(max_attempts=1, fallback_order=[])

    def _apply_confidence_policy(
        self,
        *,
        intent_category: str,
        intent_label: str,
        confidence: float,
    ) -> tuple[str, str, float, bool]:
        if confidence < 0.60:
            return "other", "unclassified", confidence, True
        return intent_category, intent_label, confidence, False

    def _is_press_enter(self, fill_event: NormalizedEvent, next_event: NormalizedEvent) -> bool:
        if fill_event.event_type != "fill" or next_event.event_type != "press":
            return False
        if not self._within_window(fill_event, next_event, 2000):
            return False
        value = (next_event.value or "").strip().lower()
        return value in {"enter", "keyenter"}

    def _is_click_submit(self, fill_event: NormalizedEvent, next_event: NormalizedEvent) -> bool:
        if fill_event.event_type != "fill" or next_event.event_type != "click":
            return False
        if not self._within_window(fill_event, next_event, 2000):
            return False
        target = next_event.target or {}
        role = (target.get("role") or "").strip().lower()
        name = (target.get("name") or "").strip().lower()
        if role != "button":
            return False
        return name in {word.lower() for word in self._SUBMIT_LEXICON}

    def _is_open_content(
        self,
        click_event: NormalizedEvent,
        next_event: NormalizedEvent | None,
    ) -> bool:
        if click_event.event_type != "click" or next_event is None:
            return False
        if next_event.event_type != "navigate":
            return False
        if not self._within_window(click_event, next_event, 3000):
            return False
        role = ((click_event.target or {}).get("role") or "").strip().lower()
        if role not in self._OPEN_ROLES:
            return False
        return self._looks_like_content_url(next_event.url_target or next_event.page_url)

    def _submit_url_fragment(
        self,
        *,
        event: NormalizedEvent,
        hint_event: NormalizedEvent | None,
    ) -> str | None:
        if hint_event and hint_event.event_type == "navigate":
            return self._extract_url_fragment(hint_event.url_target or hint_event.page_url)
        return self._extract_url_fragment(event.page_url)

    def _extract_url_fragment(self, url: str) -> str | None:
        if not url:
            return None
        parsed = urlparse(url)
        if parsed.query:
            first_key, first_value = next(iter(parse_qsl(parsed.query, keep_blank_values=True)))
            if first_key:
                return f"{first_key}={first_value}" if first_value else first_key
        path = (parsed.path or "").strip("/")
        if path:
            return path.split("/")[-1]
        return parsed.netloc or None

    def _looks_like_content_url(self, url: str) -> bool:
        if not url:
            return False
        parsed = urlparse(url)
        path = (parsed.path or "").lower()
        if any(token in path for token in ["/explore/", "/item/", "/post/", "/note/", "/p/"]):
            return True
        if any(key in parsed.query.lower() for key in ["id=", "note_id=", "post_id="]):
            return True
        segments = [segment for segment in path.split("/") if segment]
        return len(segments) >= 2 and "search" not in path

    def _same_target(self, left: NormalizedEvent, right: NormalizedEvent) -> bool:
        return self._target_signature(left.target) == self._target_signature(right.target)

    def _target_signature(self, target: dict[str, Any] | None) -> str:
        if not target:
            return ""
        parts = [
            str(target.get("role") or ""),
            str(target.get("name") or ""),
            str(target.get("tag_name") or ""),
            str(target.get("element_id") or ""),
            str(target.get("test_id") or ""),
        ]
        return "|".join(parts)

    def _same_tab(self, left: NormalizedEvent, right: NormalizedEvent) -> bool:
        return left.tab_id == right.tab_id

    def _within_window(self, left: NormalizedEvent, right: NormalizedEvent, max_gap_ms: int) -> bool:
        if right.timestamp < left.timestamp:
            return False
        return (right.timestamp - left.timestamp) <= max_gap_ms and self._same_tab(left, right)

    def _target_locator_from_event(self, event: NormalizedEvent) -> TargetLocator | None:
        target = event.target or {}
        locator = TargetLocator(
            role=self._string_or_none(target.get("role")),
            name=self._string_or_none(target.get("name")),
            tag_name=self._string_or_none(target.get("tag_name")),
            test_id=self._string_or_none(target.get("test_id")),
            element_id=self._string_or_none(target.get("element_id")),
            class_names=self._list_of_strings(target.get("class_names")),
        )
        return locator if self._has_locator(locator) else None

    def _has_locator(self, locator: TargetLocator) -> bool:
        return any([locator.role, locator.name, locator.tag_name, locator.test_id, locator.element_id])

    def _safe_intent_category(self, value: str) -> str:
        allowed = {"search", "open", "filter", "interact", "navigate", "submit", "extract", "assert", "other"}
        return value if value in allowed else "other"

    def _safe_action_type(self, value: str) -> str:
        allowed = {"click", "fill", "navigate", "press", "submit", "other"}
        return value if value in allowed else "other"

    def _string_or_none(self, value: Any) -> str | None:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return None

    def _list_of_strings(self, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        result: list[str] = []
        for item in value:
            if isinstance(item, str) and item.strip():
                result.append(item.strip())
        return result
