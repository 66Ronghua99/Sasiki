import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallResult, ToolClient, ToolDefinition } from "../../src/contracts/tool-client.js";
import { createRefineToolHookObserver } from "../../src/application/refine/tools/refine-tool-hook-observer.js";
import { createRefineToolHookPipeline } from "../../src/application/refine/tools/refine-tool-hook-pipeline.js";
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

test("bridge hook observer adapter preserves the current McpToolBridge observer seam", async () => {
  const raw = new StubToolClient();
  const events: string[] = [];
  const observer = createRefineToolHookObserver({
    pipeline: createRefineToolHookPipeline({
      async beforeToolCall({ definition, context }) {
        events.push(`before:${definition.name}:${context.runId}:${context.toolCallId}`);
        return {
          captureStatus: "skipped",
        };
      },
      async afterToolCall({ definition, context }, beforeCapture) {
        events.push(`after:${definition.name}:${context.runId}:${beforeCapture?.captureStatus ?? "none"}`);
        return {
          captureStatus: "captured",
          observationText: `hooked:${context.toolName}`,
        };
      },
    }),
    resolveContext(hookContext) {
      return hookContext;
    },
  });
  const bridge = new McpToolBridge(raw, {
    hookObserver: observer,
    hookContext: {
      runId: "run-2",
      sessionId: "session-2",
      pageId: "page-2",
      stepIndex: 2,
    },
  });

  const result = await bridge["toAgentTool"]({
    name: "browser_click",
    description: "raw click",
    inputSchema: { type: "object", properties: {} },
  }).execute("tool-call-2", { ref: "el-2" });

  assert.deepEqual(raw.calls, [{ name: "browser_click", args: { ref: "el-2" } }]);
  assert.deepEqual(events, [
    "before:browser_click:run-2:tool-call-2",
    "after:browser_click:run-2:skipped",
  ]);
  assert.deepEqual(result.content, [{ type: "text", text: "hooked:browser_click" }]);
  assert.deepEqual(result.details, { content: [{ type: "text", text: "clicked" }] });
});
