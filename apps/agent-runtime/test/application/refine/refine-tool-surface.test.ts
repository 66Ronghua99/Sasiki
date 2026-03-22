import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallResult } from "../../../src/contracts/tool-client.js";
import {
  createRefineToolContextRef,
  type RefineToolContext,
} from "../../../src/application/refine/tools/refine-tool-context.js";
import { createRefineToolHookObserver } from "../../../src/application/refine/tools/refine-tool-hook-observer.js";
import {
  RefineBrowserProviderImpl,
  type RefineBrowserProviderContext,
} from "../../../src/application/refine/tools/providers/refine-browser-provider.js";
import {
  RefineRuntimeProviderImpl,
  type RefineRuntimeProviderContext,
} from "../../../src/application/refine/tools/providers/refine-runtime-provider.js";
import { RefineToolRegistry } from "../../../src/application/refine/tools/refine-tool-registry.js";
import { RefineToolSurface } from "../../../src/application/refine/tools/refine-tool-surface.js";
import type { RefineToolDefinition } from "../../../src/application/refine/tools/refine-tool-definition.js";
import {
  createRefineToolHookPipeline,
  type RefineToolHookPipeline,
} from "../../../src/application/refine/tools/refine-tool-hook-pipeline.js";
import {
  RefineToolSurfaceLifecycleCoordinator,
  type RefineToolSurfaceLifecycle,
} from "../../../src/application/refine/tools/refine-tool-surface-lifecycle.js";
import type { ToolCallHookContext } from "../../../src/domain/refinement-session.js";
import {
  createRefineReactSession,
  type RefineReactSession,
} from "../../../src/application/refine/refine-react-session.js";
import type { HitlAnswerProvider } from "../../../src/application/refine/refine-runtime-tools.js";
import { RefineBrowserTools } from "../../../src/application/refine/refine-browser-tools.js";

interface StubContext extends RefineToolContext {
  readonly runId: string;
}

interface HookAwareContext extends StubContext {
  readonly hookContext: ToolCallHookContext;
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

function createHookContext(): ToolCallHookContext {
  return {
    runId: "run-hook",
    sessionId: "session-hook",
    toolCallId: "tool-call-hook",
    toolName: "browser_click",
    toolArgs: { ref: "button-1" },
    pageId: "page-hook",
    stepIndex: 3,
    toolClass: "mutation",
    hookOrigin: "tool_call",
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

test("surface lifecycle rolls back partial connect failures", async () => {
  const events: string[] = [];
  const lifecycle = new RefineToolSurfaceLifecycleCoordinator({
    participants: [
      {
        async connect() {
          events.push("a.connect");
        },
        async disconnect() {
          events.push("a.disconnect");
        },
      },
      {
        async connect() {
          events.push("b.connect");
          throw new Error("boom");
        },
        async disconnect() {
          events.push("b.disconnect");
        },
      },
    ],
  });

  await assert.rejects(() => lifecycle.connect(), /boom/);
  assert.deepEqual(events, ["a.connect", "b.connect", "a.disconnect"]);
});

test("hook pipeline adapts into the current bridge observer seam", async () => {
  const events: string[] = [];
  const pipeline = createRefineToolHookPipeline<HookAwareContext>({
    async beforeToolCall({ definition, context }) {
      events.push(`before:${definition.name}:${context.runId}:${context.hookContext.toolCallId}`);
      return {
        captureStatus: "skipped",
        observationText: "before observation",
      };
    },
    async afterToolCall({ definition, context, result }, beforeCapture) {
      const firstBlock = Array.isArray(result.content) ? result.content[0] : undefined;
      const text =
        firstBlock && typeof firstBlock === "object" && firstBlock && "text" in firstBlock
          ? String(firstBlock.text)
          : "unknown";
      events.push(
        `after:${definition.name}:${context.runId}:${text}:${beforeCapture?.captureStatus ?? "none"}`
      );
      return {
        captureStatus: "captured",
        observationText: "after observation",
      };
    },
  });
  const observer = createRefineToolHookObserver({
    pipeline,
    resolveContext(hookContext) {
      return {
        runId: hookContext.runId,
        hookContext,
      };
    },
  });
  const hookContext = createHookContext();

  const beforeCapture = await observer.beforeToolCall(hookContext);
  const afterCapture = await observer.afterToolCall(
    hookContext,
    { content: [{ type: "text", text: "clicked" }] },
    beforeCapture
  );

  assert.equal(beforeCapture?.captureStatus, "skipped");
  assert.equal(afterCapture?.captureStatus, "captured");
  assert.deepEqual(events, [
    "before:browser_click:run-hook:tool-call-hook",
    "after:browser_click:run-hook:clicked:skipped",
  ]);
});

test("browser provider syncs run-scoped context through the browser tool provider seam", async () => {
  const events: string[] = [];
  const session = { runId: "provider-browser-run" } as RefineReactSession;
  const tools = {
    setProviderContext(context: { session: RefineReactSession }) {
      events.push(`context:${context.session.runId}`);
    },
    async observePage() {
      events.push("observe");
      return {
        observation: {
          observationRef: "obs-1",
          page: {
            origin: "https://example.com",
            normalizedPath: "/",
            title: "Example",
          },
          snapshot: "snapshot",
          capturedAt: "2026-03-22T00:00:00.000Z",
          tabs: [],
          activeTabIndex: 0,
          activeTabMatchesPage: true,
        },
      };
    },
  } as unknown as import("../../../src/application/refine/refine-browser-tools.js").RefineBrowserTools;
  const contextRef = createRefineToolContextRef<RefineBrowserProviderContext>({ session });
  const provider = new RefineBrowserProviderImpl({ tools, contextRef });

  const result = await provider.capturePageObservation();

  assert.equal(result.observation.observationRef, "obs-1");
  assert.deepEqual(events, ["context:provider-browser-run", "observe"]);
});

test("runtime provider syncs run-scoped context through the runtime tool provider seam", async () => {
  const events: string[] = [];
  const session = { runId: "provider-runtime-run" } as RefineReactSession;
  const hitlAnswerProvider: HitlAnswerProvider = async () => "answer";
  const tools = {
    setProviderContext(context: { session: RefineReactSession; hitlAnswerProvider?: HitlAnswerProvider }) {
      events.push(
        `context:${context.session.runId}:${context.hitlAnswerProvider === hitlAnswerProvider ? "same-provider" : "different-provider"}`
      );
    },
    async requestHitl() {
      events.push("hitl");
      return {
        status: "answered" as const,
        answer: "answer",
      };
    },
  } as unknown as import("../../../src/application/refine/refine-runtime-tools.js").RefineRuntimeTools;
  const contextRef = createRefineToolContextRef<RefineRuntimeProviderContext>({ session, hitlAnswerProvider });
  const provider = new RefineRuntimeProviderImpl({ tools, contextRef });

  const result = await provider.requestHumanInput({
    reason: "uncertain_state",
    prompt: "Need help",
    context: {},
  });

  assert.equal(result.status, "answered");
  assert.deepEqual(events, ["context:provider-runtime-run:same-provider", "hitl"]);
});

test("browser provider keeps observation refs monotonic across repeated observations in one run", async () => {
  const session = createRefineReactSession("run-dup", "observe twice", { taskScope: "provider-monotonic" });
  const rawClient = {
    async connect() {},
    async disconnect() {},
    async listTools() {
      return [];
    },
    async callTool(name: string) {
      assert.equal(name, "browser_snapshot");
      return {
        content: [
          {
            type: "text",
            text: [
              "Page URL: https://example.com/articles/1",
              "Page Title: Example Article",
              "Open tabs:",
              "- 0: [Example Article](https://example.com/articles/1) (current)",
            ].join("\n"),
          },
        ],
      };
    },
  };
  const tools = new RefineBrowserTools({
    rawClient,
    session,
  });
  const contextRef = createRefineToolContextRef<RefineBrowserProviderContext>({ session });
  const provider = new RefineBrowserProviderImpl({ tools, contextRef });

  const first = await provider.capturePageObservation();
  const second = await provider.capturePageObservation();

  assert.equal(first.observation.observationRef, "obs_run-dup_1");
  assert.equal(second.observation.observationRef, "obs_run-dup_2");
  assert.deepEqual(
    session.observationHistory().map((item) => item.observationRef),
    ["obs_run-dup_1", "obs_run-dup_2"]
  );
});
