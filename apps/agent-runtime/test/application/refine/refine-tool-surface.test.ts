import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallResult } from "../../../src/contracts/tool-client.js";
import {
  createRefineToolContextRef,
  type RefineToolContext,
} from "../../../src/application/refine/tools/refine-tool-context.js";
import { RefineToolRegistry } from "../../../src/application/refine/tools/refine-tool-registry.js";
import { RefineToolSurface } from "../../../src/application/refine/tools/refine-tool-surface.js";
import type { RefineToolDefinition } from "../../../src/application/refine/tools/refine-tool-definition.js";
import type { RefineToolHookPipeline } from "../../../src/application/refine/tools/refine-tool-hook-pipeline.js";
import type { RefineToolSurfaceLifecycle } from "../../../src/application/refine/tools/refine-tool-surface-lifecycle.js";

interface StubContext extends RefineToolContext {
  readonly runId: string;
}

function createStubTool(name: string, behavior?: (context: StubContext) => ToolCallResult): RefineToolDefinition<StubContext> {
  return {
    name,
    description: `${name} description`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    async invoke(_args, context) {
      return behavior?.(context) ?? { content: [{ type: "text", text: `${name}:${context.runId}` }] };
    },
  };
}

test("registry rejects duplicate tool names and preserves explicit order", () => {
  const toolA = createStubTool("tool.a");
  const toolB = createStubTool("tool.b");

  assert.throws(
    () =>
      new RefineToolRegistry({
        definitions: [toolA, createStubTool("tool.a")],
        orderedToolNames: ["tool.a"],
      }),
    /duplicate refine tool definition: tool.a/
  );

  const registry = new RefineToolRegistry({
    definitions: [toolA, toolB],
    orderedToolNames: ["tool.b", "tool.a"],
  });

  assert.deepEqual(
    registry.listDefinitions().map((item) => item.name),
    ["tool.b", "tool.a"]
  );
});

test("tool surface exposes explicit tool order and uses the latest mutable context", async () => {
  const contextRef = createRefineToolContextRef<StubContext>({ runId: "run-1" });
  const registry = new RefineToolRegistry({
    definitions: [createStubTool("tool.a"), createStubTool("tool.b")],
    orderedToolNames: ["tool.b", "tool.a"],
  });
  const surface = new RefineToolSurface({ registry, contextRef });

  assert.deepEqual(
    (await surface.listTools()).map((item) => item.name),
    ["tool.b", "tool.a"]
  );

  contextRef.set({ runId: "run-2" });
  const result = await surface.callTool("tool.b", {});

  assert.deepEqual(result, {
    content: [{ type: "text", text: "tool.b:run-2" }],
  });
});

test("tool surface delegates lifecycle and hook pipeline around tool calls", async () => {
  const events: string[] = [];
  const lifecycle: RefineToolSurfaceLifecycle = {
    async connect() {
      events.push("connect");
    },
    async disconnect() {
      events.push("disconnect");
    },
  };
  const hookPipeline: RefineToolHookPipeline<StubContext> = {
    async beforeToolCall({ definition, context }) {
      events.push(`before:${definition.name}:${context.runId}`);
    },
    async afterToolCall({ definition, context, result }) {
      const firstItem = Array.isArray(result.content) ? result.content[0] : undefined;
      const text =
        firstItem && typeof firstItem === "object" && firstItem && "text" in firstItem ? String(firstItem.text) : "unknown";
      events.push(`after:${definition.name}:${context.runId}:${text}`);
    },
  };
  const registry = new RefineToolRegistry({
    definitions: [createStubTool("tool.a")],
    orderedToolNames: ["tool.a"],
  });
  const surface = new RefineToolSurface({
    registry,
    contextRef: createRefineToolContextRef<StubContext>({ runId: "run-hooks" }),
    lifecycle,
    hookPipeline,
  });

  await surface.connect();
  await surface.callTool("tool.a", {});
  await surface.disconnect();

  assert.deepEqual(events, [
    "connect",
    "before:tool.a:run-hooks",
    "after:tool.a:run-hooks:tool.a:run-hooks",
    "disconnect",
  ]);
});
