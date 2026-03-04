"""Tests for CDP browser launcher helpers."""

from sasiki.browser.launcher import is_local_cdp_endpoint, parse_cdp_port


def test_parse_cdp_port_from_endpoint() -> None:
    assert parse_cdp_port("http://localhost:9222") == 9222
    assert parse_cdp_port("ws://127.0.0.1:9233/devtools/browser/abc") == 9233
    assert parse_cdp_port("http://localhost") == 9222


def test_local_endpoint_detection() -> None:
    assert is_local_cdp_endpoint("http://localhost:9222") is True
    assert is_local_cdp_endpoint("ws://127.0.0.1:9222/devtools/browser/abc") is True
    assert is_local_cdp_endpoint("http://10.1.2.3:9222") is False
