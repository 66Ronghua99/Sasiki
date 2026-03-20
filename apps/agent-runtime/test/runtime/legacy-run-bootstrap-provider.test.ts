import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRunRequest } from "../../src/domain/agent-types.js";
import type { SopConsumptionResult } from "../../src/domain/sop-consumption.js";
import { LegacyRunBootstrapProvider } from "../../src/runtime/providers/legacy-run-bootstrap-provider.js";

function buildRequest(overrides: Partial<AgentRunRequest> = {}): AgentRunRequest {
  return {
    task: "draft a xiaohongshu note",
    sopRunId: undefined,
    resumeRunId: undefined,
    ...overrides,
  };
}

test("legacy bootstrap provider returns prepared task plus record when consumption context is available", async () => {
  const prepared: SopConsumptionResult = {
    taskForLoop: "use the injected SOP guide",
    record: {
      enabled: true,
      originalTask: "draft a xiaohongshu note",
      taskSource: "request",
      injected: true,
      selectionMode: "auto",
      selectedAssetId: "sop_123",
      candidateAssetIds: ["sop_123"],
      candidateCount: 1,
      guideSource: "semantic",
      fallbackUsed: false,
      usedHints: [],
      generatedAt: "2026-03-20T12:00:00.000Z",
    },
  };

  const provider = new LegacyRunBootstrapProvider({
    consumptionContext: {
      build: async (input) => {
        assert.deepEqual(input, {
          task: "draft a xiaohongshu note",
          sopRunId: undefined,
        });
        return prepared;
      },
    },
  });

  const result = await provider.prepare(buildRequest());

  assert.equal(result.taskForLoop, "use the injected SOP guide");
  assert.equal(result.record.selectedAssetId, "sop_123");
  assert.equal(result.record.fallbackUsed, false);
});

test("legacy bootstrap provider preserves request task and emits fallback metadata when no consumption context is configured", async () => {
  const provider = new LegacyRunBootstrapProvider();

  const result = await provider.prepare(
    buildRequest({
      task: "continue from current browser state",
      sopRunId: "run_42",
    })
  );

  assert.equal(result.taskForLoop, "continue from current browser state");
  assert.equal(result.record.originalTask, "continue from current browser state");
  assert.equal(result.record.selectionMode, "pinned");
  assert.equal(result.record.pinnedRunId, "run_42");
  assert.equal(result.record.guideSource, "none");
  assert.equal(result.record.fallbackUsed, true);
  assert.equal(result.record.fallbackReason, "consumption_not_configured");
  assert.deepEqual(result.record.candidateAssetIds, []);
  assert.equal(result.record.candidateCount, 0);
});
