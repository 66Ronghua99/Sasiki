import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallResult, ToolClient, ToolDefinition } from "../../../src/contracts/tool-client.js";
import { ToolSurfaceProvider } from "../../../src/application/providers/tool-surface-provider.js";

class StubRawToolClient implements ToolClient {
  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async listTools(): Promise<ToolDefinition[]> {
    return [{ name: "browser_snapshot" }, { name: "browser_click" }, { name: "browser_tabs" }];
  }

  async callTool(name: string): Promise<ToolCallResult> {
    return { content: [{ type: "text", text: `called ${name}` }] };
  }
}

test("tool surface provider canonical home selects the refine-react surface", () => {
  const selection = new ToolSurfaceProvider().select({ rawClient: new StubRawToolClient() });

  assert.equal(selection.toolSurfaceKind, "refine-react");
  assert.equal(selection.runToolClient, selection.refineToolClient);
});
