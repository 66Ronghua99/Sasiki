"""Unit tests for observation providers."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from sasiki.engine.observation_provider import (
    BrowserUseObservationProvider,
    LegacyObservationProvider,
    create_observation_provider,
)
from sasiki.engine.page_observer import (
    AriaElement,
    AriaSnapshot,
    CompressedNode,
    LocatorInfo,
    NodeMapping,
    ObservationResult,
)


def test_create_observation_provider_factory_modes():
    legacy = create_observation_provider("legacy")
    browser_use = create_observation_provider("browser_use")

    assert legacy.snapshot_mode == "legacy"
    assert browser_use.snapshot_mode == "browser_use"


@pytest.mark.asyncio
async def test_browser_use_provider_outputs_selector_map():
    page = AsyncMock()
    page.url = "https://example.com"
    page.title = AsyncMock(return_value="Example")
    page.evaluate = AsyncMock(
        return_value=[
            {
                "idx": 1,
                "role": "button",
                "name": "Submit",
                "tag": "button",
                "class": "btn primary",
                "attrs": {"data-testid": "submit-btn"},
                "selector": '[data-testid="submit-btn"]',
            }
        ]
    )

    provider = BrowserUseObservationProvider()
    observation = await provider.observe(page)

    assert observation.snapshot_mode == "browser_use"
    assert observation.dom_hash is not None
    assert observation.selector_map[1] == '[data-testid="submit-btn"]'
    assert observation.debug_stats["interactive_count"] == 1
    assert isinstance(observation.llm_payload, dict)


@pytest.mark.asyncio
async def test_browser_use_provider_disables_hash_for_mock_url_without_elements():
    page = AsyncMock()
    page.url = AsyncMock(return_value="mock-url")
    page.title = AsyncMock(return_value="Mock Page")
    page.evaluate = AsyncMock(return_value=[])

    provider = BrowserUseObservationProvider()
    observation = await provider.observe(page)

    assert observation.snapshot_mode == "browser_use"
    assert observation.dom_hash is None
    assert observation.available_actions == []


@pytest.mark.asyncio
async def test_legacy_provider_reuses_observer_result():
    compressed_node = CompressedNode(node_id=1, role="button", name="Submit")
    node_mapping = NodeMapping(
        clean_node=compressed_node,
        raw_node={"backendDOMNodeId": 42},
        locator_args=LocatorInfo(role="button", name="Submit"),
    )
    snapshot = AriaSnapshot(
        url="https://example.com",
        title="Example",
        dom_hash="abc12345",
        interactive=[AriaElement(role="button", name="Submit")],
        readable=[AriaElement(role="text", text="Example")],
    )

    observer = MagicMock()
    observer.observe = AsyncMock(
        return_value=ObservationResult(
            compressed_tree=compressed_node,
            node_map={1: node_mapping},
            snapshot=snapshot,
        )
    )

    provider = LegacyObservationProvider(observer=observer)
    page = AsyncMock()
    observation = await provider.observe(page)

    assert observation.snapshot_mode == "legacy"
    assert observation.dom_hash == "abc12345"
    assert 1 in observation.node_map
    assert observation.selector_map[1] == '[role="button"][aria-label="Submit"]'
