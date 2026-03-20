import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRunRequest } from "../../src/domain/agent-types.js";
import { RefineRunBootstrapProvider } from "../../src/application/refine/refine-run-bootstrap-provider.js";

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

test("refine bootstrap provider loads resume context, pre-observes the page, loads guidance, and assembles prompt through prompt provider", async () => {
  const promptCalls: Array<Record<string, unknown>> = [];
  const sessions: Array<{ runId: string; task: string; taskScope: string }> = [];
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
    toolClient: {
      setSession(session) {
        sessions.push({
          runId: session.runId,
          task: session.task,
          taskScope: session.taskScope,
        });
      },
      setHitlAnswerProvider() {},
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
    },
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
    toolClient: {
      setSession(session) {
        sessions.push({
          runId: session.runId,
          task: session.task,
          taskScope: session.taskScope,
        });
      },
      setHitlAnswerProvider() {},
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
    },
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
});
