import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { RuntimeConfig } from "../../src/application/config/runtime-config.js";
import type { AgentRunRequest } from "../../src/domain/agent-types.js";
import type { AttentionKnowledge } from "../../src/domain/attention-knowledge.js";
import { AttentionGuidanceLoader } from "../../src/application/refine/attention-guidance-loader.js";
import { RefineRunBootstrapProvider } from "../../src/application/refine/refine-run-bootstrap-provider.js";
import { AttentionKnowledgeStore } from "../../src/infrastructure/persistence/attention-knowledge-store.js";
import { RefineHitlResumeStore } from "../../src/infrastructure/persistence/refine-hitl-resume-store.js";

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

function buildRefinePersistenceContext(artifactsDir: string) {
  const knowledgeStore = new AttentionKnowledgeStore({
    filePath: path.join(artifactsDir, "refinement", "attention-knowledge-store.json"),
  });

  return {
    knowledgeStore,
    guidanceLoader: new AttentionGuidanceLoader(knowledgeStore),
    hitlResumeStore: new RefineHitlResumeStore({
      baseDir: artifactsDir,
    }),
  };
}

test("refine bootstrap module owns persistence context wiring under artifacts", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-refine-bootstrap-context-"));
  const context = buildRefinePersistenceContext(path.join(tmpRoot, "artifacts"));

  const knowledge: AttentionKnowledge = {
    id: "knowledge-1",
    sourceRunId: "run-1",
    page: {
      origin: "https://example.com",
      normalizedPath: "/",
    },
    guide: "keep the hero button visible",
    keywords: ["hero button", "keep"],
    sourceObservationRef: "obs-1",
    promotedAt: new Date("2026-03-21T00:00:01.000Z").toISOString(),
  };
  await context.knowledgeStore.append([knowledge]);
  const loaded = await context.guidanceLoader.load({
    page: {
      origin: "https://example.com",
      normalizedPath: "/",
    },
    limit: 8,
  } as never);

  const resumePath = await context.hitlResumeStore.save({
    runId: "run-1",
    task: "save this page",
    prompt: "resume prompt",
    resumeToken: "resume-token",
    createdAt: new Date("2026-03-21T00:00:02.000Z").toISOString(),
  });

  assert.equal(loaded.records.length, 1);
  assert.match(loaded.guidance, /keep the hero button visible/);
  assert.match(loaded.guidance, /hero button/);
  assert.equal(resumePath, path.join(tmpRoot, "artifacts", "run-1", "hitl_resume.json"));
});

test("refine bootstrap guidance loader fails explicitly for legacy persisted knowledge shape", async () => {
  const loader = new AttentionGuidanceLoader({
    async query(): Promise<AttentionKnowledge[]> {
      return [
        {
          id: "legacy-knowledge-1",
          sourceRunId: "run-legacy",
          page: {
            origin: "https://example.com",
            normalizedPath: "/",
          },
          taskScope: "search",
          category: "keep",
          cue: "keep the hero button visible",
          sourceObservationRef: "obs-legacy",
          promotedAt: new Date("2026-03-21T00:00:01.000Z").toISOString(),
        } as never,
      ];
    },
  });

  await assert.rejects(
    () =>
      loader.load({
        page: {
          origin: "https://example.com",
          normalizedPath: "/",
        },
        limit: 8,
      }),
    /page-level retrieval cue|guide|keywords/i
  );
});

test("refine bootstrap provider loads resume context, pre-observes the page, loads guidance, and assembles prompt through prompt provider", async () => {
  const promptCalls: Array<Record<string, unknown>> = [];
  const sessions: Array<{ runId: string; task: string; taskScope: string }> = [];
  const hitlAnswerProviders: Array<unknown> = [];
  const hitlAnswerProvider = () => "provided answer";
  const toolClient: {
    setSession(session: { runId: string; task: string; taskScope: string }): void;
    setHitlAnswerProvider(provider?: unknown): void;
    callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  } = {
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
          observationRef: "obs_resume_1",
          page: {
            url: "https://creator.xiaohongshu.com/publish",
            origin: "https://creator.xiaohongshu.com",
            normalizedPath: "/publish",
            title: "Publish",
          },
          activeTabIndex: 0,
          tabs: [{ index: 0 }],
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
      initialObservation: {
        observationRef: "obs_resume_1",
        page: {
          url: "https://creator.xiaohongshu.com/publish",
          origin: "https://creator.xiaohongshu.com",
          normalizedPath: "/publish",
          title: "Publish",
        },
        activeTabIndex: 0,
        openTabCount: 1,
      },
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
          observationRef: "obs_fresh_1",
          page: {
            url: "https://www.xiaohongshu.com/explore",
            origin: "https://www.xiaohongshu.com",
            normalizedPath: "/explore",
            title: "Explore",
          },
          activeTabIndex: 0,
          tabs: [{ index: 0 }, { index: 1 }],
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
          initialObservation: {
            observationRef: "obs_fresh_1",
            page: {
              url: "https://www.xiaohongshu.com/explore",
              origin: "https://www.xiaohongshu.com",
              normalizedPath: "/explore",
              title: "Explore",
            },
            activeTabIndex: 0,
            openTabCount: 2,
          },
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
