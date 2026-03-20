import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallResult, ToolClient, ToolDefinition } from "../../src/contracts/tool-client.js";
import { ATTENTION_KNOWLEDGE_CATEGORIES } from "../../src/domain/attention-knowledge.js";
import { createRefineReactSession } from "../../src/runtime/replay-refinement/refine-react-session.js";
import { RefineReactToolClient } from "../../src/runtime/replay-refinement/refine-react-tool-client.js";

interface StubRawToolClientOptions {
  screenshotToolName?: "browser_take_screenshot" | "browser_screenshot";
  snapshotText?: string;
  clickText?: string;
  tabsListText?: string;
  tabSelectText?: string;
  includeBrowserTabsTool?: boolean;
}

class StubRawToolClient implements ToolClient {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  private readonly tools: ToolDefinition[];
  private readonly snapshotText: string;
  private readonly clickText: string;
  private readonly tabsListText: string;
  private readonly tabSelectText: string;

  constructor(options?: StubRawToolClientOptions) {
    const screenshotToolName = options?.screenshotToolName ?? "browser_take_screenshot";
    const includeBrowserTabsTool = options?.includeBrowserTabsTool ?? true;
    this.snapshotText = options?.snapshotText ?? defaultSnapshotText();
    this.clickText = options?.clickText ?? "clicked";
    this.tabsListText = options?.tabsListText ?? defaultTabsListText();
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
      { name: screenshotToolName },
    ];
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
      return { content: [{ type: "text", text: `navigated ${String(args.url ?? "")}` }] };
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
      const outputArg = readScreenshotOutputArg(args);
      return { content: [{ type: "text", text: `screenshot ${outputArg ?? "captured"}` }] };
    }
    throw new Error(`unexpected raw tool: ${name}`);
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

test("composite tool client exposes exactly eleven refine-agent facing tools", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-1", "task", { taskScope: "search-product" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  await client.connect();
  const tools = await client.listTools();
  await client.disconnect();

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

test("observe.page parses markdown page identity and tab metadata from snapshot", async () => {
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
  assert.equal(observation.activeTabIndex, 0);
  assert.equal(observation.activeTabMatchesPage, true);
  const tabs = observation.tabs as Array<Record<string, unknown>>;
  assert.equal(tabs.length, 2);
  assert.equal(tabs[0].index, 0);
  assert.equal(tabs[0].isActive, true);
  assert.equal(tabs[1].isActive, false);
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
