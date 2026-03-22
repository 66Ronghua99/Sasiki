import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolCallResult, ToolClient, ToolDefinition } from "../../src/contracts/tool-client.js";
import type { HitlController } from "../../src/contracts/hitl-controller.js";
import type { Logger } from "../../src/contracts/logger.js";
import type { AgentRunResult } from "../../src/domain/agent-types.js";
import { PromptProvider } from "../../src/application/refine/prompt-provider.js";
import { RefineRunBootstrapProvider } from "../../src/application/refine/refine-run-bootstrap-provider.js";
import { AttentionGuidanceLoader } from "../../src/application/refine/attention-guidance-loader.js";
import { AttentionKnowledgeStore } from "../../src/infrastructure/persistence/attention-knowledge-store.js";
import { createRefineReactSession } from "../../src/application/refine/refine-react-session.js";
import { RefineHitlResumeStore } from "../../src/infrastructure/persistence/refine-hitl-resume-store.js";
import { ReactRefinementRunExecutor } from "../../src/application/refine/react-refinement-run-executor.js";
import { RefineReactToolClient } from "../../src/application/refine/refine-react-tool-client.js";
import type { RuntimeTelemetryRegistry } from "../../src/contracts/runtime-telemetry.js";

class StubLogger implements Logger {
  info(): void {}
  warn(): void {}
  error(): void {}
}

class StubRawToolClient implements ToolClient {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async listTools(): Promise<ToolDefinition[]> {
    return [
      { name: "browser_snapshot" },
      { name: "browser_click" },
      { name: "browser_type" },
      { name: "browser_press_key" },
      { name: "browser_navigate" },
      { name: "browser_take_screenshot" },
      { name: "browser_screenshot" },
    ];
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
              "[button|el-buy] Buy now",
              "[button|el-like] 点赞",
            ].join("\n"),
          },
        ],
      };
    }
    if (name === "browser_click") {
      return { content: [{ type: "text", text: "clicked" }] };
    }
    if (name === "browser_type") {
      return { content: [{ type: "text", text: "typed" }] };
    }
    if (name === "browser_press_key") {
      return { content: [{ type: "text", text: "pressed" }] };
    }
    if (name === "browser_navigate") {
      return { content: [{ type: "text", text: "navigated" }] };
    }
    if (name === "browser_take_screenshot" || name === "browser_screenshot") {
      const outputPath =
        typeof args.filename === "string"
          ? args.filename
          : typeof args.path === "string"
            ? args.path
            : typeof args.filePath === "string"
              ? args.filePath
              : "unknown";
      return { content: [{ type: "text", text: `screenshot:${outputPath}` }] };
    }
    throw new Error(`unexpected tool: ${name}`);
  }
}

class StubHitlController implements HitlController {
  async requestIntervention(): Promise<{ humanAction: string; resumeInstruction: string; nextTimeRule: string }> {
    return {
      humanAction: "human fixed it",
      resumeInstruction: "continue with confirmed button",
      nextTimeRule: "ask less often",
    };
  }
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

class FakeLoop {
  private readonly script: (task: string) => Promise<AgentRunResult>;
  runtimeTelemetry: unknown = null;
  readonly calls: string[] = [];
  readonly hookContexts: Array<Record<string, unknown>> = [];

  constructor(script: (task: string) => Promise<AgentRunResult>) {
    this.script = script;
  }

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  abort(): void {}
  setRuntimeTelemetry(runtimeTelemetry: unknown): void {
    this.runtimeTelemetry = runtimeTelemetry;
  }

  setToolHookContext(context: Record<string, unknown>): void {
    this.hookContexts.push(context);
  }

  async run(task: string): Promise<AgentRunResult> {
    this.calls.push("run");
    return this.script(task);
  }

  async captureFinalScreenshot(): Promise<string | undefined> {
    return undefined;
  }

  snapshotProgress(): { steps: []; mcpCalls: []; assistantTurns: []; highLevelLogs: [] } {
    return { steps: [], mcpCalls: [], assistantTurns: [], highLevelLogs: [] };
  }
}

function buildBaseLoopResult(task: string, status: AgentRunResult["status"] = "completed"): AgentRunResult {
  return {
    task,
    status,
    finishReason: "ok",
    steps: [],
    mcpCalls: [],
    assistantTurns: [
      {
        index: 1,
        timestamp: new Date().toISOString(),
        text: "turn",
        thinking: "",
        toolCalls: [],
      },
    ],
  };
}

function createRefinementStores(tmpRoot: string): {
  knowledgeStore: AttentionKnowledgeStore;
  guidanceLoader: AttentionGuidanceLoader;
  hitlResumeStore: RefineHitlResumeStore;
} {
  const knowledgeStore = new AttentionKnowledgeStore({
    filePath: path.join(tmpRoot, "knowledge-store.json"),
  });

  return {
    knowledgeStore,
    guidanceLoader: new AttentionGuidanceLoader(knowledgeStore),
    hitlResumeStore: new RefineHitlResumeStore({
      baseDir: tmpRoot,
    }),
  };
}

function createRefinementDependencies(
  tmpRoot: string,
  createRunId: () => string
): {
  knowledgeStore: AttentionKnowledgeStore;
  bootstrapProvider: RefineRunBootstrapProvider;
  telemetryRegistry: RuntimeTelemetryRegistry;
} {
  const stores = createRefinementStores(tmpRoot);
  const checkpoints = {
    async append(): Promise<void> {},
    async dispose(): Promise<void> {},
  };
  return {
    knowledgeStore: stores.knowledgeStore,
    bootstrapProvider: new RefineRunBootstrapProvider({
      createRunId,
      guidanceLoader: stores.guidanceLoader,
      hitlResumeStore: stores.hitlResumeStore,
      promptProvider: new PromptProvider(),
      knowledgeTopN: 8,
    }),
    telemetryRegistry: {
      createRunTelemetry() {
        return {
          eventBus: {
            async emit(): Promise<void> {},
          },
          artifacts: {
            scope: {
              workflow: "refine",
              runId: "noop",
              artifactsDir: tmpRoot,
            },
            artifactsDir: tmpRoot,
            checkpointMode: "off",
            checkpoints,
            async dispose(): Promise<void> {},
          },
          async dispose(): Promise<void> {},
        };
      },
      async dispose(): Promise<void> {},
    },
  };
}

test("executor creates run-scoped telemetry before loop execution", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-refine-telemetry-"));
  const raw = new StubRawToolClient();
  const toolClient = new RefineReactToolClient({
    rawClient: raw,
    session: createRefineReactSession("bootstrap", "bootstrap task", { taskScope: "telemetry-task" }),
  });

  const createdScopes: Array<{ workflow: string; runId: string; artifactsDir: string }> = [];
  const lifecycleEvents: string[] = [];
  const telemetryRegistry: RuntimeTelemetryRegistry = {
    createRunTelemetry(scope) {
      createdScopes.push(scope);
      const checkpoints = {
        async append(): Promise<void> {},
        async dispose(): Promise<void> {},
      };
      return {
        eventBus: {
          async emit(event) {
            lifecycleEvents.push(`${event.eventType}:${String((event.payload as Record<string, unknown>).phase)}`);
          },
        },
        artifacts: {
          scope,
          artifactsDir: scope.artifactsDir,
          checkpointMode: "key_turns",
          checkpoints,
          async dispose(): Promise<void> {
            lifecycleEvents.push("artifacts.dispose");
          },
        },
        async dispose(): Promise<void> {
          lifecycleEvents.push("telemetry.dispose");
        },
      };
    },
    async dispose(): Promise<void> {},
  };

  const loop = new FakeLoop(async (task) => {
    assert.notEqual(loop.runtimeTelemetry, null);
    lifecycleEvents.push("loop.run");
    await toolClient.callTool("observe.page", {});
    await toolClient.callTool("run.finish", {
      reason: "goal_achieved",
      summary: "done",
    });
    return buildBaseLoopResult(task, "completed");
  });

  const { knowledgeStore, bootstrapProvider } = createRefinementDependencies(tmpRoot, () => "run-telemetry");
  const executor = new ReactRefinementRunExecutor({
    loop: loop as never,
    logger: new StubLogger(),
    artifactsDir: tmpRoot,
    maxTurns: 8,
    telemetryRegistry,
    toolClient,
    knowledgeStore,
    bootstrapProvider,
  });

  const result = await executor.execute({
    task: "confirm telemetry",
  });

  assert.equal(result.runId, "run-telemetry");
  assert.deepEqual(createdScopes, [
    {
      workflow: "refine",
      runId: "run-telemetry",
      artifactsDir: path.join(tmpRoot, "run-telemetry"),
    },
  ]);
  assert.deepEqual(lifecycleEvents.slice(0, 2), ["workflow.lifecycle:started", "loop.run"]);
  assert.ok(lifecycleEvents.includes("workflow.lifecycle:finished"));
  assert.equal(loop.runtimeTelemetry, null);
});

test("executor updates loop hook context from the active refine session after bootstrap", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-refine-hook-context-"));
  const raw = new StubRawToolClient();
  const toolClient = new RefineReactToolClient({
    rawClient: raw,
    session: createRefineReactSession("bootstrap", "bootstrap task", { taskScope: "hook-task" }),
  });
  const loop = new FakeLoop(async (task) => {
    await toolClient.callTool("run.finish", {
      reason: "goal_achieved",
      summary: "done",
    });
    return buildBaseLoopResult(task);
  });
  const { knowledgeStore, bootstrapProvider, telemetryRegistry } = createRefinementDependencies(
    tmpRoot,
    () => "run-hook-context",
  );
  const executor = new ReactRefinementRunExecutor({
    loop: loop as never,
    logger: new StubLogger(),
    artifactsDir: tmpRoot,
    maxTurns: 8,
    telemetryRegistry,
    toolClient,
    knowledgeStore,
    bootstrapProvider,
  });

  await executor.execute({
    task: "confirm hook context",
  });

  assert.deepEqual(loop.hookContexts, [
    {
      runId: "run-hook-context",
      sessionId: "run-hook-context",
      stepIndex: 0,
    },
  ]);
});

test("executor rejects when lifecycle telemetry emit fails", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-refine-telemetry-fail-"));
  const raw = new StubRawToolClient();
  const toolClient = new RefineReactToolClient({
    rawClient: raw,
    session: createRefineReactSession("bootstrap", "bootstrap task", { taskScope: "telemetry-fail-task" }),
  });

  const telemetryRegistry: RuntimeTelemetryRegistry = {
    createRunTelemetry() {
      const checkpoints = {
        async append(): Promise<void> {},
        async dispose(): Promise<void> {},
      };
      return {
        eventBus: {
          async emit() {
            throw new Error("telemetry emit failed");
          },
        },
        artifacts: {
          scope: {
            workflow: "refine",
            runId: "run-telemetry-fail",
            artifactsDir: path.join(tmpRoot, "run-telemetry-fail"),
          },
          artifactsDir: path.join(tmpRoot, "run-telemetry-fail"),
          checkpointMode: "key_turns",
          checkpoints,
          async dispose(): Promise<void> {},
        },
        async dispose(): Promise<void> {},
      };
    },
    async dispose(): Promise<void> {},
  };

  const finishingLoop = new FakeLoop(async (task) => {
    await toolClient.callTool("run.finish", {
      reason: "goal_achieved",
      summary: "done",
    });
    return buildBaseLoopResult(task, "completed");
  });
  const { knowledgeStore, bootstrapProvider } = createRefinementDependencies(tmpRoot, () => "run-telemetry-fail");
  const executor = new ReactRefinementRunExecutor({
    loop: finishingLoop as never,
    logger: new StubLogger(),
    artifactsDir: tmpRoot,
    maxTurns: 8,
    telemetryRegistry,
    toolClient,
    knowledgeStore,
    bootstrapProvider,
  });

  await assert.rejects(
    executor.execute({
      task: "confirm telemetry",
    }),
    /telemetry emit failed/
  );
});

test("executor clears active telemetry before waiting on dispose so interrupt becomes a no-op", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-refine-teardown-"));
  const raw = new StubRawToolClient();
  const toolClient = new RefineReactToolClient({
    rawClient: raw,
    session: createRefineReactSession("bootstrap", "bootstrap task", { taskScope: "teardown-task" }),
  });

  const disposeGate = createDeferred<void>();
  const telemetryEvents: string[] = [];
  const telemetryRegistry: RuntimeTelemetryRegistry = {
    createRunTelemetry(scope) {
      const checkpoints = {
        async append(): Promise<void> {},
        async dispose(): Promise<void> {},
      };
      return {
        eventBus: {
          async emit(event) {
            telemetryEvents.push(`${event.eventType}:${String((event.payload as Record<string, unknown>).phase)}`);
          },
        },
        artifacts: {
          scope,
          artifactsDir: scope.artifactsDir,
          checkpointMode: "key_turns",
          checkpoints,
          async dispose(): Promise<void> {},
        },
        async dispose(): Promise<void> {
          telemetryEvents.push("telemetry.dispose.start");
          await disposeGate.promise;
          telemetryEvents.push("telemetry.dispose.end");
        },
      };
    },
    async dispose(): Promise<void> {},
  };

  const loop = new FakeLoop(async (task) => {
    await toolClient.callTool("run.finish", {
      reason: "goal_achieved",
      summary: "done",
    });
    return buildBaseLoopResult(task, "completed");
  });
  const { knowledgeStore, bootstrapProvider } = createRefinementDependencies(tmpRoot, () => "run-teardown");
  const executor = new ReactRefinementRunExecutor({
    loop: loop as never,
    logger: new StubLogger(),
    artifactsDir: tmpRoot,
    maxTurns: 8,
    telemetryRegistry,
    toolClient,
    knowledgeStore,
    bootstrapProvider,
  });

  const executePromise = executor.execute({
    task: "confirm telemetry",
  });

  await new Promise<void>((resolve) => {
    const poll = () => {
      if (telemetryEvents.includes("telemetry.dispose.start")) {
        resolve();
        return;
      }
      setImmediate(poll);
    };
    poll();
  });

  const interruptAccepted = await executor.requestInterrupt("SIGINT");
  disposeGate.resolve();
  const result = await executePromise;

  assert.equal(interruptAccepted, false);
  assert.equal(result.status, "completed");
  assert.equal(telemetryEvents.includes("workflow.lifecycle:interrupt_requested"), false);
});

test("executor runs browser observe/action through composite tools and persists promoted knowledge for next run", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-refine-run-"));
  const raw = new StubRawToolClient();
  const toolClient = new RefineReactToolClient({
    rawClient: raw,
    session: createRefineReactSession("bootstrap", "bootstrap task", { taskScope: "buy-task" }),
  });

  let runIdSeq = 0;
  const createRunId = (): string => {
    runIdSeq += 1;
    return `run_${runIdSeq}`;
  };

  const loop = new FakeLoop(async (task) => {
    await toolClient.callTool("observe.page", {});
    const query = (await toolClient.callTool("observe.query", {
      mode: "search",
      text: "buy",
      role: "button",
      limit: 3,
      intent: "semantic ranking should be ignored",
    })) as Record<string, unknown>;
    const first = (query.matches as Array<Record<string, unknown>>)[0];
    await toolClient.callTool("act.click", {
      elementRef: first.elementRef,
      sourceObservationRef: first.sourceObservationRef,
    });
    await toolClient.callTool("act.screenshot", {
      sourceObservationRef: first.sourceObservationRef,
      filename: "artifacts/proof.png",
      fullPage: true,
    });
    await toolClient.callTool("knowledge.record_candidate", {
      taskScope: "buy coffee beans",
      page: query.page,
      category: "action-target",
      cue: "buy button",
      sourceObservationRef: first.sourceObservationRef,
    });
    await toolClient.callTool("run.finish", {
      reason: "goal_achieved",
      summary: "clicked buy",
    });
    return buildBaseLoopResult(task, "completed");
  });

  const executor = new ReactRefinementRunExecutor({
    loop: loop as never,
    logger: new StubLogger(),
    artifactsDir: tmpRoot,
    maxTurns: 8,
    toolClient,
    ...createRefinementDependencies(tmpRoot, createRunId),
  });

  const firstRun = await executor.execute({
    task: "buy coffee beans",
  });
  assert.equal(firstRun.status, "completed");
  assert.ok(raw.calls.some((call) => call.name === "browser_snapshot"));
  assert.ok(raw.calls.some((call) => call.name === "browser_click"));
  assert.ok(raw.calls.some((call) => call.name === "browser_take_screenshot" || call.name === "browser_screenshot"));

  const secondLoop = new FakeLoop(async (task) => {
    await toolClient.callTool("observe.page", {});
    await toolClient.callTool("run.finish", {
      reason: "goal_achieved",
      summary: "done",
    });
    return buildBaseLoopResult(task, "completed");
  });

  const secondExecutor = new ReactRefinementRunExecutor({
    loop: secondLoop as never,
    logger: new StubLogger(),
    artifactsDir: tmpRoot,
    maxTurns: 8,
    toolClient,
    ...createRefinementDependencies(tmpRoot, createRunId),
  });

  const secondRun = await secondExecutor.execute({
    task: "buy coffee beans",
  });
  assert.equal(secondRun.status, "completed");

  const runSummaryPath = path.join(secondRun.artifactsDir ?? "", "run_summary.json");
  const summaryRaw = await readFile(runSummaryPath, "utf-8");
  assert.match(summaryRaw, /"loadedKnowledgeCount": 1/);
  await assert.rejects(readFile(path.join(secondRun.artifactsDir ?? "", "refine_knowledge_events.jsonl"), "utf-8"), /ENOENT/);
});

test("executor returns paused_hitl and persists resume payload when HITL cannot be answered inline", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-refine-pause-"));
  const raw = new StubRawToolClient();
  const toolClient = new RefineReactToolClient({
    rawClient: raw,
    session: createRefineReactSession("bootstrap", "bootstrap task", { taskScope: "pause-task" }),
  });

  const loop = new FakeLoop(async (task) => {
    await toolClient.callTool("observe.page", {});
    await toolClient.callTool("hitl.request", {
      prompt: "need human confirmation",
    });
    return buildBaseLoopResult(task, "completed");
  });

  const executor = new ReactRefinementRunExecutor({
    loop: loop as never,
    logger: new StubLogger(),
    artifactsDir: tmpRoot,
    maxTurns: 8,
    toolClient,
    ...createRefinementDependencies(tmpRoot, () => "paused_run"),
  });

  const result = await executor.execute({
    task: "confirm target",
  });
  assert.equal(result.status, "paused_hitl");
  assert.equal(result.runId, "paused_run");
  assert.ok(result.resumeRunId);
  assert.ok(result.resumeToken);

  const resumePath = path.join(tmpRoot, "paused_run", "hitl_resume.json");
  const resumeRaw = await readFile(resumePath, "utf-8");
  assert.match(resumeRaw, /need human confirmation/);
});

test("executor resumes the same run id after human input and requires run.finish", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-refine-resume-"));
  const raw = new StubRawToolClient();
  const toolClient = new RefineReactToolClient({
    rawClient: raw,
    session: createRefineReactSession("bootstrap", "bootstrap task", { taskScope: "resume-task" }),
  });

  const pausedLoop = new FakeLoop(async (task) => {
    await toolClient.callTool("observe.page", {});
    await toolClient.callTool("hitl.request", {
      prompt: "need human confirmation",
    });
    return buildBaseLoopResult(task, "completed");
  });

  const pausedExecutor = new ReactRefinementRunExecutor({
    loop: pausedLoop as never,
    logger: new StubLogger(),
    artifactsDir: tmpRoot,
    maxTurns: 8,
    toolClient,
    ...createRefinementDependencies(tmpRoot, () => "run_resume_target"),
  });

  const paused = await pausedExecutor.execute({ task: "resume me" });
  assert.equal(paused.status, "paused_hitl");

  const resumedLoop = new FakeLoop(async (task) => {
    await toolClient.callTool("observe.page", {});
    await toolClient.callTool("hitl.request", {
      prompt: "need human confirmation",
    });
    await toolClient.callTool("run.finish", {
      reason: "goal_achieved",
      summary: "resumed and finished",
    });
    return buildBaseLoopResult(task, "completed");
  });

  const resumedExecutor = new ReactRefinementRunExecutor({
    loop: resumedLoop as never,
    logger: new StubLogger(),
    artifactsDir: tmpRoot,
    maxTurns: 8,
    toolClient,
    hitlController: new StubHitlController(),
    ...createRefinementDependencies(tmpRoot, () => "should_not_be_used"),
  });

  const resumed = await resumedExecutor.execute({
    task: "resume me",
    resumeRunId: paused.runId,
  });
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.runId, paused.runId);
});

test("executor returns budget_exhausted when turn budget safety fuse is reached", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-refine-budget-"));
  const raw = new StubRawToolClient();
  const toolClient = new RefineReactToolClient({
    rawClient: raw,
    session: createRefineReactSession("bootstrap", "bootstrap task", { taskScope: "budget-task" }),
  });

  const loop = new FakeLoop(async (task) => {
    await toolClient.callTool("observe.page", {});
    const result = buildBaseLoopResult(task, "max_steps");
    result.assistantTurns = [
      ...result.assistantTurns,
      {
        index: 2,
        timestamp: new Date().toISOString(),
        text: "turn2",
        thinking: "",
        toolCalls: [],
      },
    ];
    return result;
  });

  const executor = new ReactRefinementRunExecutor({
    loop: loop as never,
    logger: new StubLogger(),
    artifactsDir: tmpRoot,
    maxTurns: 2,
    toolClient,
    ...createRefinementDependencies(tmpRoot, () => "budget_run"),
  });

  const result = await executor.execute({
    task: "run until budget",
  });
  assert.equal(result.status, "budget_exhausted");
});
