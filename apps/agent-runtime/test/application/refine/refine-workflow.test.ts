import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeTelemetryRegistry } from "../../../src/contracts/runtime-telemetry.js";
import type { ToolClient } from "../../../src/contracts/tool-client.js";
import type { AgentRunResult } from "../../../src/domain/agent-types.js";
import type { PiAgentLoop } from "../../../src/kernel/pi-agent-loop.js";
import { RefineReactToolClient } from "../../../src/application/refine/refine-react-tool-client.js";
import { createRefineReactSession } from "../../../src/application/refine/refine-react-session.js";
import { RefineRunBootstrapProvider } from "../../../src/application/refine/refine-run-bootstrap-provider.js";
import { createRefineWorkflowAssembly } from "../../../src/application/refine/refine-workflow.js";
import { createRefineToolComposition } from "../../../src/application/refine/tools/refine-tool-composition.js";

function createRawToolClient(): ToolClient {
  return {
    async connect(): Promise<void> {},
    async disconnect(): Promise<void> {},
    async listTools(): Promise<[]> {
      return [];
    },
    async callTool(): Promise<{ content: [] }> {
      return { content: [] };
    },
  };
}

test("refine workflow assembly owns refine tool surface, bootstrap, and executor wiring", async () => {
  const events: string[] = [];
  const rawToolClient = createRawToolClient();
  const bootstrapSession = createRefineReactSession("bootstrap", "bootstrap", { taskScope: "bootstrap" });
  const composition = createRefineToolComposition({
    rawToolClient,
    session: bootstrapSession,
  });
  const promptProvider = { buildRefineStartPrompt: () => "prompt" };
  const persistence = {
    knowledgeStore: { kind: "knowledge-store" },
    guidanceLoader: { kind: "guidance-loader" },
    hitlResumeStore: { kind: "hitl-resume-store" },
  };
  const telemetryRegistry: RuntimeTelemetryRegistry = {
    createRunTelemetry() {
      const checkpoints = {
        async append(): Promise<void> {},
        async dispose(): Promise<void> {},
      };
      return {
        eventBus: {
          async emit(): Promise<void> {},
        },
        artifacts: {
          scope: {
            workflow: "refine",
            runId: "run-1",
            artifactsDir: "/tmp/artifacts/run-1",
          },
          artifactsDir: "/tmp/artifacts/run-1",
          checkpointMode: "off",
          checkpoints,
          async dispose(): Promise<void> {},
        },
        async dispose(): Promise<void> {},
      };
    },
    async dispose(): Promise<void> {},
  };
  const loop = { kind: "loop" } as unknown as PiAgentLoop;
  const runExecutor = { kind: "run-executor" };
  const agentRuntime = {
    start: async () => {
      events.push("agent.start");
    },
    run: async (request: { task: string; resumeRunId?: string }): Promise<AgentRunResult> => {
      events.push(`agent.run:${request.task}:${request.resumeRunId ?? ""}`);
      return {
        task: request.task,
        runId: "run-1",
        status: "completed",
        finishReason: "goal achieved",
        steps: [],
        mcpCalls: [],
        assistantTurns: [],
      };
    },
    requestInterrupt: async (signal: "SIGINT" | "SIGTERM") => {
      events.push(`agent.interrupt:${signal}`);
      return true;
    },
    stop: async () => {
      events.push("agent.stop");
    },
  };

  const assembly = createRefineWorkflowAssembly(
    {
      browserLifecycle: {
        start: async () => {
          events.push("browser.start");
        },
        stop: async () => {
          events.push("browser.stop");
        },
      },
      logger: {
        info() {},
        warn() {},
        error() {},
      },
      rawToolClient,
      createRunId: () => "run-1",
      config: {
        apiKey: "test-key",
        artifactsDir: "/tmp/artifacts",
        baseUrl: undefined,
        model: "openai/gpt-4o-mini",
        refinementKnowledgeTopN: 8,
        refinementMaxRounds: 12,
        thinkingLevel: "minimal",
      },
      telemetryRegistry,
      refineSystemPrompt: "refine prompt",
    },
    {
      createToolComposition(input) {
        assert.equal(input, rawToolClient);
        events.push("assemble.tool-composition");
        return composition as never;
      },
      createPromptProvider() {
        events.push("assemble.prompt-provider");
        return promptProvider as never;
      },
      createPersistenceContext(input) {
        assert.equal(input.artifactsDir, "/tmp/artifacts");
        events.push("assemble.persistence");
        return persistence as never;
      },
      createBootstrapProvider(input) {
        assert.equal(input.guidanceLoader, persistence.guidanceLoader);
        assert.equal(input.hitlResumeStore, persistence.hitlResumeStore);
        assert.equal(input.promptProvider, promptProvider);
        events.push("assemble.bootstrap-provider");
        return new RefineRunBootstrapProvider(input);
      },
      createLoop(input) {
        assert.equal(input.toolClient instanceof RefineReactToolClient, true);
        assert.equal(input.toolClient.getSession().task, "bootstrap");
        assert.equal(input.systemPrompt, "refine prompt");
        events.push("assemble.loop");
        Object.assign(loop, {
          setToolHookObserver(observer: unknown) {
            assert.equal(typeof observer, "object");
            events.push("assemble.loop-hook-observer");
          },
        });
        return loop as never;
      },
      createRunExecutor(input) {
        assert.equal(input.loop, loop);
        assert.equal(input.toolClient instanceof RefineReactToolClient, true);
        assert.equal(input.knowledgeStore, persistence.knowledgeStore);
        assert.equal(input.bootstrapProvider instanceof RefineRunBootstrapProvider, true);
        assert.equal(input.telemetryRegistry, telemetryRegistry);
        assert.equal(typeof input.toolClient.setSession, "function");
        assert.equal(typeof input.toolClient.getSession, "function");
        assert.equal(typeof input.toolClient.setHitlAnswerProvider, "function");
        events.push("assemble.run-executor");
        return runExecutor as never;
      },
      createAgentRuntime(input) {
        assert.equal(input.loop, loop);
        assert.equal(input.runExecutor, runExecutor);
        events.push("assemble.agent-runtime");
        return agentRuntime as never;
      },
    }
  );

  const workflow = assembly.createWorkflow({
    task: "refine coffee beans",
    resumeRunId: "resume-7",
  });

  assert.deepEqual(events, [
    "assemble.tool-composition",
    "assemble.prompt-provider",
    "assemble.persistence",
    "assemble.bootstrap-provider",
    "assemble.loop",
    "assemble.loop-hook-observer",
    "assemble.run-executor",
    "assemble.agent-runtime",
  ]);

  await workflow.prepare();
  const result = await workflow.execute();
  const interrupted = await workflow.requestInterrupt("SIGINT");
  await workflow.dispose();

  assert.equal(result.task, "refine coffee beans");
  assert.equal(interrupted, true);
  assert.deepEqual(events, [
    "assemble.tool-composition",
    "assemble.prompt-provider",
    "assemble.persistence",
    "assemble.bootstrap-provider",
    "assemble.loop",
    "assemble.loop-hook-observer",
    "assemble.run-executor",
    "assemble.agent-runtime",
    "browser.start",
    "agent.start",
    "agent.run:refine coffee beans:resume-7",
    "agent.interrupt:SIGINT",
    "agent.stop",
    "browser.stop",
  ]);
});

test("refine workflow composition builds a surface and mutable context outside the facade", () => {
  const composition = createRefineToolComposition({
    rawToolClient: createRawToolClient(),
    session: createRefineReactSession("bootstrap", "bootstrap", { taskScope: "bootstrap" }),
  });

  assert.equal(typeof composition.surface.callTool, "function");
  assert.equal(typeof composition.surface.listTools, "function");
  assert.equal(typeof composition.contextRef.set, "function");
  assert.equal(typeof composition.hookObserver, "object");
});
