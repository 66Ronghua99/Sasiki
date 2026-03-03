"""Observation provider abstractions for browser execution.

This module centralizes page observation so StageExecutor and ReplayAgent can
share the same observation payload in a single step.
"""

from __future__ import annotations

import hashlib
import inspect
import json
from abc import ABC, abstractmethod
from typing import Any, Literal

from playwright.async_api import Page
from pydantic import BaseModel, ConfigDict, Field

from sasiki.engine.page_observer import (
    AccessibilityObserver,
    AriaSnapshot,
    CompressedNode,
    NodeMapping,
)


class BrowserUseElement(BaseModel):
    """Single interactive element in browser-use style schema."""

    idx: int
    role: str
    name: str | None = None
    tag: str | None = None
    class_name: str | None = None
    attrs: dict[str, str] = Field(default_factory=dict)
    selector: str | None = None


class ProviderObservation(BaseModel):
    """Unified observation payload returned by ObservationProvider."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    snapshot_mode: Literal["legacy", "browser_use"]
    url: str
    title: str
    dom_hash: str | None
    summary: str
    llm_payload: Any
    node_map: dict[int, NodeMapping] = Field(default_factory=dict)
    selector_map: dict[int, str] = Field(default_factory=dict)
    available_actions: list[dict[str, Any]] = Field(default_factory=list)
    debug_stats: dict[str, int | str | None] = Field(default_factory=dict)


class ObservationProvider(ABC):
    """Abstract observation provider for execution-time page snapshots."""

    @property
    @abstractmethod
    def snapshot_mode(self) -> Literal["legacy", "browser_use"]:
        """Observation schema mode."""

    @abstractmethod
    async def observe(self, page: Page) -> ProviderObservation:
        """Capture observation for current page state."""


class LegacyObservationProvider(ObservationProvider):
    """Provider backed by AccessibilityObserver (legacy schema)."""

    def __init__(self, observer: AccessibilityObserver | None = None) -> None:
        self._observer = observer or AccessibilityObserver()

    @property
    def snapshot_mode(self) -> Literal["legacy", "browser_use"]:
        return "legacy"

    async def observe(self, page: Page) -> ProviderObservation:
        observed = await self._observer.observe(page)
        snapshot = observed.snapshot
        payload = snapshot if snapshot is not None else observed.compressed_tree

        url = snapshot.url if snapshot is not None else await _safe_page_url(page)
        title = snapshot.title if snapshot is not None else await _safe_page_title(page)
        dom_hash = snapshot.dom_hash if snapshot is not None else None

        selector_map = {
            node_id: _selector_from_locator(mapping.locator_args.role, mapping.locator_args.name)
            for node_id, mapping in observed.node_map.items()
        }

        available_actions: list[dict[str, Any]] = []
        if snapshot is not None:
            available_actions = [
                {
                    "role": elem.role,
                    "name": elem.name,
                    "value": elem.value,
                }
                for elem in snapshot.interactive
            ]

        summary = _build_summary(
            title=title,
            url=url,
            interactive=available_actions,
        )

        return ProviderObservation(
            snapshot_mode="legacy",
            url=url,
            title=title,
            dom_hash=dom_hash,
            summary=summary,
            llm_payload=payload,
            node_map=observed.node_map,
            selector_map=selector_map,
            available_actions=available_actions,
            debug_stats=_build_debug_stats(available_actions, payload),
        )


class BrowserUseObservationProvider(ObservationProvider):
    """Provider that emits browser-use style compact element schema."""

    def __init__(self, max_prompt_elements: int = 25) -> None:
        self._max_prompt_elements = max_prompt_elements

    @property
    def snapshot_mode(self) -> Literal["legacy", "browser_use"]:
        return "browser_use"

    async def observe(self, page: Page) -> ProviderObservation:
        url = await _safe_page_url(page)
        title = await _safe_page_title(page)

        raw_elements = await self._extract_browser_use_elements(page)
        if not raw_elements:
            lowered_url = url.lower()
            dom_hash = None
            if url and "mock" not in lowered_url and "asyncmock" not in lowered_url:
                dom_hash = _compute_dom_hash([f"url:{url}"])
            llm_payload: dict[str, Any] = {
                "url": url,
                "title": title,
                "dom_hash": dom_hash,
                "elements": [],
                "selector_map": {},
            }
            return ProviderObservation(
                snapshot_mode="browser_use",
                url=url,
                title=title,
                dom_hash=dom_hash,
                summary=_build_summary(title=title, url=url, interactive=[]),
                llm_payload=llm_payload,
                node_map={},
                selector_map={},
                available_actions=[],
                debug_stats=_build_debug_stats([], llm_payload),
            )

        elements = [
            BrowserUseElement(
                idx=int(item.get("idx", i + 1)),
                role=str(item.get("role") or "generic"),
                name=_normalize_optional_str(item.get("name")),
                tag=_normalize_optional_str(item.get("tag")),
                class_name=_normalize_optional_str(item.get("class")),
                attrs={
                    str(k): str(v)
                    for k, v in (item.get("attrs") or {}).items()
                    if v not in (None, "")
                },
                selector=_normalize_optional_str(item.get("selector")),
            )
            for i, item in enumerate(raw_elements)
            if isinstance(item, dict)
        ]

        selector_map = {
            elem.idx: elem.selector
            for elem in elements
            if elem.selector
        }

        dom_hash = _compute_dom_hash([
            f"{elem.role}|{elem.name or ''}|{elem.tag or ''}|{elem.class_name or ''}"
            for elem in elements
        ])

        llm_elements = elements[: self._max_prompt_elements]

        llm_payload = {
            "url": url,
            "title": title,
            "dom_hash": dom_hash,
            "elements": [
                {
                    "idx": elem.idx,
                    "role": elem.role,
                    "name": _truncate_text(elem.name, 50),
                }
                for elem in llm_elements
            ],
        }

        available_actions = [
            {
                "idx": elem.idx,
                "role": elem.role,
                "name": _truncate_text(elem.name, 50),
            }
            for elem in llm_elements
        ]

        debug_stats = _build_debug_stats(available_actions, llm_payload)
        debug_stats["raw_interactive_count"] = len(elements)
        debug_stats["llm_interactive_count"] = len(llm_elements)

        return ProviderObservation(
            snapshot_mode="browser_use",
            url=url,
            title=title,
            dom_hash=dom_hash,
            summary=_build_summary(title=title, url=url, interactive=available_actions),
            llm_payload=llm_payload,
            node_map={},
            selector_map=selector_map,
            available_actions=available_actions,
            debug_stats=debug_stats,
        )

    async def _extract_browser_use_elements(self, page: Page) -> list[dict[str, Any]]:
        """Extract compact interactive elements with stable selectors."""
        script = """
            () => {
                const toText = (value) => (typeof value === 'string' ? value.trim() : '');
                const visible = (el) => {
                    const style = window.getComputedStyle(el);
                    if (!style || style.visibility === 'hidden' || style.display === 'none') return false;
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
                };

                const inferRole = (el) => {
                    const explicit = toText(el.getAttribute('role'));
                    if (explicit) return explicit;
                    const tag = el.tagName.toLowerCase();
                    if (tag === 'a') return 'link';
                    if (tag === 'button') return 'button';
                    if (tag === 'textarea') return 'textbox';
                    if (tag === 'select') return 'combobox';
                    if (tag === 'input') {
                        const type = toText(el.getAttribute('type')).toLowerCase();
                        if (type === 'checkbox') return 'checkbox';
                        if (type === 'radio') return 'radio';
                        return 'textbox';
                    }
                    return 'generic';
                };

                const inferName = (el) => {
                    return (
                        toText(el.getAttribute('aria-label')) ||
                        toText(el.getAttribute('title')) ||
                        toText(el.getAttribute('placeholder')) ||
                        toText(el.getAttribute('alt')) ||
                        toText(el.getAttribute('data-testid')) ||
                        toText(el.innerText).slice(0, 120)
                    );
                };

                const cssEscape = (value) => {
                    if (window.CSS && typeof window.CSS.escape === 'function') {
                        return window.CSS.escape(value);
                    }
                    return value.replace(/[^a-zA-Z0-9_-]/g, '_');
                };

                const cssPath = (el) => {
                    if (el.id) return `#${cssEscape(el.id)}`;
                    const testId = toText(el.getAttribute('data-testid'));
                    if (testId) return `[data-testid="${testId.replace(/"/g, '\\"')}"]`;

                    const parts = [];
                    let current = el;
                    while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
                        const tag = current.tagName.toLowerCase();
                        const parent = current.parentElement;
                        if (!parent) {
                            parts.unshift(tag);
                            break;
                        }
                        const siblings = Array.from(parent.children).filter((n) => n.tagName === current.tagName);
                        const index = siblings.indexOf(current) + 1;
                        parts.unshift(`${tag}:nth-of-type(${index})`);
                        current = parent;
                    }
                    return parts.join(' > ');
                };

                const candidates = new Set();
                document.querySelectorAll('a,button,input,textarea,select,[role],[onclick],[data-testid],*[tabindex]').forEach((el) => {
                    if (visible(el)) candidates.add(el);
                });

                let idx = 0;
                return Array.from(candidates).map((el) => {
                    idx += 1;
                    const attrs = {};
                    ['id', 'type', 'name', 'href', 'placeholder', 'aria-label', 'data-testid', 'value'].forEach((key) => {
                        const value = el.getAttribute(key);
                        if (value) attrs[key] = value;
                    });
                    return {
                        idx,
                        role: inferRole(el),
                        name: inferName(el),
                        tag: el.tagName.toLowerCase(),
                        class: toText(el.className).slice(0, 120),
                        attrs,
                        selector: cssPath(el),
                    };
                });
            }
        """

        try:
            elements = await page.evaluate(script)
            if not isinstance(elements, list):
                return []
            return elements
        except Exception:
            return []


def create_observation_provider(
    mode: Literal["legacy", "browser_use"] = "browser_use",
) -> ObservationProvider:
    """Factory for observation providers."""
    if mode == "legacy":
        return LegacyObservationProvider()
    return BrowserUseObservationProvider()


def _compute_dom_hash(parts: list[str]) -> str:
    stable = "\n".join(sorted(parts))
    return hashlib.sha256(stable.encode("utf-8")).hexdigest()[:8]


def _build_summary(title: str, url: str, interactive: list[dict[str, Any]]) -> str:
    lines = [f"Page: {title}", f"URL: {url}"]
    if interactive:
        lines.append("Interactive elements:")
        for item in interactive[:10]:
            role = str(item.get("role", "unknown"))
            name = _normalize_optional_str(item.get("name")) or ""
            if name:
                lines.append(f"  - {role} '{name}'")
            else:
                lines.append(f"  - {role}")
        if len(interactive) > 10:
            lines.append(f"  ... and {len(interactive) - 10} more")
    return "\n".join(lines)


def _build_debug_stats(
    interactive: list[dict[str, Any]],
    payload: Any,
) -> dict[str, int | str | None]:
    payload_size = len(json.dumps(_dump_payload(payload), ensure_ascii=False))
    return {
        "interactive_count": len(interactive),
        "payload_bytes": payload_size,
    }


def _dump_payload(
    payload: Any,
) -> Any:
    if payload is None:
        return {}
    if isinstance(payload, AriaSnapshot):
        return payload.model_dump()
    if isinstance(payload, CompressedNode):
        return payload.model_dump()
    if isinstance(payload, list) and payload and isinstance(payload[0], CompressedNode):
        return [item.model_dump() for item in payload]
    return payload


def _selector_from_locator(role: str, name: str | None) -> str:
    if name:
        safe_name = name.replace('"', '\\"')
        return f'[role="{role}"][aria-label="{safe_name}"]'
    return f'[role="{role}"]'


def _normalize_optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _truncate_text(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    if len(value) <= limit:
        return value
    return value[: max(0, limit - 3)] + "..."


async def _safe_page_title(page: Page) -> str:
    title = await page.title() if hasattr(page, "title") else ""
    return str(title) if title else ""


async def _safe_page_url(page: Page) -> str:
    url = getattr(page, "url", "")
    if callable(url):
        url = url()
    if inspect.isawaitable(url):
        url = await url
    return str(url) if url else ""
