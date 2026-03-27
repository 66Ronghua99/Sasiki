import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  FINALIZE_SYSTEM_PROMPT,
  REASONER_SYSTEM_PROMPT,
  SUMMARIZE_SYSTEM_PROMPT,
} from "../../../src/application/compact/interactive-sop-compact-prompts.js";
import { createCompactWorkflow } from "../../../src/application/compact/compact-workflow.js";
import { InteractiveSopCompactService } from "../../../src/application/compact/interactive-sop-compact.js";
import { SopRuleCompactBuilder } from "../../../src/application/compact/sop-rule-compact-builder.js";
import { RuntimeHost } from "../../../src/application/shell/runtime-host.js";
import { ArtifactsWriter } from "../../../src/infrastructure/persistence/artifacts-writer.js";

test("application compact service and prompts are the canonical home", () => {
  assert.equal(typeof InteractiveSopCompactService, "function");
  assert.equal(typeof SopRuleCompactBuilder, "function");
  assert.match(REASONER_SYSTEM_PROMPT, /SOP compact reasoning agent/i);
  assert.match(SUMMARIZE_SYSTEM_PROMPT, /machine-readable state update/i);
  assert.match(FINALIZE_SYSTEM_PROMPT, /finalizing a reusable SOP compact capability/i);
});

test("compact workflow adapts the host contract without changing compact semantics", async () => {
  const calls: string[] = [];
  const service = {
    async compact(runId: string) {
      calls.push(`compact:${runId}`);
      return {
        runId,
        sessionId: `${runId}_compact_20260321`,
        sessionDir: "/tmp/artifacts/run-123/compact_sessions/run-123_compact_20260321",
        runDir: "/tmp/artifacts/run-123",
        sourceTracePath: "/tmp/artifacts/run-123/demonstration_trace.json",
        sessionStatePath: "/tmp/artifacts/run-123/compact_sessions/run-123_compact_20260321/compact_session_state.json",
        humanLoopPath: "/tmp/artifacts/run-123/compact_sessions/run-123_compact_20260321/compact_human_loop.jsonl",
        capabilityOutputPath:
          "/tmp/artifacts/run-123/compact_sessions/run-123_compact_20260321/compact_capability_output.json",
        status: "ready_to_finalize",
        roundsCompleted: 2,
        remainingOpenDecisions: ["confirm reuse boundary"],
      };
    },
  };

  const workflow = createCompactWorkflow({ service, runId: "run-123" });
  assert.equal(await workflow.requestInterrupt("SIGINT"), false);

  const host = new RuntimeHost();
  const result = await host.run(workflow);

  assert.deepEqual(calls, ["compact:run-123"]);
  assert.deepEqual(result, {
    runId: "run-123",
    sessionId: "run-123_compact_20260321",
    sessionDir: "/tmp/artifacts/run-123/compact_sessions/run-123_compact_20260321",
    runDir: "/tmp/artifacts/run-123",
    sourceTracePath: "/tmp/artifacts/run-123/demonstration_trace.json",
    sessionStatePath: "/tmp/artifacts/run-123/compact_sessions/run-123_compact_20260321/compact_session_state.json",
    humanLoopPath: "/tmp/artifacts/run-123/compact_sessions/run-123_compact_20260321/compact_human_loop.jsonl",
    capabilityOutputPath:
      "/tmp/artifacts/run-123/compact_sessions/run-123_compact_20260321/compact_capability_output.json",
    status: "ready_to_finalize",
    roundsCompleted: 2,
    remainingOpenDecisions: ["confirm reuse boundary"],
  });
});

test("interactive sop compact creates run-scoped telemetry and does not append runtime log", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-compact-telemetry-"));
  const tracePath = path.join(tmpRoot, "artifacts", "run-123", "demonstration_trace.json");
  await mkdir(path.dirname(tracePath), { recursive: true });
  await writeFile(
    tracePath,
    JSON.stringify(
      {
        traceVersion: "v0",
        traceId: "run-123",
        mode: "observe",
        site: "example.com",
        singleTabOnly: true,
        taskHint: "capture the homepage",
        steps: [
          {
            stepIndex: 1,
            timestamp: "2026-03-21T00:00:00.000Z",
            action: "navigate",
            tabId: "tab-1",
            target: { type: "url", value: "https://example.com/" },
            input: {},
            page: { urlBefore: "about:blank", urlAfter: "https://example.com/" },
            rawRef: "event-1",
          },
        ],
      },
      null,
      2
    ),
    "utf-8"
  );

  const telemetryScopes: Array<{ workflow: string; runId: string; artifactsDir: string }> = [];
  const emittedEvents: Array<{ eventType: string; runId: string; workflow: string; payload: Record<string, unknown> }> = [];
  const artifactsWriterRuns: string[] = [];
  const telemetryRegistry = {
    createRunTelemetry(scope: { workflow: string; runId: string; artifactsDir: string }) {
      telemetryScopes.push(scope);
      return {
        eventBus: {
          emit: async (event: { eventType: string; runId: string; workflow: string; payload: Record<string, unknown> }) => {
            emittedEvents.push(event);
          },
          dispose: async () => undefined,
        },
        dispose: async () => undefined,
      };
    },
  };

  const modelClient = {
    completeText: async () => ({
      rawText: "compact reasoning response",
      model: "mock",
      provider: "test",
      stopReason: "stop",
    }),
    completeObject: async (systemPrompt: string) => {
      if (systemPrompt === SUMMARIZE_SYSTEM_PROMPT) {
        return {
          payload: {
            patch: {
              workflowUpdates: {
                addStableSteps: ["navigate home"],
                removeStableSteps: [],
                addUncertainSteps: [],
                removeUncertainSteps: [],
                addNoiseNotes: [],
              },
              taskUnderstandingNext: "capture the homepage",
              openDecisionsNext: ["这条流程真正想复用的目标是什么？"],
              absorbedHumanFeedback: [],
              convergenceNext: {
                status: "ready_to_finalize",
                reason: "sufficiently understood",
              },
            },
          },
          rawText: "{}",
          model: "mock",
          provider: "test",
          stopReason: "stop",
        };
      }
      return {
        payload: {
          skillName: "homepage-capture",
          description: "Capture the homepage for a known site.",
          body: [
            "# Homepage Capture",
            "",
            "## Goal",
            "",
            "Open the target homepage and stop when the page is visible.",
          ].join("\n"),
        },
        rawText: "{}",
        model: "mock",
        provider: "test",
        stopReason: "stop",
      };
    },
  };

  const service = new InteractiveSopCompactService(path.join(tmpRoot, "artifacts"), {
    semantic: {
      mode: "on",
      timeoutMs: 12000,
      model: "mock",
      apiKey: "test-key",
      thinkingLevel: "minimal",
    },
    createArtifactsWriter: (runId: string) => {
      artifactsWriterRuns.push(runId);
      return new ArtifactsWriter(path.join(tmpRoot, "artifacts"), runId);
    },
    modelClient: modelClient as never,
    humanLoopTool: {
      requestClarification: async () => {
        throw new Error("human loop should not be reached in this test");
      },
    },
    telemetryRegistry: telemetryRegistry as never,
    skillStore: {
      writeSkill: async () => ({
        skillPath: path.join(tmpRoot, "skills", "homepage-capture", "SKILL.md"),
      }),
    },
  } as never);

  const result = await service.compact("run-123");

  assert.equal(result.runId, "run-123");
  assert.equal(result.status, "ready_to_finalize");
  assert.equal(result.selectedSkillName, "homepage-capture");
  assert.equal(result.sourceObserveRunId, "run-123");
  assert.deepEqual(telemetryScopes, [
    {
      workflow: "compact",
      runId: "run-123",
      artifactsDir: path.join(tmpRoot, "artifacts", "run-123"),
    },
  ]);
  assert.equal(
    emittedEvents.every((event) => event.workflow === "compact" && event.runId === "run-123"),
    true
  );
  assert.deepEqual(emittedEvents.map((event) => event.eventType), [
    "workflow.lifecycle",
    "agent.turn",
    "workflow.lifecycle",
    "workflow.lifecycle",
  ]);
  assert.deepEqual(
    emittedEvents.map((event) => (event.eventType === "workflow.lifecycle" ? event.payload.phase : undefined)),
    [
      "started",
      undefined,
      "round_completed",
      "finished",
    ]
  );
  assert.equal(emittedEvents[1]?.payload.text, "compact reasoning response");
  assert.equal(emittedEvents[1]?.payload.stopReason, "ready_to_finalize");
  assert.deepEqual(artifactsWriterRuns, ["run-123"]);
  await assert.rejects(
    readFile(path.join(tmpRoot, "artifacts", "run-123", "runtime.log"), "utf-8"),
    /ENOENT/
  );
});

test("interactive sop compact persists a named SKILL.md with frontmatter and markdown body", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-compact-skill-"));
  const tracePath = path.join(tmpRoot, "artifacts", "run-123", "demonstration_trace.json");
  await mkdir(path.dirname(tracePath), { recursive: true });
  await writeFile(
    tracePath,
    JSON.stringify(
      {
        traceVersion: "v0",
        traceId: "run-123",
        mode: "observe",
        site: "example.com",
        singleTabOnly: true,
        taskHint: "capture the homepage",
        steps: [
          {
            stepIndex: 1,
            timestamp: "2026-03-21T00:00:00.000Z",
            action: "navigate",
            tabId: "tab-1",
            target: { type: "url", value: "https://example.com/" },
            input: {},
            page: { urlBefore: "about:blank", urlAfter: "https://example.com/" },
            rawRef: "event-1",
          },
        ],
      },
      null,
      2
    ),
    "utf-8"
  );

  const persistedSkills: Array<{
    name: string;
    description: string;
    body: string;
    sourceObserveRunId: string;
  }> = [];
  const skillRoot = path.join(tmpRoot, "skills");
  let summarizeCalls = 0;
  const service = new InteractiveSopCompactService(path.join(tmpRoot, "artifacts"), {
    semantic: {
      mode: "on",
      timeoutMs: 12000,
      model: "mock",
      apiKey: "test-key",
      thinkingLevel: "minimal",
    },
    createArtifactsWriter: (runId: string) => new ArtifactsWriter(path.join(tmpRoot, "artifacts"), runId),
    modelClient: {
      completeText: async () => {
        summarizeCalls += 1;
        return {
          rawText:
            summarizeCalls === 1
              ? "I need one clarification before this can be reused.\n\nWhat exact stop condition should this skill use?"
              : "This workflow is sufficiently understood for reuse.",
          model: "mock",
          provider: "test",
          stopReason: "stop",
        };
      },
      completeObject: async (systemPrompt: string) => {
        if (systemPrompt === SUMMARIZE_SYSTEM_PROMPT) {
          return {
            payload: {
              ...(summarizeCalls === 1
                ? {
                    patch: {
                      workflowUpdates: {
                        addStableSteps: ["navigate to the homepage"],
                        removeStableSteps: [],
                        addUncertainSteps: ["confirm the stop condition"],
                        removeUncertainSteps: [],
                        addNoiseNotes: [],
                      },
                      taskUnderstandingNext: "capture the homepage",
                      openDecisionsNext: ["What exact stop condition should this skill use?"],
                      absorbedHumanFeedback: [],
                      convergenceNext: {
                        status: "continue",
                        reason: "still missing the reusable stop boundary",
                      },
                    },
                    humanLoopRequest: {
                      reason_for_clarification: "stop condition still changes the reusable boundary",
                      current_understanding: "capture the homepage",
                      focus_question: "What exact stop condition should this skill use?",
                      why_this_matters: "The stop rule changes when another operator should end the flow.",
                    },
                  }
                : {
                    patch: {
                      workflowUpdates: {
                        addStableSteps: ["navigate to the homepage"],
                        removeStableSteps: [],
                        addUncertainSteps: [],
                        removeUncertainSteps: ["confirm the stop condition"],
                        addNoiseNotes: [],
                      },
                      taskUnderstandingNext: "capture the homepage",
                      openDecisionsNext: [],
                      absorbedHumanFeedback: ["Stop once the homepage is visible."],
                      convergenceNext: {
                        status: "ready_to_finalize",
                        reason: "sufficiently understood",
                      },
                    },
                  }),
            },
            rawText: "{}",
            model: "mock",
            provider: "test",
            stopReason: "stop",
          };
        }
        return {
          payload: {
            skillName: "homepage-capture",
            description: "Capture the homepage for a known site.",
            body: [
              "# Homepage Capture",
              "",
              "## Goal",
              "",
              "Open the target homepage and stop when the page is visible.",
            ].join("\n"),
          },
          rawText: "{}",
          model: "mock",
          provider: "test",
          stopReason: "stop",
        };
      },
    } as never,
    humanLoopTool: {
      requestClarification: async () => ({
        interaction_status: "answered",
        human_reply: "Stop once the homepage is visible.",
      }),
    },
    telemetryRegistry: {
      createRunTelemetry() {
        return {
          eventBus: {
            emit: async () => undefined,
            dispose: async () => undefined,
          },
          dispose: async () => undefined,
        };
      },
    } as never,
    skillStore: {
      writeSkill: async (document) => {
        persistedSkills.push(document);
        const skillDir = path.join(skillRoot, document.name);
        await mkdir(skillDir, { recursive: true });
        const skillPath = path.join(skillDir, "SKILL.md");
        await writeFile(
          skillPath,
          [
            "---",
            `name: ${document.name}`,
            `description: ${document.description}`,
            `source_observe_run_id: ${document.sourceObserveRunId}`,
            "---",
            "",
            document.body,
          ].join("\n"),
          "utf-8"
        );
        return { skillPath };
      },
    },
  } as never);

  const result = await service.compact("run-123");

  assert.equal(result.selectedSkillName, "homepage-capture");
  assert.equal(result.skillPath, path.join(skillRoot, "homepage-capture", "SKILL.md"));
  assert.equal(result.sourceObserveRunId, "run-123");
  assert.deepEqual(persistedSkills, [
    {
      name: "homepage-capture",
      description: "Capture the homepage for a known site.",
      body: [
        "# Homepage Capture",
        "",
        "## Goal",
        "",
        "Open the target homepage and stop when the page is visible.",
      ].join("\n"),
      sourceObserveRunId: "run-123",
    },
  ]);

  const skill = await readFile(result.skillPath, "utf-8");
  assert.match(skill, /^---\nname: homepage-capture\n/m);
  assert.match(skill, /\ndescription: Capture the homepage for a known site\.\n/);
  assert.match(skill, /\nsource_observe_run_id: run-123\n/);
  assert.match(skill, /\n---\n\n# Homepage Capture\n\n## Goal\n/);
});

test("interactive sop compact does not persist a durable skill when max rounds are reached", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-compact-max-rounds-"));
  const tracePath = path.join(tmpRoot, "artifacts", "run-123", "demonstration_trace.json");
  await mkdir(path.dirname(tracePath), { recursive: true });
  await writeFile(
    tracePath,
    JSON.stringify(
      {
        traceVersion: "v0",
        traceId: "run-123",
        mode: "observe",
        site: "example.com",
        singleTabOnly: true,
        taskHint: "capture the homepage",
        steps: [
          {
            stepIndex: 1,
            timestamp: "2026-03-21T00:00:00.000Z",
            action: "navigate",
            tabId: "tab-1",
            target: { type: "url", value: "https://example.com/" },
            input: {},
            page: { urlBefore: "about:blank", urlAfter: "https://example.com/" },
            rawRef: "event-1",
          },
        ],
      },
      null,
      2
    ),
    "utf-8"
  );

  let finalizeCalls = 0;
  const persistedSkills: Array<{ name: string }> = [];
  const service = new InteractiveSopCompactService(path.join(tmpRoot, "artifacts"), {
    semantic: {
      mode: "on",
      timeoutMs: 12000,
      model: "mock",
      apiKey: "test-key",
      thinkingLevel: "minimal",
    },
    hardLimit: 0,
    createArtifactsWriter: (runId: string) => new ArtifactsWriter(path.join(tmpRoot, "artifacts"), runId),
    modelClient: {
      completeText: async () => {
        throw new Error("reasoning should not run when hard limit is already reached");
      },
      completeObject: async (systemPrompt: string) => {
        assert.equal(systemPrompt, FINALIZE_SYSTEM_PROMPT);
        finalizeCalls += 1;
        return {
          payload: {
            skillName: "homepage-capture",
            description: "Capture the homepage for a known site.",
            body: "# Homepage Capture",
          },
          rawText: "{}",
          model: "mock",
          provider: "test",
          stopReason: "stop",
        };
      },
    } as never,
    humanLoopTool: {
      requestClarification: async () => {
        throw new Error("human loop should not be reached when hard limit is already reached");
      },
    },
    telemetryRegistry: {
      createRunTelemetry() {
        return {
          eventBus: {
            emit: async () => undefined,
            dispose: async () => undefined,
          },
          dispose: async () => undefined,
        };
      },
    } as never,
    skillStore: {
      writeSkill: async (document) => {
        persistedSkills.push({ name: document.name });
        return { skillPath: path.join(tmpRoot, "skills", document.name, "SKILL.md") };
      },
    },
  } as never);

  const result = await service.compact("run-123");

  assert.equal(result.status, "max_round_reached");
  assert.equal(result.sourceObserveRunId, "run-123");
  assert.equal(result.selectedSkillName, null);
  assert.equal(result.skillPath, null);
  assert.equal(finalizeCalls, 0);
  assert.deepEqual(persistedSkills, []);
});

test("interactive sop compact does not persist a durable skill when the user stops clarification", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-compact-user-stopped-"));
  const tracePath = path.join(tmpRoot, "artifacts", "run-123", "demonstration_trace.json");
  await mkdir(path.dirname(tracePath), { recursive: true });
  await writeFile(
    tracePath,
    JSON.stringify(
      {
        traceVersion: "v0",
        traceId: "run-123",
        mode: "observe",
        site: "example.com",
        singleTabOnly: true,
        taskHint: "capture the homepage",
        steps: [
          {
            stepIndex: 1,
            timestamp: "2026-03-21T00:00:00.000Z",
            action: "navigate",
            tabId: "tab-1",
            target: { type: "url", value: "https://example.com/" },
            input: {},
            page: { urlBefore: "about:blank", urlAfter: "https://example.com/" },
            rawRef: "event-1",
          },
        ],
      },
      null,
      2
    ),
    "utf-8"
  );

  let finalizeCalls = 0;
  const persistedSkills: Array<{ name: string }> = [];
  const service = new InteractiveSopCompactService(path.join(tmpRoot, "artifacts"), {
    semantic: {
      mode: "on",
      timeoutMs: 12000,
      model: "mock",
      apiKey: "test-key",
      thinkingLevel: "minimal",
    },
    createArtifactsWriter: (runId: string) => new ArtifactsWriter(path.join(tmpRoot, "artifacts"), runId),
    modelClient: {
      completeText: async () => ({
        rawText: "We need one clarification before this workflow can be reused.\n\nWhat exact stop condition should this skill use?",
        model: "mock",
        provider: "test",
        stopReason: "stop",
      }),
      completeObject: async (systemPrompt: string) => {
        if (systemPrompt === SUMMARIZE_SYSTEM_PROMPT) {
          return {
            payload: {
              patch: {
                workflowUpdates: {
                  addStableSteps: ["navigate to the homepage"],
                  removeStableSteps: [],
                  addUncertainSteps: ["confirm the stop condition"],
                  removeUncertainSteps: [],
                  addNoiseNotes: [],
                },
                taskUnderstandingNext: "capture the homepage",
                openDecisionsNext: ["What exact stop condition should this skill use?"],
                absorbedHumanFeedback: [],
                convergenceNext: {
                  status: "continue",
                  reason: "still missing the reusable stop boundary",
                },
              },
              humanLoopRequest: {
                reason_for_clarification: "stop condition still changes the reusable boundary",
                current_understanding: "capture the homepage",
                focus_question: "What exact stop condition should this skill use?",
                why_this_matters: "The stop rule changes when another operator should end the flow.",
              },
            },
            rawText: "{}",
            model: "mock",
            provider: "test",
            stopReason: "stop",
          };
        }
        finalizeCalls += 1;
        return {
          payload: {
            skillName: "homepage-capture",
            description: "Capture the homepage for a known site.",
            body: "# Homepage Capture",
          },
          rawText: "{}",
          model: "mock",
          provider: "test",
          stopReason: "stop",
        };
      },
    } as never,
    humanLoopTool: {
      requestClarification: async () => ({
        interaction_status: "stop",
        human_reply: "Stop here for now.",
      }),
    },
    telemetryRegistry: {
      createRunTelemetry() {
        return {
          eventBus: {
            emit: async () => undefined,
            dispose: async () => undefined,
          },
          dispose: async () => undefined,
        };
      },
    } as never,
    skillStore: {
      writeSkill: async (document) => {
        persistedSkills.push({ name: document.name });
        return { skillPath: path.join(tmpRoot, "skills", document.name, "SKILL.md") };
      },
    },
  } as never);

  const result = await service.compact("run-123");

  assert.equal(result.status, "user_stopped");
  assert.equal(result.sourceObserveRunId, "run-123");
  assert.equal(result.selectedSkillName, null);
  assert.equal(result.skillPath, null);
  assert.equal(finalizeCalls, 0);
  assert.deepEqual(persistedSkills, []);
});
