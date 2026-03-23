import assert from "node:assert/strict";
import test from "node:test";

import { createRefinePiAgentToolHooks } from "../../../src/application/refine/tools/refine-pi-agent-tool-hooks.js";
import type { RefineToolDefinition } from "../../../src/application/refine/tools/refine-tool-definition.js";
import { createRefineToolHookPipeline } from "../../../src/application/refine/tools/refine-tool-hook-pipeline.js";
import { RefineToolRegistry } from "../../../src/application/refine/tools/refine-tool-registry.js";

interface StubContext {
  runId: string;
}

function createDefinition(name: string): RefineToolDefinition<StubContext> {
  return {
    name,
    description: `${name} description`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    async invoke() {
      return {
        content: [{ type: "text", text: `${name}:raw` }],
      };
    },
  };
}

test("refine pi-agent tool hooks can replace the final tool result", async () => {
  const hooks = createRefinePiAgentToolHooks({
    registry: new RefineToolRegistry({
      definitions: [createDefinition("act.click")],
    }),
    pipeline: createRefineToolHookPipeline<StubContext, { captureId: string }>({
      async beforeToolCall({ context }) {
        return { captureId: context.runId };
      },
      async afterToolCall({ definition }, beforeCapture) {
        return {
          capture: beforeCapture,
          result: {
            content: [{ type: "text", text: `${definition.name}:${beforeCapture.captureId}:patched` }],
          },
        };
      },
    }),
    resolveContext() {
      return { runId: "run-1" };
    },
  });

  const hook = hooks.get("act.click")?.[0];
  assert.ok(hook);

  const context = {
    toolName: "act.click",
    toolCallId: "call-1",
    args: { ref: "buy" },
  };
  const beforeCapture = await hook.before?.(context);
  const result = await hook.after?.(
    context,
    {
      content: [{ type: "text", text: "act.click:raw" }],
    },
    beforeCapture,
  );

  assert.deepEqual(result, {
    content: [{ type: "text", text: "act.click:run-1:patched" }],
  });
});
