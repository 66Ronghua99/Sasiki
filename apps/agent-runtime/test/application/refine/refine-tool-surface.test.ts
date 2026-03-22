import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallResult } from "../../../src/contracts/tool-client.js";
import { ATTENTION_KNOWLEDGE_CATEGORIES } from "../../../src/domain/attention-knowledge.js";
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
import { createRefineRuntimeToolRegistry } from "../../../src/application/refine/tools/refine-runtime-tool-registry.js";
import { createRefineBrowserToolRegistry } from "../../../src/application/refine/tools/refine-browser-tool-registry.js";
import type { ToolCallHookContext } from "../../../src/domain/refinement-session.js";
import {
  createRefineReactSession,
  type RefineReactSession,
} from "../../../src/application/refine/refine-react-session.js";
import type { HitlAnswerProvider } from "../../../src/application/refine/tools/runtime/refine-runtime-tools.js";
import { RefineBrowserTools } from "../../../src/application/refine/tools/runtime/refine-browser-tools.js";

interface StubContext extends RefineToolContext {
  readonly runId: string;
}

interface HookAwareContext extends StubContext {
  readonly hookContext: ToolCallHookContext;
}

interface RuntimeDefinitionContext extends RefineToolContext {
  readonly runtime: {
    requestHumanInput(request: {
      prompt: string;
      context?: string;
    }): Promise<{ status: "answered"; answer: string } | { status: "paused"; resumeRunId: string; resumeToken: string }>;
    recordKnowledgeCandidate(request: {
      taskScope: string;
      page: { origin: string; normalizedPath: string };
      category: (typeof ATTENTION_KNOWLEDGE_CATEGORIES)[number];
      cue: string;
      rationale?: string;
      sourceObservationRef: string;
      sourceActionRef?: string;
    }): Promise<{ accepted: true; candidateId: string }>;
    finishRun(request: {
      reason: "goal_achieved" | "hard_failure";
      summary: string;
    }): Promise<{ accepted: true; finalStatus: "completed" | "failed" }>;
  };
}

interface BrowserDefinitionContext extends RefineToolContext {
  readonly browser: {
    capturePageObservation(): Promise<Record<string, unknown>>;
    queryObservation(request: Record<string, unknown>): Promise<Record<string, unknown>>;
    clickFromObservation(args: { elementRef: string; sourceObservationRef: string }): Promise<Record<string, unknown>>;
    typeIntoElement(args: {
      elementRef: string;
      sourceObservationRef: string;
      text: string;
      submit?: boolean;
    }): Promise<Record<string, unknown>>;
    pressKey(args: { key: string; sourceObservationRef: string }): Promise<Record<string, unknown>>;
    navigateFromObservation(args: { url: string; sourceObservationRef: string }): Promise<Record<string, unknown>>;
    switchActiveTab(args: { tabIndex: number; sourceObservationRef: string }): Promise<Record<string, unknown>>;
    captureScreenshot(args: {
      sourceObservationRef: string;
      fullPage?: boolean;
      filename?: string;
    }): Promise<Record<string, unknown>>;
    handleFileUpload(args: {
      sourceObservationRef: string;
      paths?: string[];
    }): Promise<Record<string, unknown>>;
  };
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

function findListedTool(tools: Array<{ name: string }>, name: string): { name: string; description?: string; inputSchema?: unknown } {
  const tool = tools.find((item) => item.name === name);
  assert.ok(tool, `expected tool ${name} to be registered`);
  return tool as { name: string; description?: string; inputSchema?: unknown };
}

test("registry rejects duplicate tool names and preserves definition insertion order", () => {
  const toolA = createStubTool("tool.a");
  const toolB = createStubTool("tool.b");

  assert.throws(
    () =>
      new RefineToolRegistry({
        definitions: [toolA, createStubTool("tool.a")],
      }),
    /duplicate refine tool definition: tool.a/
  );

  const registry = new RefineToolRegistry({
    definitions: [toolB, toolA],
  });

  assert.deepEqual(
    registry.listDefinitions().map((item) => item.name),
    ["tool.b", "tool.a"]
  );
});

test("tool surface exposes definition insertion order and uses the latest mutable context", async () => {
  const contextRef = createRefineToolContextRef<StubContext>({ runId: "run-1" });
  const registry = new RefineToolRegistry({
    definitions: [createStubTool("tool.b"), createStubTool("tool.a")],
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
  } as unknown as import("../../../src/application/refine/tools/runtime/refine-browser-tools.js").RefineBrowserTools;
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
  } as unknown as import("../../../src/application/refine/tools/runtime/refine-runtime-tools.js").RefineRuntimeTools;
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

test("runtime tool definitions expose frozen schemas and invoke provider behavior", async () => {
  const calls: string[] = [];
  const registry = createRefineRuntimeToolRegistry();
  const surface = new RefineToolSurface({
    registry,
    contextRef: createRefineToolContextRef<RuntimeDefinitionContext>({
      runtime: {
        async requestHumanInput(request) {
          calls.push(`hitl:${request.prompt}:${request.context ?? ""}`);
          return {
            status: "answered",
            answer: "confirmed",
          };
        },
        async recordKnowledgeCandidate(request) {
          calls.push(
            `knowledge:${request.taskScope}:${request.page.origin}${request.page.normalizedPath}:${request.category}:${request.sourceObservationRef}`
          );
          return {
            accepted: true,
            candidateId: "candidate-7",
          };
        },
        async finishRun(request) {
          calls.push(`finish:${request.reason}:${request.summary}`);
          return {
            accepted: true,
            finalStatus: request.reason === "goal_achieved" ? "completed" : "failed",
          };
        },
      },
    }),
  });

  const listedTools = await surface.listTools();
  assert.deepEqual(
    registry.listDefinitions().map((definition) => definition.name),
    ["hitl.request", "knowledge.record_candidate", "run.finish"]
  );
  const hitl = findListedTool(listedTools, "hitl.request");
  const recordCandidate = findListedTool(listedTools, "knowledge.record_candidate");
  const runFinish = findListedTool(listedTools, "run.finish");

  assert.equal(hitl.description, "Ask for human intervention when safe progress requires explicit human input.");
  assert.equal(
    recordCandidate.description,
    "Record reusable attention knowledge candidate with provenance references."
  );
  assert.equal(runFinish.description, "Explicitly mark refine run completion or hard failure with a summary.");
  assert.deepEqual((runFinish.inputSchema as { required?: unknown }).required, ["reason", "summary"]);
  assert.deepEqual(
    (((recordCandidate.inputSchema as { properties?: Record<string, unknown> }).properties?.category as {
      enum?: unknown;
    })?.enum),
    ATTENTION_KNOWLEDGE_CATEGORIES
  );

  const hitlResult = await surface.callTool("hitl.request", {
    prompt: "Need confirmation",
    context: "dialog is open",
  });
  const knowledgeResult = await surface.callTool("knowledge.record_candidate", {
    taskScope: "publish-flow",
    page: {
      origin: "https://example.com",
      normalizedPath: "/publish",
    },
    category: "keep",
    cue: "Need cover image before submit",
    rationale: "Submit stays disabled",
    sourceObservationRef: "obs-3",
  });
  const finishResult = await surface.callTool("run.finish", {
    reason: "goal_achieved",
    summary: "Publish flow completed",
  });

  assert.deepEqual(hitlResult, {
    status: "answered",
    answer: "confirmed",
  });
  assert.deepEqual(knowledgeResult, {
    accepted: true,
    candidateId: "candidate-7",
  });
  assert.deepEqual(finishResult, {
    accepted: true,
    finalStatus: "completed",
  });
  assert.deepEqual(calls, [
    "hitl:Need confirmation:dialog is open",
    "knowledge:publish-flow:https://example.com/publish:keep:obs-3",
    "finish:goal_achieved:Publish flow completed",
  ]);
});

test("browser tool definitions preserve current core order and provider-backed behavior", async () => {
  const calls: string[] = [];
  const registry = createRefineBrowserToolRegistry();
  const surface = new RefineToolSurface({
    registry,
    contextRef: createRefineToolContextRef<BrowserDefinitionContext>({
      browser: {
        async capturePageObservation() {
          calls.push("observe.page");
          return {
            observation: {
              observationRef: "obs-browser-1",
              page: {
                url: "https://example.com/current",
                origin: "https://example.com",
                normalizedPath: "/current",
                title: "Current",
              },
              tabs: [],
              activeTabIndex: 0,
              activeTabMatchesPage: true,
              snapshot: "snapshot",
              capturedAt: "2026-03-22T00:00:00.000Z",
            },
          };
        },
        async queryObservation(request) {
          calls.push(`observe.query:${String(request.mode)}:${String(request.text ?? "")}:${String(request.limit ?? "")}`);
          return {
            observationRef: "obs-browser-1",
            page: {
              origin: "https://example.com",
              normalizedPath: "/current",
            },
            matches: [
              {
                elementRef: "el-buy",
                sourceObservationRef: "obs-browser-1",
                role: "button",
                rawText: "Buy now",
                normalizedText: "buy now",
              },
            ],
          };
        },
        async clickFromObservation(args) {
          calls.push(`act.click:${args.elementRef}:${args.sourceObservationRef}`);
          return { result: { action: "click", success: true, sourceObservationRef: args.sourceObservationRef } };
        },
        async typeIntoElement(args) {
          calls.push(`act.type:${args.elementRef}:${args.text}:${args.submit === true ? "submit" : "no-submit"}`);
          return { result: { action: "type", success: true, sourceObservationRef: args.sourceObservationRef } };
        },
        async pressKey(args) {
          calls.push(`act.press:${args.key}:${args.sourceObservationRef}`);
          return { result: { action: "press", success: true, sourceObservationRef: args.sourceObservationRef } };
        },
        async navigateFromObservation(args) {
          calls.push(`act.navigate:${args.url}:${args.sourceObservationRef}`);
          return { result: { action: "navigate", success: true, sourceObservationRef: args.sourceObservationRef } };
        },
        async switchActiveTab(args) {
          calls.push(`act.select_tab:${args.tabIndex}:${args.sourceObservationRef}`);
          return { result: { action: "select_tab", success: true, sourceObservationRef: args.sourceObservationRef } };
        },
        async captureScreenshot(args) {
          calls.push(
            `act.screenshot:${args.sourceObservationRef}:${String(args.filename ?? "")}:${args.fullPage === true ? "full" : "viewport"}`
          );
          return {
            result: {
              action: "screenshot",
              success: true,
              sourceObservationRef: args.sourceObservationRef,
              evidenceRef: args.filename ?? "captured",
            },
          };
        },
        async handleFileUpload(args) {
          calls.push(`act.file_upload:${args.sourceObservationRef}:${(args.paths ?? []).join("|")}`);
          return {
            result: {
              action: "file_upload",
              success: true,
              sourceObservationRef: args.sourceObservationRef,
            },
          };
        },
      },
    }),
  });

  const listedTools = await surface.listTools();
  assert.deepEqual(
    registry.listDefinitions().map((definition) => definition.name),
    [
      "observe.page",
      "observe.query",
      "act.click",
      "act.type",
      "act.press",
      "act.navigate",
      "act.select_tab",
      "act.screenshot",
      "act.file_upload",
    ]
  );
  assert.deepEqual(
    listedTools.map((tool) => tool.name),
    [
      "observe.page",
      "observe.query",
      "act.click",
      "act.type",
      "act.press",
      "act.navigate",
      "act.select_tab",
      "act.screenshot",
      "act.file_upload",
    ]
  );

  const observed = await surface.callTool("observe.page", {});
  const queried = await surface.callTool("observe.query", {
    mode: "search",
    text: "buy",
    limit: 2,
  });
  const clicked = await surface.callTool("act.click", {
    elementRef: "el-buy",
    sourceObservationRef: "obs-browser-1",
  });
  const typed = await surface.callTool("act.type", {
    elementRef: "el-input",
    sourceObservationRef: "obs-browser-1",
    text: "hello",
    submit: true,
  });
  const pressed = await surface.callTool("act.press", {
    key: "Enter",
    sourceObservationRef: "obs-browser-1",
  });
  const navigated = await surface.callTool("act.navigate", {
    url: "https://example.com/next",
    sourceObservationRef: "obs-browser-1",
  });
  const selected = await surface.callTool("act.select_tab", {
    tabIndex: 1,
    sourceObservationRef: "obs-browser-1",
  });
  const screenshot = await surface.callTool("act.screenshot", {
    sourceObservationRef: "obs-browser-1",
    path: "artifacts/browser-shot.png",
    fullPage: true,
  });
  const uploaded = await surface.callTool("act.file_upload", {
    sourceObservationRef: "obs-browser-1",
    paths: ["~/Downloads/foo.png", "~/Downloads/bar.png"],
  });

  assert.deepEqual(observed, {
    observation: {
      observationRef: "obs-browser-1",
      page: {
        url: "https://example.com/current",
        origin: "https://example.com",
        normalizedPath: "/current",
        title: "Current",
      },
      tabs: [],
      activeTabIndex: 0,
      activeTabMatchesPage: true,
      snapshot: "snapshot",
      capturedAt: "2026-03-22T00:00:00.000Z",
    },
  });
  assert.deepEqual(queried, {
    observationRef: "obs-browser-1",
    page: {
      origin: "https://example.com",
      normalizedPath: "/current",
    },
    matches: [
      {
        elementRef: "el-buy",
        sourceObservationRef: "obs-browser-1",
        role: "button",
        rawText: "Buy now",
        normalizedText: "buy now",
      },
    ],
  });
  assert.deepEqual(clicked, {
    result: { action: "click", success: true, sourceObservationRef: "obs-browser-1" },
  });
  assert.deepEqual(typed, {
    result: { action: "type", success: true, sourceObservationRef: "obs-browser-1" },
  });
  assert.deepEqual(pressed, {
    result: { action: "press", success: true, sourceObservationRef: "obs-browser-1" },
  });
  assert.deepEqual(navigated, {
    result: { action: "navigate", success: true, sourceObservationRef: "obs-browser-1" },
  });
  assert.deepEqual(selected, {
    result: { action: "select_tab", success: true, sourceObservationRef: "obs-browser-1" },
  });
  assert.deepEqual(screenshot, {
    result: {
      action: "screenshot",
      success: true,
      sourceObservationRef: "obs-browser-1",
      evidenceRef: "artifacts/browser-shot.png",
    },
  });
  assert.deepEqual(uploaded, {
    result: { action: "file_upload", success: true, sourceObservationRef: "obs-browser-1" },
  });
  assert.deepEqual(calls, [
    "observe.page",
    "observe.query:search:buy:2",
    "act.click:el-buy:obs-browser-1",
    "act.type:el-input:hello:submit",
    "act.press:Enter:obs-browser-1",
    "act.navigate:https://example.com/next:obs-browser-1",
    "act.select_tab:1:obs-browser-1",
    "act.screenshot:obs-browser-1:artifacts/browser-shot.png:full",
    "act.file_upload:obs-browser-1:~/Downloads/foo.png|~/Downloads/bar.png",
  ]);
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
