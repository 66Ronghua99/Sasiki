import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallResult, ToolClient, ToolDefinition } from "../../src/contracts/tool-client.js";
import { ATTENTION_KNOWLEDGE_CATEGORIES } from "../../src/domain/attention-knowledge.js";
import { createRefineReactSession } from "../../src/runtime/replay-refinement/refine-react-session.js";
import { RefineReactToolClient } from "../../src/runtime/replay-refinement/refine-react-tool-client.js";

interface StubRawToolClientOptions {
  screenshotToolName?: "browser_take_screenshot" | "browser_screenshot";
}

class StubRawToolClient implements ToolClient {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  private readonly tools: ToolDefinition[];

  constructor(options?: StubRawToolClientOptions) {
    const screenshotToolName = options?.screenshotToolName ?? "browser_take_screenshot";
    this.tools = [
      { name: "browser_snapshot" },
      { name: "browser_click" },
      { name: "browser_type" },
      { name: "browser_press_key" },
      { name: "browser_navigate" },
      { name: screenshotToolName },
    ];
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
            text: [
              "URL: https://www.xiaohongshu.com/explore",
              "TITLE: Explore",
              "[button|el-like] 点赞",
              "[button|el-buy] Buy now",
              "[link|el-detail] 查看详情",
            ].join("\n"),
          },
        ],
      };
    }
    if (name === "browser_click") {
      return { content: [{ type: "text", text: `clicked ${String(args.ref ?? "")}` }] };
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
    if (name === "browser_take_screenshot" || name === "browser_screenshot") {
      const outputArg = readScreenshotOutputArg(args);
      return { content: [{ type: "text", text: `screenshot ${outputArg ?? "captured"}` }] };
    }
    throw new Error(`unexpected raw tool: ${name}`);
  }
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

test("composite tool client exposes exactly ten refine-agent facing tools", async () => {
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
