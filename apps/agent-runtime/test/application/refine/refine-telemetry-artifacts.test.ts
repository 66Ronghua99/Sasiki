import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createRuntimeTelemetryRegistry } from "../../../src/application/shell/runtime-telemetry-registry.js";
import { RuntimeEventStreamWriter } from "../../../src/infrastructure/persistence/runtime-event-stream-writer.js";
import { FileAgentCheckpointWriter } from "../../../src/infrastructure/persistence/agent-checkpoint-writer.js";
import { AttentionGuidanceLoader } from "../../../src/application/refine/attention-guidance-loader.js";
import { PromptProvider } from "../../../src/application/refine/prompt-provider.js";
import { RefineHitlResumeStore } from "../../../src/infrastructure/persistence/refine-hitl-resume-store.js";
import { ArtifactsWriter } from "../../../src/infrastructure/persistence/artifacts-writer.js";
import { RefineReactToolClient } from "../../../src/application/refine/refine-react-tool-client.js";
import { RefineRunBootstrapProvider } from "../../../src/application/refine/refine-run-bootstrap-provider.js";
import { ReactRefinementRunExecutor } from "../../../src/application/refine/react-refinement-run-executor.js";
import { AttentionKnowledgeStore } from "../../../src/infrastructure/persistence/attention-knowledge-store.js";
import { createRefineReactSession } from "../../../src/application/refine/refine-react-session.js";
import type { AgentRunResult } from "../../../src/domain/agent-types.js";
import type { Logger } from "../../../src/contracts/logger.js";
import type { RuntimeRunTelemetry, RuntimeTelemetryRegistry } from "../../../src/contracts/runtime-telemetry.js";
import type { HitlController } from "../../../src/contracts/hitl-controller.js";
import type { ToolCallResult, ToolClient, ToolDefinition } from "../../../src/contracts/tool-client.js";

class SilentLogger implements Logger {
  info(): void {}
  warn(): void {}
  error(): void {}
}

class StubRawToolClient implements ToolClient {
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async listTools(): Promise<ToolDefinition[]> {
    return [];
  }
  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    if (name === "run.finish") {
      return { content: [{ type: "text", text: JSON.stringify(args) }] };
    }
    return { content: [{ type: "text", text: "ok" }] };
  }
}

class ScriptedTelemetryLoop {
  runtimeTelemetry: RuntimeRunTelemetry | null = null;
  private readonly toolClient: RefineReactToolClient;

  constructor(toolClient: RefineReactToolClient) {
    this.toolClient = toolClient;
  }

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  abort(): void {}
  setRuntimeTelemetry(runtimeTelemetry: RuntimeRunTelemetry | null): void {
    this.runtimeTelemetry = runtimeTelemetry;
  }

  async run(task: string): Promise<AgentRunResult> {
    const telemetry = this.runtimeTelemetry;
    assert.notEqual(telemetry, null);
    const scope = telemetry.artifacts.scope;

    await telemetry.eventBus.emit({
      timestamp: "2026-03-21T00:00:00.000Z",
      workflow: scope.workflow,
      runId: scope.runId,
      eventType: "agent.turn",
      turnIndex: 1,
      payload: {
        turnIndex: 1,
        thinking: "consider click",
        text: "click the button",
        toolCalls: [
          {
            id: "call-1",
            name: "browser_click",
            arguments: { selector: "#buy" },
          },
        ],
      },
    });
    await telemetry.eventBus.emit({
      timestamp: "2026-03-21T00:00:00.100Z",
      workflow: scope.workflow,
      runId: scope.runId,
      eventType: "tool.call",
      turnIndex: 1,
      stepIndex: 1,
      payload: {
        phase: "start",
        toolCallId: "call-1",
        toolName: "browser_click",
        args: { selector: "#buy" },
      },
    });
    await telemetry.eventBus.emit({
      timestamp: "2026-03-21T00:00:00.200Z",
      workflow: scope.workflow,
      runId: scope.runId,
      eventType: "tool.call",
      turnIndex: 1,
      stepIndex: 1,
      payload: {
        phase: "end",
        toolCallId: "call-1",
        toolName: "browser_click",
        args: { selector: "#buy" },
        resultExcerpt: "clicked",
        isError: false,
      },
    });
    await this.toolClient.callTool("run.finish", {
      reason: "goal_achieved",
      summary: "done",
    });

    return {
      task,
      status: "completed",
      finishReason: "done",
      steps: [
        {
          stepIndex: 1,
          action: "click",
          reason: "agent tool execution",
          toolName: "browser_click",
          toolArguments: { selector: "#buy" },
          resultExcerpt: "clicked",
          progressed: true,
        },
      ],
      mcpCalls: [],
      assistantTurns: [
        {
          index: 1,
          timestamp: "2026-03-21T00:00:00.000Z",
          stopReason: "tool_use",
          text: "click the button",
          thinking: "consider click",
          toolCalls: [
            {
              id: "call-1",
              name: "browser_click",
              arguments: { selector: "#buy" },
            },
          ],
        },
      ],
    };
  }

  async captureFinalScreenshot(): Promise<string | undefined> {
    return undefined;
  }
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

function createNoopHitlController(): HitlController {
  return {
    async requestIntervention(
      _request: Parameters<HitlController["requestIntervention"]>[0]
    ): Promise<{ humanAction: string; resumeInstruction: string; nextTimeRule: string }> {
      return {
        humanAction: "noop",
        resumeInstruction: "continue",
        nextTimeRule: "none",
      };
    },
  };
}

test("refine telemetry artifacts write event stream and key-turn checkpoints", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-refine-artifacts-"));
  const rawToolClient = new StubRawToolClient();
  const toolClient = new RefineReactToolClient({
    rawClient: rawToolClient,
    session: createRefineReactSession("bootstrap", "bootstrap task", { taskScope: "telemetry-artifacts" }),
  });

  const telemetryRegistry: RuntimeTelemetryRegistry = createRuntimeTelemetryRegistry({
    createSinks(scope) {
      assert.equal(scope.workflow, "refine");
      return [new RuntimeEventStreamWriter(scope.artifactsDir)];
    },
    createArtifacts(scope) {
      const checkpoints = new FileAgentCheckpointWriter(scope.artifactsDir);
      return {
        scope,
        artifactsDir: scope.artifactsDir,
        checkpointMode: "key_turns",
        checkpoints,
        async dispose(): Promise<void> {
          await checkpoints.dispose();
        },
      };
    },
  });

  const stores = createRefinementStores(tmpRoot);
  const executor = new ReactRefinementRunExecutor({
    loop: new ScriptedTelemetryLoop(toolClient) as never,
    logger: new SilentLogger(),
    maxTurns: 8,
    telemetryRegistry,
    toolClient,
    hitlController: createNoopHitlController(),
    knowledgeStore: stores.knowledgeStore,
    bootstrapProvider: new RefineRunBootstrapProvider({
      createRunId: () => "run-telemetry-artifacts",
      guidanceLoader: stores.guidanceLoader,
      hitlResumeStore: stores.hitlResumeStore,
      promptProvider: new PromptProvider(),
      knowledgeTopN: 8,
    }),
    createArtifactsWriter: (runId: string) => new ArtifactsWriter(tmpRoot, runId),
  });

  const result = await executor.execute({
    task: "confirm telemetry",
  });

  assert.equal(result.status, "completed");
  assert.equal(result.finishReason, "done");

  const runDir = path.join(tmpRoot, "run-telemetry-artifacts");
  const eventStreamPath = path.join(runDir, "event_stream.jsonl");
  const checkpointsPath = path.join(runDir, "agent_checkpoints", "checkpoints.jsonl");
  const summaryPath = path.join(runDir, "run_summary.json");

  const eventLines = (await readFile(eventStreamPath, "utf-8")).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  const checkpointLines = (await readFile(checkpointsPath, "utf-8")).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  const summary = JSON.parse(await readFile(summaryPath, "utf-8")) as Record<string, unknown>;

  assert.deepEqual(
    eventLines.map((event) => event.eventType),
    ["workflow.lifecycle", "agent.turn", "tool.call", "tool.call", "workflow.lifecycle"]
  );
  assert.equal(eventLines[0].workflow, "refine");
  assert.equal(eventLines[1].eventType, "agent.turn");
  assert.equal(eventLines[2].payload && (eventLines[2].payload as Record<string, unknown>).phase, "start");
  assert.equal(eventLines[3].payload && (eventLines[3].payload as Record<string, unknown>).phase, "end");
  assert.equal(eventLines[4].payload && (eventLines[4].payload as Record<string, unknown>).phase, "finished");

  assert.equal(checkpointLines.length, 1);
  assert.equal(checkpointLines[0].reason, "first_tool_turn");
  assert.equal(checkpointLines[0].runId, "run-telemetry-artifacts");
  assert.equal(summary.runId, "run-telemetry-artifacts");
  assert.equal(summary.status, "completed");
  assert.equal(summary.actionCount, 0);
  assert.equal(summary.observationCount, 1);
  await assert.rejects(readFile(path.join(runDir, "steps.json"), "utf-8"), /ENOENT/);
  await assert.rejects(readFile(path.join(runDir, "assistant_turns.json"), "utf-8"), /ENOENT/);
  await assert.rejects(readFile(path.join(runDir, "refine_turn_logs.jsonl"), "utf-8"), /ENOENT/);
  await assert.rejects(readFile(path.join(runDir, "refine_browser_observations.jsonl"), "utf-8"), /ENOENT/);
  await assert.rejects(readFile(path.join(runDir, "refine_action_executions.jsonl"), "utf-8"), /ENOENT/);
});

test("refine telemetry artifacts reject when event stream durability fails", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-refine-artifacts-fail-stream-"));
  const rawToolClient = new StubRawToolClient();
  const toolClient = new RefineReactToolClient({
    rawClient: rawToolClient,
    session: createRefineReactSession("bootstrap", "bootstrap task", { taskScope: "telemetry-artifacts-fail" }),
  });

  const telemetryRegistry: RuntimeTelemetryRegistry = createRuntimeTelemetryRegistry({
    createSinks() {
      return [
        {
          async emit(): Promise<void> {
            throw new Error("event stream failed");
          },
        },
      ];
    },
    createArtifacts(scope) {
      const checkpoints = new FileAgentCheckpointWriter(scope.artifactsDir);
      return {
        scope,
        artifactsDir: scope.artifactsDir,
        checkpointMode: "key_turns",
        checkpoints,
        async dispose(): Promise<void> {
          await checkpoints.dispose();
        },
      };
    },
  });

  const stores = createRefinementStores(tmpRoot);
  const executor = new ReactRefinementRunExecutor({
    loop: new ScriptedTelemetryLoop(toolClient) as never,
    logger: new SilentLogger(),
    maxTurns: 8,
    telemetryRegistry,
    toolClient,
    hitlController: createNoopHitlController(),
    knowledgeStore: stores.knowledgeStore,
    bootstrapProvider: new RefineRunBootstrapProvider({
      createRunId: () => "run-telemetry-artifacts-fail",
      guidanceLoader: stores.guidanceLoader,
      hitlResumeStore: stores.hitlResumeStore,
      promptProvider: new PromptProvider(),
      knowledgeTopN: 8,
    }),
    createArtifactsWriter: (runId: string) => new ArtifactsWriter(tmpRoot, runId),
  });

  await assert.rejects(
    executor.execute({
      task: "confirm telemetry",
    }),
    /event stream failed/
  );
});

test("refine telemetry artifacts reject when checkpoint durability fails", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-refine-artifacts-fail-checkpoint-"));
  const rawToolClient = new StubRawToolClient();
  const toolClient = new RefineReactToolClient({
    rawClient: rawToolClient,
    session: createRefineReactSession("bootstrap", "bootstrap task", { taskScope: "telemetry-artifacts-fail" }),
  });

  const telemetryRegistry: RuntimeTelemetryRegistry = createRuntimeTelemetryRegistry({
    createSinks(scope) {
      return [new RuntimeEventStreamWriter(scope.artifactsDir)];
    },
    createArtifacts(scope) {
      return {
        scope,
        artifactsDir: scope.artifactsDir,
        checkpointMode: "key_turns",
        checkpoints: {
          async append(): Promise<void> {
            throw new Error("checkpoint write failed");
          },
          async dispose(): Promise<void> {},
        },
        async dispose(): Promise<void> {},
      };
    },
  });

  const stores = createRefinementStores(tmpRoot);
  const executor = new ReactRefinementRunExecutor({
    loop: new ScriptedTelemetryLoop(toolClient) as never,
    logger: new SilentLogger(),
    maxTurns: 8,
    telemetryRegistry,
    toolClient,
    hitlController: createNoopHitlController(),
    knowledgeStore: stores.knowledgeStore,
    bootstrapProvider: new RefineRunBootstrapProvider({
      createRunId: () => "run-telemetry-artifacts-fail-checkpoint",
      guidanceLoader: stores.guidanceLoader,
      hitlResumeStore: stores.hitlResumeStore,
      promptProvider: new PromptProvider(),
      knowledgeTopN: 8,
    }),
    createArtifactsWriter: (runId: string) => new ArtifactsWriter(tmpRoot, runId),
  });

  await assert.rejects(
    executor.execute({
      task: "confirm telemetry",
    }),
    /checkpoint write failed/
  );
});
