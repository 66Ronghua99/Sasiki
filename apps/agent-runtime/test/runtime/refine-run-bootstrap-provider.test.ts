import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { RuntimeConfig } from "../../src/application/config/runtime-config.js";
import type { AgentRunRequest } from "../../src/domain/agent-types.js";
import type { AttentionKnowledge } from "../../src/domain/attention-knowledge.js";
import {
  createRefinePersistenceContext,
  RefineRunBootstrapProvider,
} from "../../src/application/refine/refine-run-bootstrap-provider.js";
import { createRefineReactSession } from "../../src/application/refine/refine-react-session.js";
import { RefineReactToolClient } from "../../src/application/refine/refine-react-tool-client.js";
import { createRefineToolContextRef } from "../../src/application/refine/tools/refine-tool-context.js";
import type { RefineToolDefinition } from "../../src/application/refine/tools/refine-tool-definition.js";
import { RefineToolRegistry } from "../../src/application/refine/tools/refine-tool-registry.js";
import { RefineToolSurface } from "../../src/application/refine/tools/refine-tool-surface.js";

interface ResumeRecord {
  runId: string;
  task: string;
  prompt: string;
  context: Record<string, unknown>;
  resumeToken: string;
  createdAt: string;
}

function buildRequest(overrides: Partial<AgentRunRequest> = {}): AgentRunRequest {
  return {
    task: "buy coffee beans",
    resumeRunId: undefined,
    sopRunId: undefined,
    ...overrides,
  };
}

function buildRuntimeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    configPath: undefined,
    mcpCommand: "npx",
    mcpArgs: ["@playwright/mcp@latest"],
    mcpEnv: {},
    cdpEndpoint: "http://localhost:9222",
    launchCdp: false,
    cdpUserDataDir: "~/.sasiki/chrome_profile",
    cdpResetPagesOnLaunch: true,
    cdpHeadless: false,
    cdpInjectCookies: true,
    cdpCookiesDir: "~/.sasiki/cookies",
    cdpPreferSystemBrowser: true,
    cdpExecutablePath: undefined,
    cdpStartupTimeoutMs: 30000,
    model: "openai/gpt-4o-mini",
    apiKey: "test-key",
    baseUrl: undefined,
    thinkingLevel: "minimal",
    artifactsDir: path.join(process.cwd(), "artifacts", "test-refine-bootstrap-context"),
    runSystemPrompt: undefined,
    refineSystemPrompt: undefined,
    observeTimeoutMs: 120000,
    sopAssetRootDir: path.join(process.cwd(), "artifacts", "test-refine-bootstrap-context", "sop-assets"),
    semanticMode: "auto",
    semanticTimeoutMs: 12000,
    hitlEnabled: false,
    hitlRetryLimit: 2,
    hitlMaxInterventions: 1,
    refinementEnabled: false,
    refinementMode: "filtered_view",
    refinementMaxRounds: 12,
    refinementTokenBudget: 1000,
    refinementKnowledgeTopN: 8,
    ...overrides,
  };
}

function createHookAwareObservePageDefinition(): RefineToolDefinition<{ session: ReturnType<typeof createRefineReactSession> }> {
  return {
    name: "observe.page",
    description: "observe.page description",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    async invoke(_args, context) {
      return {
        observation: {
          page: {
            origin: "https://creator.xiaohongshu.com",
            normalizedPath: "/publish",
          },
          observationRef: `obs-${context.session.runId}`,
        },
      };
    },
  };
}

test("refine bootstrap module owns persistence context wiring under artifacts", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-refine-bootstrap-context-"));
  const context = createRefinePersistenceContext(
    buildRuntimeConfig({
      artifactsDir: path.join(tmpRoot, "artifacts"),
      sopAssetRootDir: path.join(tmpRoot, "sop-assets"),
    })
  );

  const knowledge: AttentionKnowledge = {
    id: "knowledge-1",
    sourceRunId: "run-1",
    taskScope: "search",
    page: {
      origin: "https://example.com",
      normalizedPath: "/",
    },
    category: "keep",
    cue: "keep the hero button visible",
    sourceObservationRef: "obs-1",
    promotedAt: new Date("2026-03-21T00:00:01.000Z").toISOString(),
  };
  await context.knowledgeStore.append([knowledge]);
  const loaded = await context.guidanceLoader.load({
    taskScope: "search",
    page: {
      origin: "https://example.com",
      normalizedPath: "/",
    },
  });

  const resumePath = await context.hitlResumeStore.save({
    runId: "run-1",
    task: "save this page",
    prompt: "resume prompt",
    resumeToken: "resume-token",
    createdAt: new Date("2026-03-21T00:00:02.000Z").toISOString(),
  });

  assert.equal(loaded.records.length, 1);
  assert.match(loaded.guidance, /keep the hero button visible/);
  assert.equal(resumePath, path.join(tmpRoot, "artifacts", "run-1", "hitl_resume.json"));
});

test("refine bootstrap provider loads resume context, pre-observes the page, loads guidance, and assembles prompt through prompt provider", async () => {
  const promptCalls: Array<Record<string, unknown>> = [];
  const sessions: Array<{ runId: string; task: string; taskScope: string }> = [];
  const hitlAnswerProviders: Array<unknown> = [];
  const hitlAnswerProvider = () => "provided answer";
  const toolClient = {
    setSession(session) {
      sessions.push({
        runId: session.runId,
        task: session.task,
        taskScope: session.taskScope,
      });
    },
    setHitlAnswerProvider(provider?: unknown) {
      hitlAnswerProviders.push(provider);
    },
    async callTool(name: string): Promise<unknown> {
      assert.equal(name, "observe.page");
      return {
        observation: {
          page: {
            origin: "https://creator.xiaohongshu.com",
            normalizedPath: "/publish",
          },
        },
      };
    },
  };

  const provider = new RefineRunBootstrapProvider({
    createRunId: () => "run_123",
    knowledgeTopN: 3,
    hitlResumeStore: {
      load: async (runId: string): Promise<ResumeRecord | undefined> => ({
        runId,
        task: "resume task from store",
        prompt: "human noted a blocker",
        context: {},
        resumeToken: "resume-token",
        createdAt: "2026-03-20T12:00:00.000Z",
      }),
      save: async () => "saved",
    },
    guidanceLoader: {
      load: async (input) => {
        assert.deepEqual(input, {
          taskScope: "resume task from store",
          page: {
            origin: "https://creator.xiaohongshu.com",
            normalizedPath: "/publish",
          },
          limit: 3,
        });
        return {
          guidance: "reuse the saved title flow",
          records: [{ id: "k1" }],
        };
      },
    },
    promptProvider: {
      buildRefineStartPrompt(input) {
        promptCalls.push(input);
        return "assembled refine prompt";
      },
    },
  });

  const result = await provider.prepare({
    request: buildRequest({
      task: "",
      resumeRunId: "paused_run_7",
    }),
    toolClient,
    hitlAnswerProvider,
  });

  assert.equal(result.runId, "paused_run_7");
  assert.equal(result.task, "resume task from store");
  assert.equal(result.taskScope, "resume task from store");
  assert.equal(result.prompt, "assembled refine prompt");
  assert.equal(result.loadedGuidanceCount, 1);
  assert.deepEqual(sessions, [
    {
      runId: "paused_run_7",
      task: "resume task from store",
      taskScope: "resume task from store",
    },
  ]);
  assert.deepEqual(hitlAnswerProviders, [hitlAnswerProvider]);
  assert.deepEqual(promptCalls, [
    {
      task: "resume task from store",
      guidance: "reuse the saved title flow",
      resumeInstruction: "Resumed from paused run paused_run_7. Human prompt context: human noted a blocker",
    },
  ]);
});

test("refine bootstrap provider creates a new run id and still assembles prompt when there is no resume record", async () => {
  const sessions: Array<{ runId: string; task: string; taskScope: string }> = [];
  const hitlAnswerProviders: Array<unknown> = [];
  const toolClient = {
    setSession(session) {
      sessions.push({
        runId: session.runId,
        task: session.task,
        taskScope: session.taskScope,
      });
    },
    setHitlAnswerProvider(provider?: unknown) {
      hitlAnswerProviders.push(provider);
    },
    async callTool(): Promise<unknown> {
      return {
        observation: {
          page: {
            origin: "https://www.xiaohongshu.com",
            normalizedPath: "/explore",
          },
        },
      };
    },
  };

  const provider = new RefineRunBootstrapProvider({
    createRunId: () => "fresh_run_1",
    guidanceLoader: {
      load: async () => ({
        guidance: "",
        records: [],
      }),
    },
    hitlResumeStore: {
      load: async (): Promise<undefined> => undefined,
      save: async () => "saved",
    },
    promptProvider: {
      buildRefineStartPrompt(input) {
        assert.deepEqual(input, {
          task: "buy coffee beans",
          guidance: "",
          resumeInstruction: "",
        });
        return "fresh prompt";
      },
    },
  });

  const result = await provider.prepare({
    request: buildRequest(),
    toolClient,
  });

  assert.equal(result.runId, "fresh_run_1");
  assert.equal(result.task, "buy coffee beans");
  assert.equal(result.taskScope, "buy coffee beans");
  assert.equal(result.prompt, "fresh prompt");
  assert.equal(result.loadedGuidanceCount, 0);
  assert.deepEqual(sessions, [
    {
      runId: "fresh_run_1",
      task: "buy coffee beans",
      taskScope: "buy coffee beans",
    },
  ]);
  assert.deepEqual(hitlAnswerProviders, [undefined]);
});

test("future boundary freeze: refine bootstrap direct observation calls bypass adapter-only pi-agent hooks", async () => {
  const events: string[] = [];
  const session = createRefineReactSession("bootstrap", "bootstrap", { taskScope: "bootstrap" });
  const contextRef = createRefineToolContextRef<{ session: ReturnType<typeof createRefineReactSession> }>({
    session,
  });
  const surface = new RefineToolSurface({
    registry: new RefineToolRegistry({
      definitions: [createHookAwareObservePageDefinition()],
    }),
    contextRef,
    hookPipeline: {
      async beforeToolCall({ definition, context }) {
        events.push(`before:${definition.name}:${context.session.runId}`);
      },
      async afterToolCall({ definition, context }) {
        events.push(`after:${definition.name}:${context.session.runId}`);
      },
    },
  });
  const toolClient = new RefineReactToolClient(surface, contextRef);
  const provider = new RefineRunBootstrapProvider({
    createRunId: () => "run-bootstrap",
    guidanceLoader: {
      load: async () => ({ guidance: "", records: [] }),
    },
    hitlResumeStore: {
      load: async () => undefined,
      save: async () => "saved",
    },
    promptProvider: {
      buildRefineStartPrompt() {
        return "prompt";
      },
    },
  });

  const result = await provider.prepare({
    request: buildRequest(),
    toolClient,
  });

  assert.equal(result.runId, "run-bootstrap");
  assert.equal(result.task, "buy coffee beans");
  assert.equal(result.taskScope, "buy coffee beans");
  assert.equal(result.prompt, "prompt");
  assert.equal(result.loadedGuidanceCount, 0);
  assert.deepEqual(events, []);
});
