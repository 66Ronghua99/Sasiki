export type CompactConvergenceStatus = "continue" | "ready_to_finalize" | "max_round_reached" | "user_stopped";

export interface CompactWorkflowSkeletonState {
  stableSteps: string[];
  uncertainSteps: string[];
  noiseNotes: string[];
}

export interface CompactConvergenceState {
  status: CompactConvergenceStatus;
  reason: string;
}

export interface CompactSessionState {
  schemaVersion: "compact_session_state.v0";
  sessionId: string;
  runId: string;
  roundIndex: number;
  workflowSkeleton: CompactWorkflowSkeletonState;
  taskUnderstanding: string;
  openDecisions: string[];
  humanFeedbackMemory: string[];
  convergence: CompactConvergenceState;
}

export interface CompactWorkflowUpdates {
  addStableSteps: string[];
  removeStableSteps: string[];
  addUncertainSteps: string[];
  removeUncertainSteps: string[];
  addNoiseNotes: string[];
}

export interface CompactSessionPatch {
  schemaVersion: "compact_session_patch.v0";
  workflowUpdates: CompactWorkflowUpdates;
  taskUnderstandingNext: string;
  openDecisionsNext: string[];
  absorbedHumanFeedback: string[];
  convergenceNext: CompactConvergenceState;
}

export interface CompactActionPolicy {
  requiredActions: string[];
  optionalActions: string[];
  conditionalActions: string[];
  nonCoreActions: string[];
}

export interface CompactReuseBoundary {
  applicableWhen: string[];
  notApplicableWhen: string[];
  contextDependencies: string[];
}

export interface CompactCapabilityOutput {
  schemaVersion: "compact_capability_output.v0";
  runId: string;
  taskUnderstanding: string;
  workflowSkeleton: string[];
  decisionStrategy: string[];
  actionPolicy: CompactActionPolicy;
  stopPolicy: string[];
  reuseBoundary: CompactReuseBoundary;
  remainingUncertainties: string[];
}

export interface CompactHumanLoopRequest {
  reason_for_clarification: string;
  current_understanding: string;
  focus_question: string;
  why_this_matters: string;
}

export type CompactHumanInteractionStatus = "answered" | "defer" | "stop";

export interface CompactHumanLoopResponse {
  human_reply: string;
  interaction_status: CompactHumanInteractionStatus;
}

export interface CompactHumanLoopEvent {
  timestamp: string;
  roundIndex: number;
  role: "agent" | "human" | "system";
  eventType: "assistant_response" | "clarification_request" | "human_reply" | "session_status";
  payload: Record<string, unknown>;
}

export interface CompactReasoningTurnOutput {
  assistantResponse: string;
  patch: CompactSessionPatch;
  humanLoopRequest?: CompactHumanLoopRequest;
}
