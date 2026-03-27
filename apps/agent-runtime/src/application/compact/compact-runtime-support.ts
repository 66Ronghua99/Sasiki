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
  return {
    schemaVersion: "compact_skill_output.v0",
    skillName: readRequiredString(payload.skillName, "skillName"),
    description: readRequiredString(payload.description, "description"),
    body: readRequiredString(payload.body, "body"),
    sourceObserveRunId: state.runId,
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

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`compact finalizer must return a non-empty string field: ${field}`);
  }
  return value.trim();
}
