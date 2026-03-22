import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallResult, ToolClient, ToolDefinition } from "../../src/contracts/tool-client.js";
import { McpToolBridge } from "../../src/kernel/mcp-tool-bridge.js";

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

test("refine-facing act tools do not trigger the mcp bridge hook observer", async () => {
  const raw = new StubToolClient();
  const beforeCalls: string[] = [];
  const afterCalls: string[] = [];
  const bridge = new McpToolBridge(raw, {
    hookObserver: {
      async beforeToolCall(context) {
        beforeCalls.push(context.toolName);
        return null;
      },
      async afterToolCall(context) {
        afterCalls.push(context.toolName);
        return null;
      },
    },
    hookContext: {
      runId: "run-1",
      sessionId: "session-1",
      pageId: "page-1",
      stepIndex: 1,
    },
  });

  const tools = await bridge.buildAgentTools();
  const actClick = tools.find((tool) => tool.name === "act.click");
  assert.ok(actClick, "expected act.click to be exposed by the bridge");

  const result = await actClick.execute("tool-call-1", { ref: "el-like" });

  assert.deepEqual(raw.calls, [{ name: "act.click", args: { ref: "el-like" } }]);
  assert.deepEqual(beforeCalls, []);
  assert.deepEqual(afterCalls, []);
  assert.deepEqual(result.details, { content: [{ type: "text", text: "clicked" }] });
});
