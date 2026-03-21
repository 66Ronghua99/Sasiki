import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCompactSessionPatch,
  buildInitialCompactSessionState,
} from "../../../src/application/compact/compact-session-machine.js";

test("application compact session machine builds and applies compact state", () => {
  const state = buildInitialCompactSessionState("run-1", "session-1", {
    runId: "run-1",
    traceId: "trace-1",
    site: "example.com",
    taskHint: "search coffee beans",
    totalSteps: 3,
    tabs: ["tab-1"],
    highLevelSteps: ["打开页面", "搜索咖啡豆"],
    urlSamples: ["https://example.com/"],
    actionSummary: { navigate: 1, click: 1, type: 1 },
  });

  assert.equal(state.runId, "run-1");
  assert.equal(state.sessionId, "session-1");
  assert.equal(state.roundIndex, 0);
  assert.match(state.taskUnderstanding, /search coffee beans/);
  assert.deepEqual(state.workflowSkeleton.uncertainSteps, ["打开页面", "搜索咖啡豆"]);
  assert.deepEqual(state.openDecisions, [
    "这条流程真正想复用的目标是什么？",
    "对象动作是必做、可选还是按情况触发？",
    "什么条件下算这条流程完成？",
  ]);

  const nextState = applyCompactSessionPatch(state, {
    schemaVersion: "compact_session_patch.v0",
    workflowUpdates: {
      addStableSteps: ["打开页面"],
      removeStableSteps: [],
      addUncertainSteps: ["确认结果"],
      removeUncertainSteps: ["搜索咖啡豆"],
      addNoiseNotes: ["跳转了一个无关标签页"],
    },
    taskUnderstandingNext: "已确认流程目标",
    openDecisionsNext: ["是否需要登录后再搜索？"],
    absorbedHumanFeedback: ["先确认页面再搜索"],
    convergenceNext: {
      status: "continue",
      reason: "still clarifying",
    },
  });

  assert.equal(nextState.roundIndex, 1);
  assert.deepEqual(nextState.workflowSkeleton.stableSteps, ["打开页面"]);
  assert.deepEqual(nextState.workflowSkeleton.uncertainSteps, ["确认结果"]);
  assert.deepEqual(nextState.workflowSkeleton.noiseNotes, ["跳转了一个无关标签页"]);
  assert.equal(nextState.taskUnderstanding, "已确认流程目标");
  assert.deepEqual(nextState.openDecisions, ["是否需要登录后再搜索？"]);
  assert.deepEqual(nextState.humanFeedbackMemory, ["先确认页面再搜索"]);
  assert.equal(nextState.convergence.status, "continue");
});
