"""End-to-end tests for Phase 1 browser recording WebSocket flow."""

import asyncio
import json
from pathlib import Path

import pytest
import websockets

from sasiki.server.websocket_server import WebSocketServer


async def _recv_until(
    ws, expected_type: str, timeout: float = 3.0
) -> dict:
    """Receive messages until a specific type appears."""
    end_time = asyncio.get_event_loop().time() + timeout
    while True:
        remain = end_time - asyncio.get_event_loop().time()
        if remain <= 0:
            raise TimeoutError(f"Timed out waiting for message type={expected_type}")
        raw = await asyncio.wait_for(ws.recv(), timeout=remain)
        data = json.loads(raw)
        if data.get("type") == expected_type:
            return data


@pytest.mark.asyncio
async def test_phase1_websocket_recording_flow(tmp_path: Path, unused_tcp_port: int):
    """Extension -> server -> recording file path should work end-to-end."""
    recordings_dir = tmp_path / "recordings"
    server = WebSocketServer(host="localhost", port=unused_tcp_port, recordings_dir=recordings_dir)
    server_task = asyncio.create_task(server.start())
    await asyncio.sleep(0.2)

    extension_ws = None
    cli_ws = None
    try:
        extension_ws = await websockets.connect(f"ws://localhost:{unused_tcp_port}")
        await extension_ws.send(json.dumps({"type": "register", "client": "extension"}))

        cli_ws = await websockets.connect(f"ws://localhost:{unused_tcp_port}")
        await cli_ws.send(json.dumps({"type": "register", "client": "cli"}))

        await cli_ws.send(
            json.dumps(
                {
                    "type": "control",
                    "command": "start",
                    "session_id": "e2e_test_001",
                }
            )
        )
        start_resp = await _recv_until(cli_ws, "control_response")
        assert start_resp["success"] is True
        assert start_resp["command"] == "start"
        assert start_resp["session_id"] == "e2e_test_001"

        await extension_ws.send(
            json.dumps(
                {
                    "type": "action",
                    "payload": {
                        "timestamp": 1730000000000,
                        "type": "click",
                        "sessionId": "e2e_test_001",
                        "targetHint": {
                            "role": "button",
                            "name": "搜索",
                            "tagName": "button",
                            "parentRole": "search",
                            "siblingTexts": ["推荐"],
                        },
                        "pageContext": {
                            "url": "https://www.xiaohongshu.com",
                            "title": "小红书",
                            "tabId": 1,
                        },
                    },
                }
            )
        )

        # CLI should receive action_logged push.
        action_msg = await _recv_until(cli_ws, "action_logged")
        assert action_msg["action"]["type"] == "click"

        await cli_ws.send(json.dumps({"type": "control", "command": "stop"}))
        stop_resp = await _recv_until(cli_ws, "control_response")
        assert stop_resp["success"] is True
        assert stop_resp["command"] == "stop"
        assert stop_resp["filepath"]

        saved_file = Path(stop_resp["filepath"])
        assert saved_file.exists()

        lines = [line for line in saved_file.read_text(encoding="utf-8").splitlines() if line]
        assert len(lines) >= 2

        meta = json.loads(lines[0])
        action = json.loads(lines[1])
        assert meta["_meta"] is True
        assert meta["session_id"] == "e2e_test_001"
        assert action["type"] == "click"
        assert action["target_hint"]["name"] == "搜索"
        assert action["page_context"]["url"] == "https://www.xiaohongshu.com"
    finally:
        if extension_ws is not None:
            await extension_ws.close()
        if cli_ws is not None:
            await cli_ws.close()
        await server.stop()
        server_task.cancel()
        try:
            await server_task
        except Exception:
            pass
