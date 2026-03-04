"""Tests for minimal browser agent loop."""

from __future__ import annotations

import json
from typing import Any

from sasiki.agent.browser_agent import AgentRunStatus, BrowserAgent


class FakeLLM:
    """Returns pre-seeded JSON actions."""

    def __init__(self, responses: list[dict[str, Any]]) -> None:
        self._responses = responses
        self._index = 0

    def complete(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.3,
        max_tokens: int | None = None,
        response_format: dict[str, Any] | None = None,
    ) -> str:
        del messages, temperature, max_tokens, response_format
        if self._index < len(self._responses):
            payload = self._responses[self._index]
            self._index += 1
        else:
            payload = self._responses[-1]
        return json.dumps(payload)


class FakeMCP:
    """Simple in-memory MCP client fake."""

    def __init__(self, snapshots: list[str]) -> None:
        self.snapshots = snapshots
        self.snapshot_index = 0
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        args = arguments or {}
        self.calls.append((name, args))

        if name == "browser_snapshot":
            if self.snapshot_index < len(self.snapshots):
                snapshot = self.snapshots[self.snapshot_index]
                self.snapshot_index += 1
            else:
                snapshot = self.snapshots[-1]
            return {"content": [{"type": "text", "text": snapshot}]}

        return {
            "content": [{"type": "text", "text": "### Result\nok"}],
            "isError": False,
        }


def test_agent_completes_on_done_action() -> None:
    llm = FakeLLM(
        responses=[
            {"action": "done", "reason": "task complete"},
        ]
    )
    mcp = FakeMCP(snapshots=["home page"])

    agent = BrowserAgent(llm=llm, mcp=mcp, max_steps=5)
    result = agent.run("Open site and summarize")

    assert result.status == AgentRunStatus.COMPLETED
    assert len(result.steps) == 1
    assert result.steps[0].action == "done"


def test_agent_executes_click_then_completes() -> None:
    llm = FakeLLM(
        responses=[
            {"action": "click", "ref": "e2", "reason": "open search"},
            {"action": "done", "reason": "opened page"},
        ]
    )
    mcp = FakeMCP(snapshots=["before click", "after click"])

    agent = BrowserAgent(llm=llm, mcp=mcp, max_steps=5)
    result = agent.run("Click search button")

    assert result.status == AgentRunStatus.COMPLETED
    assert len(result.steps) == 2
    assert result.steps[0].action == "click"
    assert result.steps[0].tool_name == "browser_click"
    assert result.steps[0].progressed is True
    assert ("browser_click", {"ref": "e2"}) in mcp.calls


def test_agent_stalls_when_snapshot_never_changes() -> None:
    llm = FakeLLM(
        responses=[
            {"action": "wait_for", "seconds": 1, "reason": "wait"},
        ]
    )
    mcp = FakeMCP(snapshots=["same snapshot", "same snapshot", "same snapshot"])

    agent = BrowserAgent(llm=llm, mcp=mcp, max_steps=5, max_stall_steps=2)
    result = agent.run("Wait until content appears")

    assert result.status == AgentRunStatus.STALLED
    assert len(result.steps) == 2
