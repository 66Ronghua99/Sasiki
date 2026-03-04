"""Minimal Observe-Think-Act browser agent loop."""

from __future__ import annotations

import hashlib
import json
import re
from enum import Enum
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field


class LLMClientProtocol(Protocol):
    """Protocol for LLM clients used by BrowserAgent."""

    def complete(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.3,
        max_tokens: int | None = None,
        response_format: dict[str, Any] | None = None,
    ) -> str:
        """Generate a completion."""


class MCPToolClientProtocol(Protocol):
    """Protocol for tool clients used by BrowserAgent."""

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        """Invoke a tool by name."""


class AgentRunStatus(str, Enum):
    """Terminal state for one agent run."""

    COMPLETED = "completed"
    FAILED = "failed"
    STALLED = "stalled"
    MAX_STEPS = "max_steps"


class PlannedAction(BaseModel):
    """One next action decided by the planner model."""

    model_config = ConfigDict(extra="ignore")

    action: Literal["navigate", "click", "type", "press_key", "wait_for", "done"]
    reason: str = ""
    url: str | None = None
    ref: str | None = None
    text: str | None = None
    key: str | None = None
    seconds: float | None = None
    submit: bool = False


class AgentStep(BaseModel):
    """Recorded step for debugging and replay analysis."""

    step_index: int
    action: str
    reason: str = ""
    tool_name: str | None = None
    tool_arguments: dict[str, Any] = Field(default_factory=dict)
    result_excerpt: str = ""
    progressed: bool = False
    error: str | None = None


class AgentRunResult(BaseModel):
    """Agent run output."""

    task: str
    status: AgentRunStatus
    finish_reason: str
    steps: list[AgentStep] = Field(default_factory=list)


class BrowserAgent:
    """Minimal browser automation agent using Playwright MCP tools."""

    _SYSTEM_PROMPT = """You are a browser task execution planner.
Choose exactly one next action based on the current page snapshot and task.

Allowed actions:
- navigate: open a url
- click: click an element by ref
- type: type text in an input by ref
- press_key: press one key, e.g. Enter
- wait_for: wait for a short duration in seconds
- done: task is complete

Rules:
1) Output ONLY a JSON object.
2) Keep actions incremental, one step at a time.
3) Use refs that exist in the snapshot.
4) If task is complete, return action=done.

JSON shape:
{
  "action": "navigate|click|type|press_key|wait_for|done",
  "reason": "short reason",
  "url": "https://...",
  "ref": "e123",
  "text": "text to input",
  "key": "Enter",
  "seconds": 1.0,
  "submit": false
}
"""

    def __init__(
        self,
        llm: LLMClientProtocol,
        mcp: MCPToolClientProtocol,
        *,
        max_steps: int = 12,
        max_stall_steps: int = 3,
        max_failures: int = 2,
        snapshot_chars: int = 9000,
    ) -> None:
        self.llm = llm
        self.mcp = mcp
        self.max_steps = max_steps
        self.max_stall_steps = max_stall_steps
        self.max_failures = max_failures
        self.snapshot_chars = snapshot_chars

    def run(self, task: str) -> AgentRunResult:
        """Run one agent session for a natural-language browser task."""
        steps: list[AgentStep] = []
        failure_count = 0
        stall_count = 0

        snapshot = self._capture_snapshot()
        snapshot_digest = self._digest(snapshot)

        for step_index in range(1, self.max_steps + 1):
            try:
                action = self._plan_next_action(task=task, snapshot=snapshot, steps=steps, step_index=step_index)
            except Exception as exc:  # pragma: no cover - defensive failure path
                steps.append(
                    AgentStep(
                        step_index=step_index,
                        action="planning_error",
                        error=str(exc),
                    )
                )
                return AgentRunResult(
                    task=task,
                    status=AgentRunStatus.FAILED,
                    finish_reason="planning failed",
                    steps=steps,
                )

            if action.action == "done":
                steps.append(
                    AgentStep(
                        step_index=step_index,
                        action="done",
                        reason=action.reason,
                        progressed=True,
                    )
                )
                return AgentRunResult(
                    task=task,
                    status=AgentRunStatus.COMPLETED,
                    finish_reason=action.reason or "planner marked task complete",
                    steps=steps,
                )

            try:
                tool_name, tool_args = self._tool_call_for_action(action)
                tool_result = self.mcp.call_tool(tool_name, tool_args)
                next_snapshot = self._capture_snapshot()
                next_digest = self._digest(next_snapshot)
                progressed = next_digest != snapshot_digest

                snapshot = next_snapshot
                snapshot_digest = next_digest
                failure_count = 0
                if progressed:
                    stall_count = 0
                else:
                    stall_count += 1

                steps.append(
                    AgentStep(
                        step_index=step_index,
                        action=action.action,
                        reason=action.reason,
                        tool_name=tool_name,
                        tool_arguments=tool_args,
                        result_excerpt=self._trim(self._extract_text(tool_result), limit=300),
                        progressed=progressed,
                    )
                )
            except Exception as exc:
                failure_count += 1
                stall_count += 1
                steps.append(
                    AgentStep(
                        step_index=step_index,
                        action=action.action,
                        reason=action.reason,
                        tool_name=None,
                        tool_arguments={},
                        progressed=False,
                        error=str(exc),
                    )
                )

                if failure_count >= self.max_failures:
                    return AgentRunResult(
                        task=task,
                        status=AgentRunStatus.FAILED,
                        finish_reason=f"consecutive failures reached {self.max_failures}",
                        steps=steps,
                    )

            if stall_count >= self.max_stall_steps:
                return AgentRunResult(
                    task=task,
                    status=AgentRunStatus.STALLED,
                    finish_reason=f"no progress for {self.max_stall_steps} steps",
                    steps=steps,
                )

        return AgentRunResult(
            task=task,
            status=AgentRunStatus.MAX_STEPS,
            finish_reason=f"reached step limit ({self.max_steps})",
            steps=steps,
        )

    def _capture_snapshot(self) -> str:
        result = self.mcp.call_tool("browser_snapshot", {})
        text = self._extract_text(result)
        snapshot = self._snapshot_from_tool_text(text)
        return self._trim(snapshot or text, limit=self.snapshot_chars)

    def _plan_next_action(
        self,
        *,
        task: str,
        snapshot: str,
        steps: list[AgentStep],
        step_index: int,
    ) -> PlannedAction:
        history = self._history_text(steps[-5:])
        prompt = (
            f"Task:\n{task}\n\n"
            f"Current step: {step_index}/{self.max_steps}\n"
            f"Recent execution history:\n{history}\n\n"
            f"Current page snapshot:\n{snapshot}"
        )
        raw = self.llm.complete(
            [
                {"role": "system", "content": self._SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=450,
        )
        data = self._parse_json_object(raw)
        return PlannedAction.model_validate(data)

    @staticmethod
    def _tool_call_for_action(action: PlannedAction) -> tuple[str, dict[str, Any]]:
        if action.action == "navigate":
            if not action.url:
                raise ValueError("navigate action requires url")
            return "browser_navigate", {"url": action.url}
        if action.action == "click":
            if not action.ref:
                raise ValueError("click action requires ref")
            return "browser_click", {"ref": action.ref}
        if action.action == "type":
            if not action.ref or action.text is None:
                raise ValueError("type action requires ref and text")
            return "browser_type", {"ref": action.ref, "text": action.text, "submit": action.submit}
        if action.action == "press_key":
            if not action.key:
                raise ValueError("press_key action requires key")
            return "browser_press_key", {"key": action.key}
        if action.action == "wait_for":
            seconds = action.seconds if action.seconds is not None else 1.0
            return "browser_wait_for", {"time": seconds}

        raise ValueError(f"unsupported action for tool mapping: {action.action}")

    @staticmethod
    def _history_text(steps: list[AgentStep]) -> str:
        if not steps:
            return "No previous steps."
        lines: list[str] = []
        for step in steps:
            base = f"{step.step_index}. {step.action}"
            if step.reason:
                base += f" ({step.reason})"
            if step.error:
                base += f" -> ERROR: {step.error}"
            else:
                base += f" -> progressed={step.progressed}"
            lines.append(base)
        return "\n".join(lines)

    @staticmethod
    def _parse_json_object(text: str) -> dict[str, Any]:
        candidate = text.strip()
        if candidate.startswith("```"):
            lines = [line for line in candidate.splitlines() if not line.strip().startswith("```")]
            candidate = "\n".join(lines).strip()

        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

        # Fallback: extract first JSON object from free-form text.
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise ValueError(f"failed to parse JSON action from: {text}")

        parsed = json.loads(match.group(0))
        if not isinstance(parsed, dict):
            raise ValueError(f"action JSON is not an object: {parsed}")
        return parsed

    @staticmethod
    def _snapshot_from_tool_text(text: str) -> str:
        sections: dict[str, str] = {}
        current_title = ""
        current_lines: list[str] = []

        for line in text.splitlines():
            if line.startswith("### "):
                if current_title:
                    sections[current_title] = "\n".join(current_lines).strip()
                current_title = line[4:].strip()
                current_lines = []
                continue
            current_lines.append(line)

        if current_title:
            sections[current_title] = "\n".join(current_lines).strip()

        return sections.get("Snapshot", text).strip()

    @staticmethod
    def _extract_text(result: dict[str, Any]) -> str:
        content = result.get("content")
        if not isinstance(content, list):
            return ""

        chunks: list[str] = []
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") != "text":
                continue
            text = part.get("text")
            if isinstance(text, str):
                chunks.append(text)

        return "\n".join(chunks).strip()

    @staticmethod
    def _digest(text: str) -> str:
        return hashlib.sha1(text.encode("utf-8")).hexdigest()

    @staticmethod
    def _trim(text: str, *, limit: int) -> str:
        if len(text) <= limit:
            return text
        return f"{text[:limit]}...<truncated>"
