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

  const adapter = new PiAgentToolAdapter(raw, {
    hooks: new Map([
      [
        "act.click",
        [
          {
            async before(context) {
              calls.push(`before:${context.toolName}`);
              return { note: "capture" };
            },
            async after(context, result) {
              calls.push(`after:${context.toolName}`);
              return {
                ...result,
                content: [{ type: "text", text: "hooked click" }],
              };
            },
          },
        ],
      ],
    ]),
    hookContext: {
      runtimeContext: {
        runId: "run-hook",
        sessionId: "session-hook",
        pageId: "page-hook",
        stepIndex: 1,
      },
    },
  });

  const [tool] = await adapter.buildAgentTools();
  const result = await tool.execute("call-1", { ref: "el-like" });

  assert.deepEqual(raw.calls, [{ name: "act.click", args: { ref: "el-like" } }]);
  assert.deepEqual(calls, ["before:act.click", "after:act.click"]);
  assert.equal(result.content[0]?.text, "hooked click");
});

test("unregistered tools bypass hooks and preserve raw tool text", async () => {
  const raw = new StubToolClient();
  const calls: string[] = [];
  const adapter = new PiAgentToolAdapter(raw, {
    hooks: new Map([
      [
        "observe.page",
        [
          {
            async before(context) {
              calls.push(`before:${context.toolName}`);
              return undefined;
            },
            async after(context) {
              calls.push(`after:${context.toolName}`);
              return {
                content: [{ type: "text", text: `hooked:${context.toolName}` }],
              };
            },
          },
        ],
      ],
    ]),
  });

  const [tool] = await adapter.buildAgentTools();
  const result = await tool.execute("call-2", { ref: "el-like" });

  assert.deepEqual(raw.calls, [{ name: "act.click", args: { ref: "el-like" } }]);
  assert.deepEqual(calls, []);
  assert.equal(result.content[0]?.text, "clicked");
});
