import type {
  CompactConvergenceState,
  CompactHumanLoopRequest,
  CompactReasoningTurnOutput,
  CompactSessionPatch,
  CompactSessionState,
} from "../domain/compact-reasoning.js";

export function normalizeCompactTurnOutput(
  payload: Record<string, unknown>,
  state: CompactSessionState,
  assistantResponse: string
): CompactReasoningTurnOutput {
  const patchRecord = readRecord(payload.patch);
  const workflowUpdates = readRecord(patchRecord?.workflowUpdates);
  const taskUnderstandingNext = readString(patchRecord?.taskUnderstandingNext) ?? state.taskUnderstanding;
  const requestedConvergence = normalizeConvergence(readRecord(patchRecord?.convergenceNext), state.convergence);
  const explicitOpenDecisions = readStringArray(patchRecord?.openDecisionsNext);
  const openDecisionsNext =
    explicitOpenDecisions.length > 0
      ? explicitOpenDecisions
      : deriveFallbackOpenDecisions(assistantResponse, requestedConvergence, state.openDecisions);

  const humanLoopRequest =
    normalizeHumanLoopRequest(payload.humanLoopRequest, assistantResponse) ??
    deriveHumanLoopRequestFromAssistantResponse(taskUnderstandingNext, openDecisionsNext, requestedConvergence);
  const effectiveConvergence =
    requestedConvergence.status === "ready_to_finalize" && humanLoopRequest
      ? { status: "continue" as const, reason: "human clarification still requested" }
      : requestedConvergence;

  return {
    assistantResponse,
    patch: {
      schemaVersion: "compact_session_patch.v0",
      workflowUpdates: {
        addStableSteps: readStringArray(workflowUpdates?.addStableSteps),
        removeStableSteps: readStringArray(workflowUpdates?.removeStableSteps),
        addUncertainSteps: readStringArray(workflowUpdates?.addUncertainSteps),
        removeUncertainSteps: readStringArray(workflowUpdates?.removeUncertainSteps),
        addNoiseNotes: readStringArray(workflowUpdates?.addNoiseNotes),
      },
      taskUnderstandingNext,
      openDecisionsNext,
      absorbedHumanFeedback: readStringArray(patchRecord?.absorbedHumanFeedback),
      convergenceNext: effectiveConvergence,
    },
    humanLoopRequest: effectiveConvergence.status === "continue" ? humanLoopRequest : undefined,
  };
}

function deriveFallbackOpenDecisions(
  assistantResponse: string,
  requestedConvergence: CompactConvergenceState,
  fallback: string[]
): string[] {
  if (requestedConvergence.status !== "continue") {
    return [];
  }

  const extractedQuestion = extractLastQuestionLine(assistantResponse);
  if (extractedQuestion) {
    return [extractedQuestion];
  }

  const reason = requestedConvergence.reason.trim();
  if (reason) {
    return [reason];
  }

  return [...fallback];
}

function normalizeConvergence(
  value: Record<string, unknown> | undefined,
  fallback: CompactConvergenceState
): CompactConvergenceState {
  const status = readString(value?.status);
  if (status === "ready_to_finalize") {
    return {
      status,
      reason: readString(value?.reason) ?? fallback.reason,
    };
  }
  return {
    status: "continue",
    reason: readString(value?.reason) ?? fallback.reason,
  };
}

function normalizeHumanLoopRequest(
  value: unknown,
  assistantResponse: string
): CompactHumanLoopRequest | undefined {
  const record = readRecord(value);
  if (!record) {
    return undefined;
  }
  const focusQuestion = readString(record.focus_question);
  if (!focusQuestion) {
    return undefined;
  }
  return {
    reason_for_clarification: readString(record.reason_for_clarification) ?? "critical ambiguity remains",
    current_understanding: readString(record.current_understanding) ?? assistantResponse,
    focus_question: focusQuestion,
    why_this_matters:
      readString(record.why_this_matters) ?? "The answer will change how this workflow should be reused.",
  };
}

function deriveHumanLoopRequestFromAssistantResponse(
  taskUnderstandingNext: string,
  openDecisionsNext: string[],
  requestedConvergence: CompactConvergenceState
): CompactHumanLoopRequest | undefined {
  if (requestedConvergence.status !== "continue" || openDecisionsNext.length === 0) {
    return undefined;
  }

  return {
    reason_for_clarification: requestedConvergence.reason || "critical ambiguity remains",
    current_understanding: taskUnderstandingNext,
    focus_question: openDecisionsNext[0],
    why_this_matters: "The answer will change the reusable boundary or action policy of this workflow.",
  };
}

function extractLastQuestionLine(message: string): string | undefined {
  const lines = message
    .split(/\r?\n/)
    .map((line) => stripFormatting(line))
    .filter((line) => line.length > 0);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/[？?]\s*$/.test(lines[index])) {
      return lines[index];
    }
  }

  return undefined;
}

function stripFormatting(line: string): string {
  return line
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
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

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
