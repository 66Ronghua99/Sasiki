import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCompactTurnOutput } from "../../../src/application/compact/compact-turn-normalizer.js";
import { normalizeCompactTurnOutput as runtimeNormalizeCompactTurnOutput } from "../../../src/runtime/compact-turn-normalizer.js";
import type { CompactSessionState } from "../../../src/domain/compact-reasoning.js";

const baseState: CompactSessionState = {
  schemaVersion: "compact_session_state.v0",
  sessionId: "session-1",
  runId: "run-1",
  roundIndex: 0,
  workflowSkeleton: {
    stableSteps: [],
    uncertainSteps: ["先确认页面"],
    noiseNotes: [],
  },
  taskUnderstanding: "当前还不确定流程边界",
  openDecisions: ["先确认页面"],
  humanFeedbackMemory: [],
  convergence: {
    status: "continue",
    reason: "still clarifying",
  },
};

test("application compact turn normalizer keeps clarification active when finalize was requested too early", () => {
  const result = normalizeCompactTurnOutput(
    {
      patch: {
        workflowUpdates: {
          addStableSteps: [],
          removeStableSteps: [],
          addUncertainSteps: [],
          removeUncertainSteps: [],
          addNoiseNotes: [],
        },
        taskUnderstandingNext: "",
        openDecisionsNext: [],
        absorbedHumanFeedback: [],
        convergenceNext: {
          status: "ready_to_finalize",
          reason: "ready to finalize",
        },
      },
      humanLoopRequest: {
        reason_for_clarification: "critical ambiguity remains",
        current_understanding: "Need one more clarification",
        focus_question: "是否还需要继续确认页面？",
        why_this_matters: "It changes the reusable boundary.",
      },
    },
    baseState,
    "Should we keep clarifying?"
  );

  assert.equal(result.patch.taskUnderstandingNext, baseState.taskUnderstanding);
  assert.deepEqual(result.patch.openDecisionsNext, []);
  assert.equal(result.patch.convergenceNext.status, "continue");
  assert.equal(result.humanLoopRequest?.focus_question, "是否还需要继续确认页面？");
});

test("runtime compact turn normalizer is a shim over the application compact turn normalizer", () => {
  assert.equal(runtimeNormalizeCompactTurnOutput, normalizeCompactTurnOutput);
});
