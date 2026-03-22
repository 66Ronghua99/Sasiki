import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallResult, ToolClient, ToolDefinition } from "../../src/contracts/tool-client.js";
import { PiAgentToolAdapter } from "../../src/kernel/pi-agent-tool-adapter.js";

class StubToolClient implements ToolClient {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async listTools(): Promise<ToolDefinition[]> {
    return [{ name: "act.click" }];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    this.calls.push({ name, args });
    return { content: [{ type: "text", text: "clicked" }] };
  }
}

test("registered exact tool-name hooks run before and after adapter execution", async () => {
  const raw = new StubToolClient();
  const calls: string[] = [];

  // Future boundary freeze: the adapter should honor exact tool-name hooks and mutate the final result.
  // Today the kernel owner still routes through classification, so act.click remains unhooked.
  const adapter = new PiAgentToolAdapter(raw, {
    hookObserver: {
      async beforeToolCall(context) {
        calls.push(`before:${context.toolName}`);
        return { captureStatus: "skipped" };
      },
      async afterToolCall(context, result) {
        calls.push(`after:${context.toolName}`);
        return {
          captureStatus: "captured",
          observationText: "hooked click",
        };
      },
    },
    hookContext: {
      runId: "run-hook",
      sessionId: "session-hook",
      pageId: "page-hook",
      stepIndex: 1,
    },
  });

  const [tool] = await adapter.buildAgentTools();
  const result = await tool.execute("call-1", { ref: "el-like" });

  assert.deepEqual(raw.calls, [{ name: "act.click", args: { ref: "el-like" } }]);
  assert.deepEqual(calls, ["before:act.click", "after:act.click"]);
  assert.equal(result.content[0]?.text, "hooked click");
});
