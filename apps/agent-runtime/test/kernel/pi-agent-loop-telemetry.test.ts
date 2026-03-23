import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { PiAgentLoop } from "../../src/kernel/pi-agent-loop.js";
import { createRuntimeTelemetryRegistry } from "../../src/application/shell/runtime-telemetry-registry.js";
import type { PiAgentModel } from "../../src/contracts/pi-agent-model.js";
import type { ToolClient } from "../../src/contracts/tool-client.js";
import type { Logger } from "../../src/contracts/logger.js";
import { Agent, type AgentEvent } from "@mariozechner/pi-agent-core";

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

const TEST_MODEL: PiAgentModel = {
  id: "gpt-4o-mini",
  name: "gpt-4o-mini",
  provider: "openai",
  api: "responses",
};

test("PiAgentLoop emits runtime turn and tool events in order", async () => {
  const seen: string[] = [];
  const telemetryRegistry = createRuntimeTelemetryRegistry({
    createSinks: () => [
      {
        emit(event) {
          const payload = event.payload as Record<string, unknown>;
          seen.push(
            event.eventType === "agent.turn"
              ? `agent.turn:${String(payload.turnIndex)}`
              : `tool.call:${String(payload.phase)}:${String(payload.toolName)}`
          );
        },
      },
    ],
  });
  const telemetry = telemetryRegistry.createRunTelemetry({
    workflow: "refine",
    runId: "run-telemetry",
    artifactsDir: "/tmp/run-telemetry",
  });
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
          { type: "thinking", thinking: "consider click" },
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
      resolvedModel: TEST_MODEL,
      apiKey: "test-key",
      configuredModel: "openai/gpt-4o-mini",
      thinkingLevel: "minimal",
      systemPrompt: "custom prompt",
    },
    new FakeToolClient(),
    new SilentLogger()
  );

  await loop.initialize();
  loop.setRuntimeTelemetry(telemetry);
  await loop.run("do the thing");
  loop.setRuntimeTelemetry(null);
  await telemetry.dispose();
  await loop.shutdown();

  assert.deepEqual(seen, [
    "agent.turn:1",
    "tool.call:start:browser_click",
    "tool.call:end:browser_click",
  ]);
});
