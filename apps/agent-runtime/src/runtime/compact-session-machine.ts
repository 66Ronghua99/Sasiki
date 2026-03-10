import type { CompactSessionPatch, CompactSessionState } from "../domain/compact-reasoning.js";

export interface CompactTraceSummary {
  runId: string;
  traceId: string;
  site: string;
  taskHint: string;
  totalSteps: number;
  tabs: string[];
  highLevelSteps: string[];
  urlSamples: string[];
  actionSummary: Record<string, number>;
}

export function buildInitialCompactSessionState(
  runId: string,
  sessionId: string,
  summary: CompactTraceSummary
): CompactSessionState {
  const initialTaskUnderstanding = summary.taskHint
    ? `当前已知这是一条与“${summary.taskHint}”相关的浏览器示教，具体目标和动作策略仍待通过多轮推理收敛。`
    : `当前已知这是 ${summary.site} 上的一条浏览器示教，具体目标和动作策略仍待通过多轮推理收敛。`;
  const noiseNotes =
    summary.tabs.length > 1 ? [`示教涉及 ${summary.tabs.length} 个标签页，需警惕前置页面或跨 tab 噪音。`] : [];
  return {
    schemaVersion: "compact_session_state.v0",
    sessionId,
    runId,
    roundIndex: 0,
    workflowSkeleton: {
      stableSteps: [],
      uncertainSteps: summary.highLevelSteps,
      noiseNotes,
    },
    taskUnderstanding: initialTaskUnderstanding,
    openDecisions: [
      "这条流程真正想复用的目标是什么？",
      "对象动作是必做、可选还是按情况触发？",
      "什么条件下算这条流程完成？",
    ],
    humanFeedbackMemory: [],
    convergence: {
      status: "continue",
      reason: "initial reasoning pending",
    },
  };
}

export function applyCompactSessionPatch(state: CompactSessionState, patch: CompactSessionPatch): CompactSessionState {
  const stableSteps = mergeOrderedStrings(
    state.workflowSkeleton.stableSteps,
    patch.workflowUpdates.removeStableSteps,
    patch.workflowUpdates.addStableSteps
  );
  let uncertainSteps = mergeOrderedStrings(
    state.workflowSkeleton.uncertainSteps,
    patch.workflowUpdates.removeUncertainSteps,
    patch.workflowUpdates.addUncertainSteps
  ).filter((step) => !stableSteps.includes(step));

  for (const step of patch.workflowUpdates.addStableSteps) {
    uncertainSteps = uncertainSteps.filter((candidate) => candidate !== step);
  }

  const nextState: CompactSessionState = {
    ...state,
    roundIndex: state.roundIndex + 1,
    workflowSkeleton: {
      stableSteps,
      uncertainSteps,
      noiseNotes: mergeOrderedStrings(state.workflowSkeleton.noiseNotes, [], patch.workflowUpdates.addNoiseNotes),
    },
    taskUnderstanding: patch.taskUnderstandingNext.trim() || state.taskUnderstanding,
    openDecisions: readStringArray(patch.openDecisionsNext, state.openDecisions),
    humanFeedbackMemory: mergeOrderedStrings(state.humanFeedbackMemory, [], patch.absorbedHumanFeedback),
    convergence: patch.convergenceNext,
  };

  if (
    nextState.convergence.status === "ready_to_finalize" &&
    state.humanFeedbackMemory.length === 0 &&
    state.openDecisions.length > 0 &&
    nextState.openDecisions.length === 0
  ) {
    return {
      ...nextState,
      openDecisions: state.openDecisions,
      convergence: {
        status: "continue",
        reason: "cannot finalize before any human clarification when critical open decisions still existed",
      },
    };
  }

  return nextState;
}

function mergeOrderedStrings(base: string[], removals: string[], additions: string[]): string[] {
  const removalSet = new Set(removals.map((item) => item.trim()).filter(Boolean));
  const merged = base.filter((item) => !removalSet.has(item.trim()));
  for (const item of additions) {
    if (!item.trim() || merged.includes(item)) {
      continue;
    }
    merged.push(item);
  }
  return uniqueStrings(merged);
}

function uniqueStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const normalized = raw.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function readStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  return uniqueStrings(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
  );
}
