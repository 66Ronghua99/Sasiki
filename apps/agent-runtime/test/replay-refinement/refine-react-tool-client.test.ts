import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallResult, ToolClient, ToolDefinition } from "../../src/contracts/tool-client.js";
import { ATTENTION_KNOWLEDGE_CATEGORIES } from "../../src/domain/attention-knowledge.js";
import { createRefineReactSession } from "../../src/application/refine/refine-react-session.js";
import {
  createBootstrapRefineReactToolClient,
  RefineReactToolClient,
} from "../../src/application/refine/refine-react-tool-client.js";
import { createRefineToolComposition, type RefineToolComposition } from "../../src/application/refine/tools/refine-tool-composition.js";

interface StubRawToolClientOptions {
  screenshotToolName?: "browser_take_screenshot" | "browser_screenshot";
  screenshotToolNames?: Array<"browser_take_screenshot" | "browser_screenshot">;
  screenshotResponses?: Partial<
    Record<"browser_take_screenshot" | "browser_screenshot", SnapshotResponse>
  >;
  snapshotText?: string;
  clickText?: string;
  navigateText?: string;
  tabsListText?: string;
  tabSelectText?: string;
  includeBrowserTabsTool?: boolean;
}

class StubRawToolClient implements ToolClient {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  private readonly tools: ToolDefinition[];
  private readonly snapshotText: string;
  private readonly clickText: string;
  private readonly navigateText: string;
  private readonly tabsListText: string;
  private readonly tabSelectText: string;
  private readonly screenshotResponses: Partial<
    Record<"browser_take_screenshot" | "browser_screenshot", SnapshotResponse>
  >;

  constructor(options?: StubRawToolClientOptions) {
    const screenshotToolNames = options?.screenshotToolNames ?? [
      options?.screenshotToolName ?? "browser_take_screenshot",
    ];
    const includeBrowserTabsTool = options?.includeBrowserTabsTool ?? true;
    this.snapshotText = options?.snapshotText ?? defaultSnapshotText();
    this.clickText = options?.clickText ?? "clicked";
    this.navigateText = options?.navigateText ?? "";
    this.tabsListText = options?.tabsListText ?? defaultTabsListText();
    this.screenshotResponses = options?.screenshotResponses ?? {};
    this.tabSelectText =
      options?.tabSelectText ??
      [
        "### Open tabs",
        "- 0: [Explore](https://www.xiaohongshu.com/explore)",
        "- 1: (current) [Creator](https://creator.xiaohongshu.com/publish/publish?source=official)",
        "### Page",
        "- Page URL: https://creator.xiaohongshu.com/publish/publish?source=official",
        "- Page Title: Creator",
      ].join("\n");
    this.tools = [
      { name: "browser_snapshot" },
      { name: "browser_click" },
      { name: "browser_type" },
      { name: "browser_press_key" },
      { name: "browser_navigate" },
      { name: "browser_file_upload" },
    ];
    for (const screenshotToolName of screenshotToolNames) {
      this.tools.push({ name: screenshotToolName });
    }
    if (includeBrowserTabsTool) {
      this.tools.push({ name: "browser_tabs" });
    }
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async listTools(): Promise<ToolDefinition[]> {
    return this.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    this.calls.push({ name, args });
    if (name === "browser_snapshot") {
      return {
        content: [
          {
            type: "text",
            text: this.snapshotText,
          },
        ],
      };
    }
    if (name === "browser_click") {
      return { content: [{ type: "text", text: `${this.clickText} ${String(args.ref ?? "")}` }] };
    }
    if (name === "browser_type") {
      return { content: [{ type: "text", text: `typed ${String(args.text ?? "")}` }] };
    }
    if (name === "browser_press_key") {
      return { content: [{ type: "text", text: `pressed ${String(args.key ?? "")}` }] };
    }
    if (name === "browser_navigate") {
      return {
        content: [
          {
            type: "text",
            text: this.navigateText || `navigated ${String(args.url ?? "")}`,
          },
        ],
      };
    }
    if (name === "browser_file_upload") {
      const paths = Array.isArray(args.paths) ? args.paths : undefined;
      return {
        content: [
          {
            type: "text",
            text: paths && paths.length > 0 ? `uploaded ${paths.join(",")}` : "file chooser closed",
          },
        ],
      };
    }
    if (name === "browser_tabs") {
      const action = typeof args.action === "string" ? args.action : "list";
      if (action === "list") {
        return { content: [{ type: "text", text: this.tabsListText }] };
      }
      if (action === "select") {
        return { content: [{ type: "text", text: this.tabSelectText }] };
      }
      throw new Error(`unexpected browser_tabs action: ${action}`);
    }
    if (name === "browser_take_screenshot" || name === "browser_screenshot") {
      const response = this.screenshotResponses[name];
      if (response?.kind === "error") {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: response.text,
            },
          ],
        };
      }
      if (response?.kind === "timeout") {
        throw new Error(response.message);
      }
      if (response?.kind === "snapshot") {
        await this.delay(response.delayMs);
        return {
          content: [
            {
              type: "text",
              text: response.text,
            },
          ],
        };
      }
      const outputArg = readScreenshotOutputArg(args);
      return { content: [{ type: "text", text: `screenshot ${outputArg ?? "captured"}` }] };
    }
    throw new Error(`unexpected raw tool: ${name}`);
  }

  private async delay(delayMs?: number): Promise<void> {
    if (!delayMs || delayMs <= 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}

function defaultSnapshotText(): string {
  return [
    "### Open tabs",
    "- 0: (current) [Explore](https://www.xiaohongshu.com/explore)",
    "- 1: [Creator](https://creator.xiaohongshu.com/publish/publish?source=official)",
    "### Page",
    "- Page URL: https://www.xiaohongshu.com/explore",
    "- Page Title: Explore",
    "### Snapshot",
    "```yaml",
    "- generic [ref=e2]:",
    "  - button \"点赞\" [ref=el-like] [cursor=pointer]",
    "  - button \"Buy now\" [ref=el-buy] [cursor=pointer]",
    "  - link \"查看详情\" [ref=el-detail] [cursor=pointer]",
    "  - generic [ref=e107] [cursor=pointer]: 上传图文",
    "```",
  ].join("\n");
}

function defaultTabsListText(): string {
  return [
    "### Open tabs",
    "- 0: (current) [Explore](https://www.xiaohongshu.com/explore)",
    "- 1: [Creator](https://creator.xiaohongshu.com/publish/publish?source=official)",
  ].join("\n");
}

function findTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((item) => item.name === name);
  assert.ok(tool, `expected tool ${name} to be exposed`);
  return tool;
}

function readSchema(tool: ToolDefinition): Record<string, unknown> {
  assert.ok(tool.inputSchema && typeof tool.inputSchema === "object", `expected ${tool.name} to expose inputSchema`);
  return tool.inputSchema as Record<string, unknown>;
}

function readProperties(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = schema.properties;
  assert.ok(properties && typeof properties === "object" && !Array.isArray(properties), "schema.properties must be an object");
  return properties as Record<string, unknown>;
}

function readRequired(schema: Record<string, unknown>): string[] {
  const required = schema.required;
  assert.ok(Array.isArray(required), "schema.required must be an array");
  assert.ok(required.every((field) => typeof field === "string"), "schema.required entries must be strings");
  return required as string[];
}

function readObjectPropertySchema(schema: Record<string, unknown>, key: string): Record<string, unknown> {
  const properties = readProperties(schema);
  const property = properties[key];
  assert.ok(property && typeof property === "object" && !Array.isArray(property), `schema.properties.${key} must be an object`);
  return property as Record<string, unknown>;
}

function readScreenshotOutputArg(args: Record<string, unknown>): string | undefined {
  for (const key of ["filename", "path", "filePath"] as const) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function createObservationPassthroughComposition(
  observation: Record<string, unknown>,
): RefineToolComposition {
  const surface = {
    async connect(): Promise<void> {},
    async disconnect(): Promise<void> {},
    async listTools(): Promise<Array<{ name: string }>> {
      return [{ name: "observe.page" }];
    },
    async callTool(name: string, _args: Record<string, unknown>): Promise<Record<string, unknown>> {
      assert.equal(name, "observe.page");
      return observation;
    },
  };

  return {
    contextRef: {
      get() {
        return {};
      },
      set() {},
    },
    registry: {} as RefineToolComposition["registry"],
    surface: surface as RefineToolComposition["surface"],
    hookPipeline: {} as RefineToolComposition["hookPipeline"],
    toolHooks: {} as RefineToolComposition["toolHooks"],
  };
}

test("refine tool client module owns bootstrap tool-surface construction", () => {
  const client = createBootstrapRefineReactToolClient(new StubRawToolClient());
  const session = client.getSession();

  assert.equal(client instanceof RefineReactToolClient, true);
  assert.equal(session.runId, "bootstrap");
  assert.equal(session.task, "bootstrap");
  assert.equal(session.taskScope, "bootstrap");
});

test("refine tool client keeps service refs visible after composed rebinding", async () => {
  const composition = createRefineToolComposition({
    rawToolClient: new StubRawToolClient(),
    session: createRefineReactSession("run-1", "task-1", { taskScope: "search-product" }),
  });
  const client = new RefineReactToolClient(composition);

  await client.connect();
  client.setSession(createRefineReactSession("run-2", "task-2", { taskScope: "search-product" }));
  client.setHitlAnswerProvider(async () => "inline-answer");

  const reboundContext = composition.contextRef.get();
  assert.ok(reboundContext.browserService);
  assert.ok(reboundContext.runService);
  assert.equal("session" in reboundContext, false);
  assert.equal("hitlAnswerProvider" in reboundContext, false);

  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const answered = (await client.callTool("hitl.request", { prompt: "Need help" })) as Record<string, unknown>;
  await client.disconnect();

  const observation = observed.observation as Record<string, unknown>;
  assert.equal(observation.observationRef, "obs_run-2_1");
  assert.equal(answered.status, "answered");
});

test("refine tool client rebinding keeps browser observations on the latest session", async () => {
  const raw = new StubRawToolClient();
  const client = new RefineReactToolClient({
    rawClient: raw,
    session: createRefineReactSession("run-1", "task-1", { taskScope: "search-product" }),
  });

  assert.equal(client.getSession().runId, "run-1");
  client.setSession(createRefineReactSession("run-2", "task-2", { taskScope: "search-product" }));
  assert.equal(client.getSession().runId, "run-2");

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  await client.disconnect();

  const observation = observed.observation as Record<string, unknown>;
  assert.equal(observation.observationRef, "obs_run-2_1");
});

test("composite tool client exposes exactly twelve refine-agent facing tools", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-1", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const tools = await client.listTools();
  await client.disconnect();

  assert.deepEqual(
    tools.slice(0, 9).map((item) => item.name),
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
    tools.map((item) => item.name),
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
      "hitl.request",
      "knowledge.record_candidate",
      "run.finish",
    ]
  );
});

test("composite tool client emits frozen field-level input schemas for critical tools", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-schema", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const tools = await client.listTools();
  await client.disconnect();

  const runFinish = readSchema(findTool(tools, "run.finish"));
  assert.equal(runFinish.type, "object");
  assert.equal(runFinish.additionalProperties, false);
  assert.deepEqual(readRequired(runFinish), ["reason", "summary"]);
  assert.equal(readObjectPropertySchema(runFinish, "reason").type, "string");
  assert.deepEqual(readObjectPropertySchema(runFinish, "reason").enum, ["goal_achieved", "hard_failure"]);
  assert.equal(readObjectPropertySchema(runFinish, "summary").type, "string");

  const actClick = readSchema(findTool(tools, "act.click"));
  assert.equal(actClick.type, "object");
  assert.equal(actClick.additionalProperties, false);
  assert.deepEqual(readRequired(actClick), ["elementRef", "sourceObservationRef"]);
  assert.equal(readObjectPropertySchema(actClick, "elementRef").type, "string");
  assert.equal(readObjectPropertySchema(actClick, "sourceObservationRef").type, "string");

  const selectTab = readSchema(findTool(tools, "act.select_tab"));
  assert.equal(selectTab.type, "object");
  assert.equal(selectTab.additionalProperties, false);
  assert.deepEqual(readRequired(selectTab), ["tabIndex", "sourceObservationRef"]);
  assert.equal(readObjectPropertySchema(selectTab, "tabIndex").type, "integer");
  assert.equal(readObjectPropertySchema(selectTab, "sourceObservationRef").type, "string");

  const recordCandidate = readSchema(findTool(tools, "knowledge.record_candidate"));
  assert.equal(recordCandidate.type, "object");
  assert.equal(recordCandidate.additionalProperties, false);
  assert.deepEqual(readRequired(recordCandidate), ["taskScope", "page", "category", "cue", "sourceObservationRef"]);
  assert.equal(readObjectPropertySchema(recordCandidate, "taskScope").type, "string");
  assert.equal(readObjectPropertySchema(recordCandidate, "cue").type, "string");
  assert.equal(readObjectPropertySchema(recordCandidate, "sourceObservationRef").type, "string");
  assert.deepEqual(readObjectPropertySchema(recordCandidate, "category").enum, ATTENTION_KNOWLEDGE_CATEGORIES);
  const pageSchema = readObjectPropertySchema(recordCandidate, "page");
  assert.equal(pageSchema.type, "object");
  assert.equal(pageSchema.additionalProperties, false);
  assert.deepEqual(readRequired(pageSchema), ["origin", "normalizedPath"]);
  assert.equal(readObjectPropertySchema(pageSchema, "origin").type, "string");
  assert.equal(readObjectPropertySchema(pageSchema, "normalizedPath").type, "string");

  const screenshot = readSchema(findTool(tools, "act.screenshot"));
  assert.equal(screenshot.type, "object");
  assert.equal(screenshot.additionalProperties, false);
  assert.ok(readRequired(screenshot).includes("sourceObservationRef"));
  const screenshotProperties = readProperties(screenshot);
  assert.ok(
    typeof screenshotProperties.filename === "object" ||
      typeof screenshotProperties.path === "object" ||
      typeof screenshotProperties.filePath === "object",
    "act.screenshot must define an output path field"
  );

  const fileUpload = readSchema(findTool(tools, "act.file_upload"));
  assert.equal(fileUpload.type, "object");
  assert.equal(fileUpload.additionalProperties, false);
  assert.deepEqual(readRequired(fileUpload), ["sourceObservationRef"]);
  const fileUploadProperties = readProperties(fileUpload);
  assert.equal(readObjectPropertySchema(fileUpload, "sourceObservationRef").type, "string");
  assert.equal(readObjectPropertySchema(fileUpload, "paths").type, "array");
  assert.deepEqual((fileUploadProperties.paths as Record<string, unknown>).items, { type: "string" });
});

test("runtime tool facade keeps existing behavior contracts on the legacy client path", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-runtime-contract", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({
    rawClient: raw,
    session,
    hitlAnswerProvider: async () => "Human confirmed",
  });

  await client.connect();
  const hitl = await client.callTool("hitl.request", {
    prompt: "Need human confirmation",
    context: "modal is blocking progress",
  });
  const candidate = await client.callTool("knowledge.record_candidate", {
    taskScope: "search-product",
    page: {
      origin: "https://www.xiaohongshu.com",
      normalizedPath: "/explore",
    },
    category: "keep",
    cue: "Need to confirm selection before submit",
    rationale: "Submit can have side effects",
    sourceObservationRef: "obs-runtime-1",
  });
  const finish = await client.callTool("run.finish", {
    reason: "goal_achieved",
    summary: "done",
  });
  await client.disconnect();

  assert.deepEqual(hitl, {
    status: "answered",
    answer: "Human confirmed",
  });
  assert.deepEqual(candidate, {
    accepted: true,
    candidateId: "candidate_1",
  });
  assert.deepEqual(finish, {
    accepted: true,
    finalStatus: "completed",
  });
  assert.deepEqual(session.finishState(), {
    reason: "goal_achieved",
    summary: "done",
    finalStatus: "completed",
  });
});

test("runtime tool facade rebinds the latest HITL provider before answered requests", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-runtime-provider", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({
    rawClient: raw,
    session,
    hitlAnswerProvider: async () => "Human confirmed",
  });

  await client.connect();
  const first = await client.callTool("hitl.request", {
    prompt: "Need human confirmation",
    context: "modal is blocking progress",
  });
  client.setHitlAnswerProvider(async () => "Updated answer");
  const second = await client.callTool("hitl.request", {
    prompt: "Need human confirmation",
    context: "modal is blocking progress",
  });
  await client.disconnect();

  assert.deepEqual(first, {
    status: "answered",
    answer: "Human confirmed",
  });
  assert.deepEqual(second, {
    status: "answered",
    answer: "Updated answer",
  });
});

test("observe.query uses only deterministic structural narrowing and ignores intent semantics", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-2", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  await client.callTool("observe.page", {});

  const queryA = await client.callTool("observe.query", {
    mode: "search",
    text: "buy",
    role: "button",
    limit: 5,
    intent: "please prioritize conversion CTA and semantic purchase intent",
  });

  const queryB = await client.callTool("observe.query", {
    mode: "search",
    text: "buy",
    role: "button",
    limit: 5,
    intent: "this intent should not change inclusion/ranking at all",
  });

  await client.disconnect();

  assert.deepEqual(queryA, queryB);

  const resultRecord = queryA as Record<string, unknown>;
  const matches = resultRecord.matches as Array<Record<string, unknown>>;
  assert.equal(matches.length, 1);
  assert.equal(matches[0].elementRef, "el-buy");
  assert.equal(matches[0].sourceObservationRef, resultRecord.observationRef);
  assert.equal(matches[0].role, "button");
  assert.equal(matches[0].rawText, "Buy now");
  assert.equal(matches[0].normalizedText, "buy now");
});

test("observe.page parses markdown page identity, stabilization readiness, and tab views from snapshot", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-page", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  await client.disconnect();

  const observation = observed.observation as Record<string, unknown>;
  const page = observation.page as Record<string, unknown>;
  assert.equal(page.url, "https://www.xiaohongshu.com/explore");
  assert.equal(page.origin, "https://www.xiaohongshu.com");
  assert.equal(page.normalizedPath, "/explore");
  assert.equal(page.title, "Explore");
  assert.equal(observation.observationReadiness, "ready");
  assert.equal(observation.pageTab?.title, "Explore");
  assert.deepEqual(
    (observation.taskRelevantTabs as Array<Record<string, unknown>>).map((tab) => tab.title),
    ["Explore", "Creator"]
  );
  assert.equal(observation.activeTabIndex, 0);
  assert.equal(observation.activeTabMatchesPage, true);
  const tabs = observation.tabs as Array<Record<string, unknown>>;
  assert.equal(tabs.length, 2);
  assert.equal(tabs[0].index, 0);
  assert.equal(tabs[0].isActive, true);
  assert.equal(tabs[1].isActive, false);
});

test("observe.page returns a bootstrap-safe payload shape with string identity fields", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-page-shape", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  await client.disconnect();

  const observation = observed.observation as Record<string, unknown>;
  const page = observation.page as Record<string, unknown>;

  assert.equal(typeof observation.observationRef, "string");
  assert.equal(typeof observation.snapshot, "string");
  assert.equal(typeof page.origin, "string");
  assert.equal(typeof page.normalizedPath, "string");
  assert.equal(typeof page.title, "string");
});

test("observe.page response keeps the approved readiness and derived tab views alongside raw tabs", async () => {
  const observed = {
    observation: {
      observationRef: "obs-1",
      capturedAt: "2026-03-24T10:00:00.000Z",
      observationReadiness: "ready",
      page: {
        url: "https://www.xiaohongshu.com/explore",
        origin: "https://www.xiaohongshu.com",
        normalizedPath: "/explore",
        title: "Explore",
      },
      pageTab: {
        index: 0,
        url: "https://www.xiaohongshu.com/explore",
        title: "Explore",
        isActive: true,
      },
      taskRelevantTabs: [
        {
          index: 0,
          url: "https://www.xiaohongshu.com/explore",
          title: "Explore",
          isActive: true,
        },
      ],
      tabs: [
        {
          index: 0,
          url: "https://www.xiaohongshu.com/explore",
          title: "Explore",
          isActive: true,
        },
        {
          index: 1,
          url: "about:blank",
          title: "New Tab",
          isActive: false,
        },
      ],
      snapshot: "<page snapshot>",
    },
  };

  const client = new RefineReactToolClient(createObservationPassthroughComposition(observed));

  await client.connect();
  const result = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  await client.disconnect();

  const observation = result.observation as Record<string, unknown>;
  const tabs = observation.tabs as Array<Record<string, unknown>>;
  const taskRelevantTabs = observation.taskRelevantTabs as Array<Record<string, unknown>>;

  assert.deepEqual(result, observed);
  assert.equal(observation.snapshot, "<page snapshot>");
  assert.equal(observation.observationReadiness, "ready");
  assert.equal(observation.pageTab?.url, "https://www.xiaohongshu.com/explore");
  assert.equal(observation.pageTab?.isActive, true);
  assert.equal(tabs.length, 2);
  assert.equal(tabs[1].url, "about:blank");
  assert.equal(taskRelevantTabs.length, 1);
  assert.equal(taskRelevantTabs[0].url, "https://www.xiaohongshu.com/explore");
});

test("observe.page prefers the active tab identity when modal state leaves Page URL stale", async () => {
  const raw = new StubRawToolClient({
    snapshotText: [
      "### Open tabs",
      "- 0: [Explore](https://www.xiaohongshu.com/explore)",
      "- 1: [](about:blank)",
      "- 2: [Omnibox Popup](chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html)",
      "- 3: [Omnibox Popup](chrome://omnibox-popup.top-chrome/)",
      "- 4: (current) [](https://creator.xiaohongshu.com/publish/publish?from=homepage&target=image&openFilePicker=true)",
      "### Page",
      "- Page URL: https://www.xiaohongshu.com/explore",
      "- Page Title: 小红书 - 你的生活兴趣社区",
      "### Modal state",
      "- [File chooser]: can be handled by browser_file_upload",
      "### Snapshot",
      "```yaml",
      "",
      "```",
    ].join("\n"),
  });
  const session = createRefineReactSession("run-modal-tab", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  await client.disconnect();

  const observation = observed.observation as Record<string, unknown>;
  const page = observation.page as Record<string, unknown>;
  assert.equal(page.url, "https://creator.xiaohongshu.com/publish/publish?from=homepage&target=image&openFilePicker=true");
  assert.equal(page.origin, "https://creator.xiaohongshu.com");
  assert.equal(page.normalizedPath, "/publish/publish");
  assert.equal(observation.activeTabIndex, 4);
});

test("act.screenshot routes to browser_take_screenshot with mapped parameters", async () => {
  const raw = new StubRawToolClient({ screenshotToolName: "browser_take_screenshot" });
  const session = createRefineReactSession("run-shot-1", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  await client.callTool("act.screenshot", {
    sourceObservationRef: observationRef,
    filename: "artifacts/test-screenshot.png",
    fullPage: true,
  });
  await client.disconnect();

  const screenshotCall = raw.calls.find((call) => call.name === "browser_take_screenshot");
  assert.ok(screenshotCall, "expected act.screenshot to route to browser_take_screenshot");
  assert.equal(readScreenshotOutputArg(screenshotCall.args), "artifacts/test-screenshot.png");
  assert.equal(screenshotCall.args.fullPage, true);
  assert.ok(!("sourceObservationRef" in screenshotCall.args), "raw screenshot args should not include provenance field");
});

test("act.screenshot falls back to browser_screenshot when take_screenshot is unavailable", async () => {
  const raw = new StubRawToolClient({ screenshotToolName: "browser_screenshot" });
  const session = createRefineReactSession("run-shot-2", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  await client.callTool("act.screenshot", {
    sourceObservationRef: observationRef,
    path: "artifacts/fallback-screenshot.png",
    fullPage: false,
  });
  await client.disconnect();

  const fallbackCall = raw.calls.find((call) => call.name === "browser_screenshot");
  assert.ok(fallbackCall, "expected act.screenshot to route to browser_screenshot fallback");
  assert.equal(readScreenshotOutputArg(fallbackCall.args), "artifacts/fallback-screenshot.png");
  assert.equal(fallbackCall.args.fullPage, false);
  assert.ok(!raw.calls.some((call) => call.name === "browser_take_screenshot"));
});

test("act.screenshot keeps falling back when a screenshot tool returns an MCP error result", async () => {
  const raw = new StubRawToolClient({
    screenshotToolNames: ["browser_take_screenshot", "browser_screenshot"],
    screenshotResponses: {
      browser_take_screenshot: {
        kind: "error",
        text: defaultSnapshotText(),
      },
      browser_screenshot: {
        kind: "snapshot",
        text: defaultSnapshotText(),
      },
    },
  });
  const session = createRefineReactSession("run-shot-error-result", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  await client.callTool("act.screenshot", {
    sourceObservationRef: observationRef,
    filename: "artifacts/error-result-screenshot.png",
    fullPage: true,
  });
  await client.disconnect();

  const fallbackCall = raw.calls.find((call) => call.name === "browser_screenshot");
  assert.ok(fallbackCall, "expected act.screenshot to continue to browser_screenshot after an error result");
  assert.ok(raw.calls.some((call) => call.name === "browser_take_screenshot"));
  assert.equal(readScreenshotOutputArg(fallbackCall.args), "artifacts/error-result-screenshot.png");
});

test("act.screenshot keeps falling back when a screenshot tool returns a textual MCP error result", async () => {
  const raw = new StubRawToolClient({
    screenshotToolNames: ["browser_take_screenshot", "browser_screenshot"],
    screenshotResponses: {
      browser_take_screenshot: {
        kind: "error",
        text: [
          "### Error",
          "browser_take_screenshot returned an MCP error result",
        ].join("\n"),
      },
      browser_screenshot: {
        kind: "snapshot",
        text: defaultSnapshotText(),
      },
    },
  });
  const session = createRefineReactSession("run-shot-text-error", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  await client.callTool("act.screenshot", {
    sourceObservationRef: observationRef,
    path: "artifacts/text-error-result-screenshot.png",
    fullPage: false,
  });
  await client.disconnect();

  const fallbackCall = raw.calls.find((call) => call.name === "browser_screenshot");
  assert.ok(fallbackCall, "expected act.screenshot to continue to browser_screenshot after textual error output");
  assert.ok(raw.calls.some((call) => call.name === "browser_take_screenshot"));
  assert.equal(readScreenshotOutputArg(fallbackCall.args), "artifacts/text-error-result-screenshot.png");
});

test("act.select_tab routes to browser_tabs select action", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-tab", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  const action = (await client.callTool("act.select_tab", {
    tabIndex: 1,
    sourceObservationRef: observationRef,
  })) as Record<string, unknown>;
  await client.disconnect();

  const selectCall = raw.calls.find((call) => call.name === "browser_tabs" && call.args.action === "select");
  assert.ok(selectCall, "expected act.select_tab to call browser_tabs action=select");
  assert.equal(selectCall.args.index, 1);
  const result = action.result as Record<string, unknown>;
  assert.equal(result.action, "select_tab");
  assert.equal(result.success, true);
});

test("act.type, act.press, and act.navigate keep legacy adapter behavior unchanged", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-core-actions", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  const typed = (await client.callTool("act.type", {
    elementRef: "el-input",
    sourceObservationRef: observationRef,
    text: "hello world",
    submit: true,
  })) as Record<string, unknown>;
  const pressed = (await client.callTool("act.press", {
    key: "Enter",
    sourceObservationRef: observationRef,
  })) as Record<string, unknown>;
  const navigated = (await client.callTool("act.navigate", {
    url: "https://example.com/checkout",
    sourceObservationRef: observationRef,
  })) as Record<string, unknown>;
  await client.disconnect();

  const typeCall = raw.calls.find((call) => call.name === "browser_type");
  const pressCall = raw.calls.find((call) => call.name === "browser_press_key");
  const navigateCall = raw.calls.find((call) => call.name === "browser_navigate");

  assert.deepEqual(typeCall?.args, {
    ref: "el-input",
    text: "hello world",
    submit: true,
  });
  assert.deepEqual(pressCall?.args, {
    key: "Enter",
  });
  assert.deepEqual(navigateCall?.args, {
    url: "https://example.com/checkout",
  });
  assert.equal((typed.result as Record<string, unknown>).action, "type");
  assert.equal((pressed.result as Record<string, unknown>).action, "press");
  assert.equal((navigated.result as Record<string, unknown>).action, "navigate");
});

test("act.navigate aligns the visible page by selecting the parsed active tab after navigation", async () => {
  const raw = new StubRawToolClient({
    navigateText: [
      "### Open tabs",
      "- 0: (current) [Seller](https://seller.tiktokshopglobalselling.com/homepage?shop_region=VN)",
      "- 1: [](about:blank)",
      "- 2: [Omnibox Popup](chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html)",
      "### Page",
      "- Page URL: https://seller.tiktokshopglobalselling.com/homepage?shop_region=VN",
      "- Page Title: Seller",
      "### Snapshot",
      "```yaml",
      "- generic [ref=e2]:",
      "  - button \"客户消息\" [ref=el-messages] [cursor=pointer]",
      "```",
    ].join("\n"),
  });
  const session = createRefineReactSession("run-navigate-align", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  await client.callTool("act.navigate", {
    url: "https://seller.tiktokshopglobalselling.com/homepage?shop_region=VN",
    sourceObservationRef: observationRef,
  });
  await client.disconnect();

  const navigateCall = raw.calls.find((call) => call.name === "browser_navigate");
  const selectCall = raw.calls.find((call) => call.name === "browser_tabs" && call.args.action === "select");

  assert.ok(navigateCall, "expected act.navigate to call browser_navigate");
  assert.ok(selectCall, "expected act.navigate to realign the visible tab after navigation");
  assert.equal(selectCall.args.index, 0);
});

test("act.file_upload routes to browser_file_upload with provided paths", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-upload-1", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  const action = (await client.callTool("act.file_upload", {
    sourceObservationRef: observationRef,
    paths: ["~/Downloads/foo.png", "~/Downloads/bar.png"],
  })) as Record<string, unknown>;
  await client.disconnect();

  const uploadCall = raw.calls.find((call) => call.name === "browser_file_upload");
  assert.ok(uploadCall, "expected act.file_upload to call browser_file_upload");
  assert.deepEqual(uploadCall.args.paths, ["~/Downloads/foo.png", "~/Downloads/bar.png"]);
  const result = action.result as Record<string, unknown>;
  assert.equal(result.action, "file_upload");
  assert.equal(result.success, true);
});

test("act.file_upload preserves exact path strings when forwarding to browser_file_upload", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-upload-spaces", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  await client.callTool("act.file_upload", {
    sourceObservationRef: observationRef,
    paths: ["  ~/Downloads/foo.png  ", "\t~/Downloads/bar.png\n"],
  });
  await client.disconnect();

  const uploadCall = raw.calls.find((call) => call.name === "browser_file_upload");
  assert.ok(uploadCall, "expected act.file_upload to call browser_file_upload");
  assert.deepEqual(uploadCall.args.paths, ["  ~/Downloads/foo.png  ", "\t~/Downloads/bar.png\n"]);
});

test("act.file_upload cancels file chooser by calling browser_file_upload without paths", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-upload-2", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  await client.callTool("act.file_upload", {
    sourceObservationRef: observationRef,
  });
  await client.callTool("act.file_upload", {
    sourceObservationRef: observationRef,
    paths: [],
  });
  await client.disconnect();

  const uploadCalls = raw.calls.filter((call) => call.name === "browser_file_upload");
  assert.equal(uploadCalls.length, 2);
  assert.ok(!("paths" in uploadCalls[0].args), "expected cancel upload to omit paths");
  assert.ok(!("paths" in uploadCalls[1].args), "expected cancel upload to omit paths");
});

test("act.file_upload rejects non-array paths values", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-upload-invalid-type", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  await assert.rejects(
    () =>
      client.callTool("act.file_upload", {
        sourceObservationRef: observationRef,
        paths: "foo.png",
      }),
    /invalid argument: paths/
  );
  await client.disconnect();
});

test("act.file_upload rejects arrays containing non-string path entries", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-upload-invalid-entry", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  await assert.rejects(
    () =>
      client.callTool("act.file_upload", {
        sourceObservationRef: observationRef,
        paths: ["foo.png", 123],
      }),
    /invalid argument: paths/
  );
  await client.disconnect();
});

test("action reports success=false when tool output is explicit error text", async () => {
  const raw = new StubRawToolClient({
    clickText: "### Error\nTimeoutError: locator.click: Timeout 5000ms exceeded.",
  });
  const session = createRefineReactSession("run-click-error", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  const action = (await client.callTool("act.click", {
    elementRef: "el-like",
    sourceObservationRef: observationRef,
  })) as Record<string, unknown>;
  await client.disconnect();

  const result = action.result as Record<string, unknown>;
  assert.equal(result.success, false);
});

test("action fails fast when sourceObservationRef tab is stale against live active tab", async () => {
  const raw = new StubRawToolClient({
    tabsListText: [
      "### Open tabs",
      "- 0: [Explore](https://www.xiaohongshu.com/explore)",
      "- 1: (current) [Creator](https://creator.xiaohongshu.com/publish/publish?source=official)",
    ].join("\n"),
  });
  const session = createRefineReactSession("run-stale-tab", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  await assert.rejects(
    () =>
      client.callTool("act.click", {
        elementRef: "el-buy",
        sourceObservationRef: observationRef,
      }),
    /sourceObservationRef|tab/i
  );
  await client.disconnect();
});

test("act.file_upload fails fast when sourceObservationRef tab is stale against live active tab", async () => {
  const raw = new StubRawToolClient({
    tabsListText: [
      "### Open tabs",
      "- 0: [Explore](https://www.xiaohongshu.com/explore)",
      "- 1: (current) [Creator](https://creator.xiaohongshu.com/publish/publish?source=official)",
    ].join("\n"),
  });
  const session = createRefineReactSession("run-stale-upload", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const observationRef = observation.observationRef as string;
  await assert.rejects(
    () =>
      client.callTool("act.file_upload", {
        sourceObservationRef: observationRef,
        paths: ["~/Downloads/foo.png"],
      }),
    /sourceObservationRef|tab/i
  );
  await client.disconnect();
});
