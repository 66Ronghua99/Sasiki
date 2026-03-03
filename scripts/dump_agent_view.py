#!/usr/bin/env python3
"""Dump what ReplayAgent can observe from the current page into a JSON file."""

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from sasiki.engine.page_observer import AccessibilityObserver, AriaSnapshot, CompressedNode
from sasiki.engine.playwright_env import PlaywrightEnvironment


def _serialize_tree(
    tree: AriaSnapshot | CompressedNode | list[CompressedNode] | dict[str, Any] | list[Any] | None,
) -> Any:
    """Convert observer payloads into JSON-serializable data."""
    if tree is None:
        return None
    if isinstance(tree, AriaSnapshot):
        return tree.model_dump(mode="json")
    if isinstance(tree, CompressedNode):
        return tree.model_dump(mode="json")
    if isinstance(tree, list) and tree and isinstance(tree[0], CompressedNode):
        return [node.model_dump(mode="json") for node in tree]
    return tree


def _serialize_for_agent_prompt(
    payload: AriaSnapshot | CompressedNode | list[CompressedNode] | dict[str, Any] | list[Any] | None,
) -> str:
    """Mirror ReplayAgent._serialize_tree output format (JSON string)."""
    if payload is None:
        return "{}"
    if isinstance(payload, AriaSnapshot):
        return payload.model_dump_json()
    if isinstance(payload, CompressedNode):
        return payload.model_dump_json()
    if isinstance(payload, dict):
        return json.dumps(payload, ensure_ascii=False)
    if isinstance(payload, list) and payload and isinstance(payload[0], CompressedNode):
        return json.dumps([node.model_dump() for node in payload], ensure_ascii=False)
    return json.dumps(payload, ensure_ascii=False)


def _with_suffix(path: str, suffix: str) -> Path:
    base = Path(path).expanduser().resolve()
    return base.with_name(f"{base.stem}{suffix}{base.suffix}")


async def _dump_state(
    page: Any,
    observer: AccessibilityObserver,
    output_path: Path,
    screenshot_path: Path | None,
    source_meta: dict[str, Any],
    max_node_preview: int,
) -> None:
    observation = await observer.observe(page)
    agent_payload_obj = observation.snapshot if observation.snapshot is not None else observation.compressed_tree
    agent_payload_json = _serialize_for_agent_prompt(agent_payload_obj)

    snapshot_data = _serialize_tree(observation.snapshot)
    tree_data = _serialize_tree(observation.compressed_tree)

    node_map_preview: list[dict[str, Any]] = []
    for node_id, mapping in sorted(observation.node_map.items())[:max_node_preview]:
        node_map_preview.append(
            {
                "node_id": node_id,
                "role": mapping.locator_args.role,
                "name": mapping.locator_args.name,
                "clean_node": mapping.clean_node.model_dump(mode="json"),
            }
        )

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            **source_meta,
            "url": page.url,
            "title": await page.title(),
        },
        "agent_visible_summary": {
            "dom_hash": (observation.snapshot.dom_hash if observation.snapshot else None),
            "interactive_count": len(observation.snapshot.interactive) if observation.snapshot else 0,
            "readable_count": len(observation.snapshot.readable) if observation.snapshot else 0,
            "node_map_size": len(observation.node_map),
        },
        "agent_payload_type": "snapshot" if observation.snapshot is not None else "compressed_tree",
        "agent_payload": _serialize_tree(agent_payload_obj),
        "agent_payload_json": agent_payload_json,
        "snapshot": snapshot_data,
        "compressed_tree": tree_data,
        "node_map_preview": node_map_preview,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved agent view: {output_path}")
    print("Summary:", json.dumps(output["agent_visible_summary"], ensure_ascii=False))

    if screenshot_path is not None:
        screenshot_path.parent.mkdir(parents=True, exist_ok=True)
        await page.screenshot(path=str(screenshot_path), full_page=True)
        print(f"Saved screenshot: {screenshot_path}")


async def _run(args: argparse.Namespace) -> None:
    env = PlaywrightEnvironment(
        cdp_url=args.cdp_url,
        user_data_dir=args.user_data_dir,
        headless=args.headless,
        auto_load_cookies=not args.no_cookies,
        cookies_dir=args.cookies_dir,
    )

    page = await env.start()
    observer = AccessibilityObserver()

    try:
        if args.url:
            await page.goto(args.url)
            try:
                await page.wait_for_load_state("networkidle", timeout=args.wait_ms)
            except Exception:
                pass

        if args.sleep_ms > 0:
            await page.wait_for_timeout(args.sleep_ms)

        source_meta = {
            "cdp_url": args.cdp_url,
            "user_data_dir": args.user_data_dir,
        }
        output_path = Path(args.output).expanduser().resolve()
        screenshot_path = Path(args.screenshot).expanduser().resolve() if args.screenshot else None

        await _dump_state(
            page=page,
            observer=observer,
            output_path=output_path,
            screenshot_path=screenshot_path,
            source_meta=source_meta,
            max_node_preview=args.max_node_preview,
        )

        if args.click_first_link_containing:
            keyword = args.click_first_link_containing
            print(f"Trying to click first link containing: {keyword}")
            clicked = False
            try:
                await page.get_by_role("link", name=keyword).first.click(timeout=args.click_timeout_ms)
                clicked = True
            except Exception:
                try:
                    await page.get_by_text(keyword, exact=False).first.click(timeout=args.click_timeout_ms)
                    clicked = True
                except Exception as exc:
                    print(f"Click failed for keyword '{keyword}': {exc}")

            if clicked:
                try:
                    await page.wait_for_load_state("domcontentloaded", timeout=args.wait_ms)
                except Exception:
                    pass
                if args.sleep_ms > 0:
                    await page.wait_for_timeout(args.sleep_ms)

                await _dump_state(
                    page=page,
                    observer=observer,
                    output_path=_with_suffix(args.output, "_after_click"),
                    screenshot_path=(
                        _with_suffix(args.screenshot, "_after_click")
                        if args.screenshot
                        else None
                    ),
                    source_meta=source_meta,
                    max_node_preview=args.max_node_preview,
                )
    finally:
        await env.stop()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export what ReplayAgent can currently observe from a page.",
    )
    parser.add_argument("--cdp-url", default=None, help="CDP URL of an existing browser.")
    parser.add_argument("--user-data-dir", default=None, help="Chrome user data dir (if not using CDP).")
    parser.add_argument("--headless", action="store_true", help="Launch browser headless (when not using CDP).")
    parser.add_argument("--url", default=None, help="Optional URL to navigate before observing.")
    parser.add_argument("--wait-ms", type=int, default=6000, help="Wait timeout after navigate for network idle.")
    parser.add_argument("--sleep-ms", type=int, default=800, help="Extra wait before observe.")
    parser.add_argument("--output", default="./agent_view_snapshot.json", help="Output JSON file path.")
    parser.add_argument("--screenshot", default=None, help="Optional full-page screenshot output path.")
    parser.add_argument(
        "--click-first-link-containing",
        default=None,
        help="After initial dump, click the first link containing this text and dump again.",
    )
    parser.add_argument(
        "--click-timeout-ms",
        type=int,
        default=15000,
        help="Timeout for clicking the target link in post-click flow.",
    )
    parser.add_argument("--cookies-dir", default=None, help="Cookie directory for non-CDP mode.")
    parser.add_argument("--no-cookies", action="store_true", help="Disable automatic cookie loading.")
    parser.add_argument("--max-node-preview", type=int, default=80, help="Max node_map preview entries in JSON.")
    args = parser.parse_args()

    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
