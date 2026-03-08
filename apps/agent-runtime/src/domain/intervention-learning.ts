/**
 * Deps: none
 * Used By: runtime/run-executor.ts, runtime/artifacts-writer.ts, infrastructure/hitl/terminal-hitl-controller.ts
 * Last Updated: 2026-03-06
 */
export type InterventionIssueType = "no_page_change" | "tool_error" | "uncertain_state" | "validation_fail";

export interface InterventionLearningContext {
  pageHint?: string;
  elementHint?: string;
  inputVariable?: string;
}

export interface InterventionLearningRecord {
  runId: string;
  sopVersion: string;
  timestamp: string;
  issueType: InterventionIssueType;
  operationIntent: string;
  context: InterventionLearningContext;
  beforeState: string;
  humanAction: string;
  afterState: string;
  resumeInstruction: string;
  nextTimeRule: string;
}

export interface HitlInterventionRequest {
  runId: string;
  attempt: number;
  issueType: InterventionIssueType;
  operationIntent: string;
  failureReason: string;
  beforeState: string;
  context: InterventionLearningContext;
}

export interface HitlInterventionResponse {
  humanAction: string;
  resumeInstruction: string;
  nextTimeRule: string;
}
