import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { mock } from "node:test";

import {
  FINALIZE_SYSTEM_PROMPT,
  REASONER_SYSTEM_PROMPT,
  SUMMARIZE_SYSTEM_PROMPT,
} from "../../../src/application/compact/interactive-sop-compact-prompts.js";
import { createCompactWorkflow } from "../../../src/application/compact/compact-workflow.js";
import { InteractiveSopCompactService } from "../../../src/application/compact/interactive-sop-compact.js";
import { SopRuleCompactBuilder } from "../../../src/application/compact/sop-rule-compact-builder.js";
import { RuntimeHost } from "../../../src/application/shell/runtime-host.js";
import { JsonModelClient } from "../../../src/infrastructure/llm/json-model-client.js";

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

  const host = new RuntimeHost({ workflow });
  await host.start();
  const result = await host.execute();
  await host.dispose();

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

  mock.method(JsonModelClient.prototype, "completeText", async () => ({
    rawText: "compact reasoning response",
    model: "mock",
    provider: "test",
    stopReason: "stop",
  }));
  mock.method(JsonModelClient.prototype, "completeObject", async (systemPrompt: string) => {
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
        taskUnderstanding: "capture the homepage",
        workflowSkeleton: ["navigate home"],
        decisionStrategy: ["keep it simple"],
        actionPolicy: {
          requiredActions: ["navigate"],
          optionalActions: [],
          conditionalActions: [],
          nonCoreActions: [],
        },
        stopPolicy: ["stop when the homepage is captured"],
        reuseBoundary: {
          applicableWhen: ["homepage capture workflows"],
          notApplicableWhen: [],
          contextDependencies: ["homepage URL"],
        },
        remainingUncertainties: [],
      },
      rawText: "{}",
      model: "mock",
      provider: "test",
      stopReason: "stop",
    };
  });

  const service = new InteractiveSopCompactService(path.join(tmpRoot, "artifacts"), {
    semantic: {
      mode: "on",
      timeoutMs: 12000,
      model: "mock",
      apiKey: "test-key",
      thinkingLevel: "minimal",
    },
    telemetryRegistry: telemetryRegistry as never,
  } as never);

  try {
    const result = await service.compact("run-123");

    assert.equal(result.runId, "run-123");
    assert.equal(result.status, "ready_to_finalize");
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
    await assert.rejects(
      readFile(path.join(tmpRoot, "artifacts", "run-123", "runtime.log"), "utf-8"),
      /ENOENT/
    );
  } finally {
    mock.restoreAll();
  }
});
