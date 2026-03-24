import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallResult } from "../../../src/contracts/tool-client.js";
import { ATTENTION_KNOWLEDGE_CATEGORIES } from "../../../src/domain/attention-knowledge.js";
import {
  createRefineToolContextRef,
  type RefineToolContext,
} from "../../../src/application/refine/tools/refine-tool-context.js";
import { RefineToolRegistry } from "../../../src/application/refine/tools/refine-tool-registry.js";
import { RefineToolSurface } from "../../../src/application/refine/tools/refine-tool-surface.js";
import type { RefineToolDefinition } from "../../../src/application/refine/tools/refine-tool-definition.js";
import {
  RefineToolSurfaceLifecycleCoordinator,
  type RefineToolSurfaceLifecycle,
} from "../../../src/application/refine/tools/refine-tool-surface-lifecycle.js";
import { createRefineRuntimeToolRegistry } from "../../../src/application/refine/tools/refine-runtime-tool-registry.js";
import { createRefineBrowserToolRegistry } from "../../../src/application/refine/tools/refine-browser-tool-registry.js";
import {
  createRefineReactSession,
  type RefineReactSession,
} from "../../../src/application/refine/refine-react-session.js";
import type { HitlAnswerProvider } from "../../../src/application/refine/tools/services/refine-run-service.js";
import {
  RefineBrowserServiceImpl,
} from "../../../src/application/refine/tools/services/refine-browser-service.js";

interface StubContext extends RefineToolContext {
  readonly runId: string;
}

interface RuntimeDefinitionContext extends RefineToolContext {
  readonly runService: {
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
  readonly browserService: {
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

test("tool surface delegates lifecycle around tool calls", async () => {
  const events: string[] = [];
  const lifecycle: RefineToolSurfaceLifecycle = {
    async connect() {
      events.push("connect");
    },
    async disconnect() {
      events.push("disconnect");
    },
  };
  const registry = new RefineToolRegistry({
    definitions: [createStubTool("tool.a")],
  });
  const surface = new RefineToolSurface({
    registry,
    contextRef: createRefineToolContextRef<StubContext>({ runId: "run-hooks" }),
    lifecycle,
  });

  await surface.connect();
  await surface.callTool("tool.a", {});
  await surface.disconnect();

  assert.deepEqual(events, [
    "connect",
    "disconnect",
  ]);
});

test("future boundary freeze: direct tool surface calls bypass adapter-only pi-agent hooks", async () => {
  const events: string[] = [];
  const surface = new RefineToolSurface({
    registry: new RefineToolRegistry({
      definitions: [createStubTool("tool.a")],
    }),
    contextRef: createRefineToolContextRef<StubContext>({ runId: "run-direct" }),
  });

  const result = await surface.callTool("tool.a", {});

  assert.deepEqual(events, []);
  assert.deepEqual(result, {
    content: [{ type: "text", text: "tool.a:run-direct" }],
  });
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

test("runtime tool definitions expose frozen schemas and invoke provider behavior", async () => {
  const calls: string[] = [];
  const registry = createRefineRuntimeToolRegistry();
  const surface = new RefineToolSurface({
    registry,
    contextRef: createRefineToolContextRef<RuntimeDefinitionContext>({
      runService: {
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
  assert.equal(
    runFinish.description,
    "Explicitly mark refine run completion or hard failure with a concise evidence-backed summary. Use this once the task goal or a verified empty-state conclusion is confirmed."
  );
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

test("browser tool definitions preserve current core order and service-backed behavior", async () => {
  const calls: string[] = [];
  const registry = createRefineBrowserToolRegistry();
  const surface = new RefineToolSurface({
    registry,
    contextRef: createRefineToolContextRef<BrowserDefinitionContext>({
      browserService: {
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
  assert.equal(
    findListedTool(listedTools, "observe.page").description,
    "Capture a fresh stabilized page snapshot with readiness state and derived task-facing tab views, and mint a new observationRef. Call this after navigation, tab switches, or other page-changing actions before further structural reasoning."
  );
  assert.equal(
    findListedTool(listedTools, "observe.query").description,
    "Find elements inside the latest captured snapshot by deterministic structural filters. This does not refresh the page and does not mint a new observationRef."
  );
  assert.equal(
    findListedTool(listedTools, "act.click").description,
    "Click a UI element from a specific source observation. If the click changes page state or opens a new tab, re-observe (and switch tabs if needed) before the next structural step."
  );
  assert.equal(
    findListedTool(listedTools, "act.navigate").description,
    "Navigate the active tab to a URL from a specific source observation for provenance. This changes page state but does not create a new observationRef, so call observe.page before the next query or action on the new page."
  );
  assert.equal(
    findListedTool(listedTools, "act.select_tab").description,
    "Switch the active browser tab using a source observation for provenance. This does not mint a new observationRef, so call observe.page after switching before the next structural query or action."
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

test("browser service keeps observation refs monotonic across repeated observations in one run", async () => {
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
  const service = new RefineBrowserServiceImpl({
    rawClient,
    session,
  });

  const first = await service.capturePageObservation();
  const second = await service.capturePageObservation();

  assert.equal(first.observation.observationRef, "obs_run-dup_1");
  assert.equal(second.observation.observationRef, "obs_run-dup_2");
  assert.deepEqual(
    session.observationHistory().map((item) => item.observationRef),
    ["obs_run-dup_1", "obs_run-dup_2"]
  );
});
