import assert from "node:assert/strict";
import test from "node:test";

import { AgentLoop } from "../../src/kernel/agent-loop.js";
import { createRuntimeTelemetryRegistry } from "../../src/application/shell/runtime-telemetry-registry.js";
import type { AgentLoopAgent } from "../../src/kernel/agent-loop.js";
import type { ToolClient } from "../../src/contracts/tool-client.js";
import type { Logger } from "../../src/contracts/logger.js";
import type { AgentEvent } from "@mariozechner/pi-agent-core";

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

class ScriptedAgent implements AgentLoopAgent {
  private listener: ((event: AgentEvent) => void) | null = null;
  state = {};

  setSystemPrompt(): void {}
  setThinkingLevel(): void {}
  setTools(): void {}
  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }
  async prompt(): Promise<void> {
    this.emit({
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
    this.emit({
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "browser_click",
      args: { selector: "#buy" },
    });
    this.emit({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "browser_click",
      args: { selector: "#buy" },
      result: { content: [{ type: "text", text: "clicked" }] },
      isError: false,
    });
  }
  async waitForIdle(): Promise<void> {}
  abort(): void {}

  private emit(event: AgentEvent): void {
    this.listener?.(event);
  }
}

test("AgentLoop emits runtime turn and tool events in order", async () => {
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
  const agent = new ScriptedAgent();
  const loop = new AgentLoop(
    {
      model: "openai/gpt-4o-mini",
      apiKey: "test-key",
      thinkingLevel: "minimal",
      systemPrompt: "custom prompt",
      createAgent: () => agent,
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
