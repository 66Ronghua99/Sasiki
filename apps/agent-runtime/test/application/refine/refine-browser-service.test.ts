import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallResult, ToolClient, ToolDefinition } from "../../../src/contracts/tool-client.js";
import { createRefineReactSession } from "../../../src/application/refine/refine-react-session.js";
import {
  createRefineToolContextRef,
} from "../../../src/application/refine/tools/refine-tool-context.js";
import {
  RefineBrowserServiceImpl,
  type RefineBrowserServiceContext,
} from "../../../src/application/refine/tools/services/refine-browser-service.js";

class StubRawToolClient implements ToolClient {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async listTools(): Promise<ToolDefinition[]> {
    return [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    this.calls.push({ name, args });
    if (name !== "browser_snapshot") {
      throw new Error(`unexpected raw tool: ${name}`);
    }
    return {
      content: [
        {
          type: "text",
          text: [
            "### Open tabs",
            "- 0: (current) [Example](https://example.com/one)",
            "### Page",
            "- Page URL: https://example.com/one",
            "- Page Title: Example",
            "### Snapshot",
            "```yaml",
            "- generic [ref=e1]:",
            "  - button \"Go\" [ref=el-go] [cursor=pointer]",
            "```",
          ].join("\n"),
        },
      ],
    };
  }
}

test("browser service rebinds the latest session before page observation", async () => {
  const rawClient = new StubRawToolClient();
  const contextRef = createRefineToolContextRef<RefineBrowserServiceContext>({});
  const service = new RefineBrowserServiceImpl({
    rawClient,
    session: createRefineReactSession("run-1", "task-1", { taskScope: "scope-1" }),
  });

  const first = await service.capturePageObservation();
  service.setSession(createRefineReactSession("run-2", "task-2", { taskScope: "scope-2" }));
  const second = await service.capturePageObservation();

  assert.equal(first.observation.observationRef, "obs_run-1_1");
  assert.equal(second.observation.observationRef, "obs_run-2_1");
  assert.equal(service.getSession().runId, "run-2");
  assert.deepEqual(contextRef.get(), {});
  assert.equal(rawClient.calls.length, 2);
});
