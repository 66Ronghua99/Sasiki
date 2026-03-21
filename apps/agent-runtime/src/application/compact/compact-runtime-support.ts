import type { RuntimeEvent } from "../../contracts/runtime-telemetry.js";
import type {
  CompactCapabilityOutput,
  CompactConvergenceState,
  CompactHumanLoopEvent,
  CompactHumanLoopRequest,
  CompactSessionState,
} from "../../domain/compact-reasoning.js";

export function buildCompactAgentTurnEvent(input: {
  runId: string;
  roundIndex: number;
  assistantResponse: string;
  convergenceStatus: CompactConvergenceState["status"];
}): RuntimeEvent {
  return {
    timestamp: new Date().toISOString(),
    workflow: "compact",
    runId: input.runId,
    eventType: "agent.turn",
    turnIndex: input.roundIndex,
    payload: {
      turnIndex: input.roundIndex,
      text: input.assistantResponse,
      stopReason: input.convergenceStatus === "continue" ? "round_completed" : input.convergenceStatus,
      toolCalls: [],
    },
  };
}

export function normalizeCompactCapabilityOutput(
  payload: Record<string, unknown>,
  state: CompactSessionState
): CompactCapabilityOutput {
  const actionPolicy = readRecord(payload.actionPolicy);
  const reuseBoundary = readRecord(payload.reuseBoundary);
  const remainingUncertainties = [
    ...readStringArray(payload.remainingUncertainties),
    ...state.openDecisions,
    ...state.workflowSkeleton.uncertainSteps,
  ];

  return {
    schemaVersion: "compact_capability_output.v0",
    runId: state.runId,
    taskUnderstanding: readString(payload.taskUnderstanding) ?? state.taskUnderstanding,
    workflowSkeleton: readStringArray(payload.workflowSkeleton, state.workflowSkeleton.stableSteps),
    decisionStrategy: readStringArray(payload.decisionStrategy),
    actionPolicy: {
      requiredActions: readStringArray(actionPolicy?.requiredActions),
      optionalActions: readStringArray(actionPolicy?.optionalActions),
      conditionalActions: readStringArray(actionPolicy?.conditionalActions),
      nonCoreActions: readStringArray(actionPolicy?.nonCoreActions),
    },
    stopPolicy: readStringArray(payload.stopPolicy),
    reuseBoundary: {
      applicableWhen: readStringArray(reuseBoundary?.applicableWhen),
      notApplicableWhen: readStringArray(reuseBoundary?.notApplicableWhen),
      contextDependencies: readStringArray(reuseBoundary?.contextDependencies),
    },
    remainingUncertainties: uniqueStrings(remainingUncertainties),
  };
}

export function buildCompactAssistantEvent(roundIndex: number, assistantResponse: string): CompactHumanLoopEvent {
  return {
    timestamp: new Date().toISOString(),
    roundIndex,
    role: "agent",
    eventType: "assistant_response",
    payload: {
      message: assistantResponse,
    },
  };
}

export function buildCompactClarificationRequestEvent(
  roundIndex: number,
  request: CompactHumanLoopRequest
): CompactHumanLoopEvent {
  return {
    timestamp: new Date().toISOString(),
    roundIndex,
    role: "agent",
    eventType: "clarification_request",
    payload: {
      reason_for_clarification: request.reason_for_clarification,
      current_understanding: request.current_understanding,
      focus_question: request.focus_question,
      why_this_matters: request.why_this_matters,
    },
  };
}

export function buildCompactSessionStatusEvent(
  roundIndex: number,
  convergence: CompactConvergenceState
): CompactHumanLoopEvent {
  return {
    timestamp: new Date().toISOString(),
    roundIndex,
    role: "system",
    eventType: "session_status",
    payload: {
      status: convergence.status,
      reason: convergence.reason,
    },
  };
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

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
