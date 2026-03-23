import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";

import { Agent, type AgentEvent } from "@mariozechner/pi-agent-core";

import type { Logger } from "../../src/contracts/logger.js";
import type { ToolClient } from "../../src/contracts/tool-client.js";
import type { AgentRunResult, PiAgentLoopProgressSnapshot } from "../../src/contracts/agent-loop-records.js";
import { PiAgentLoop } from "../../src/kernel/pi-agent-loop.js";

class SilentLogger implements Logger {
  info(): void {}
  warn(): void {}
  error(): void {}
}

class FakeToolClient implements ToolClient {
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async listTools(): Promise<Array<{ name: string }>> {
    return [{ name: "browser_click" }];
  }
  async callTool(): Promise<{ content: [] }> {
    return { content: [] };
  }
}

test("PiAgentLoop exposes contract-shaped progress snapshots and run results", async () => {
  const listeners = new WeakMap<object, (event: AgentEvent) => void>();

  mock.method(Agent.prototype, "setSystemPrompt", () => undefined);
  mock.method(Agent.prototype, "setThinkingLevel", () => undefined);
  mock.method(Agent.prototype, "setTools", () => undefined);
  mock.method(Agent.prototype, "subscribe", function (listener: (event: AgentEvent) => void) {
    listeners.set(this, listener);
    return () => {
      listeners.delete(this);
    };
  });
  mock.method(Agent.prototype, "prompt", async function () {
    const emit = listeners.get(this);
    emit?.({
      type: "message_end",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "click the button" },
          { type: "toolCall", id: "call-1", name: "browser_click", arguments: { selector: "#buy" } },
        ],
        stopReason: "tool_use",
      },
    });
    emit?.({
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "browser_click",
      args: { selector: "#buy" },
    });
    emit?.({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "browser_click",
      args: { selector: "#buy" },
      result: { content: [{ type: "text", text: "clicked" }] },
      isError: false,
    });
  });
  mock.method(Agent.prototype, "waitForIdle", async () => undefined);
  mock.method(Agent.prototype, "abort", () => undefined);

  const loop = new PiAgentLoop(
    {
      model: "openai/gpt-4o-mini",
      apiKey: "test-key",
      thinkingLevel: "minimal",
      systemPrompt: "custom prompt",
    },
    new FakeToolClient(),
    new SilentLogger()
  );

  const beforeRunSnapshot: PiAgentLoopProgressSnapshot = loop.snapshotProgress({ includeLastSnapshot: true });
  assert.deepEqual(beforeRunSnapshot, {
    steps: [],
    mcpCalls: [],
    assistantTurns: [],
    highLevelLogs: [],
  });

  await loop.initialize();
  const result: AgentRunResult = await loop.run("do the thing");
  await loop.shutdown();

  assert.equal(result.status, "completed");
  assert.equal(result.finishReason, "agent loop completed");
  assert.equal(result.steps.length, 1);
  assert.equal(result.mcpCalls.length, 2);
  assert.equal(result.assistantTurns.length, 1);

  const lastSnapshot: PiAgentLoopProgressSnapshot = loop.snapshotProgress({ includeLastSnapshot: true });
  assert.equal(lastSnapshot.steps.length, 1);
  assert.equal(lastSnapshot.mcpCalls.length, 2);
  assert.equal(lastSnapshot.assistantTurns.length, 1);
  assert.equal(lastSnapshot.highLevelLogs.length, 4);
});

test("PiAgentLoop sources engine-facing run state contracts from src/contracts", async () => {
  const source = await readFile(new URL("../../src/kernel/pi-agent-loop.ts", import.meta.url), "utf8");

  assert.match(source, /\.\.\/contracts\/agent-loop-records\.js/);
  assert.doesNotMatch(source, /\.\.\/domain\/agent-types\.js/);
  assert.doesNotMatch(source, /\.\.\/domain\/high-level-log\.js/);
});
