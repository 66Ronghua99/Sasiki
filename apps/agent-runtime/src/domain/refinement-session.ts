/**
 * Deps: none
 * Used By: application/refine/*, kernel/pi-agent-tool-adapter.ts
 * Last Updated: 2026-03-23
 */
export type ToolCallRecordUnit = "tool_call";
export type ToolCallHookOrigin = "tool_call" | "hook_internal";
export type ToolClass = "mutation" | "observation" | "meta";

export type SnapshotCaptureStatus = "captured" | "fallback" | "skipped" | "failed";
export type SnapshotMode = "full" | "summary_fallback";
export type PageBoundaryReason = "navigation" | "tab_switch" | "url_change" | "manual_reset";
export type RefinementStepOutcome = "progress" | "no_progress" | "page_changed" | "info_only" | "blocked";
export type RefinementStepRelevance = "task_relevant" | "task_irrelevant" | "unknown";

export interface ToolCallHookContext {
  runId: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  pageId: string;
  stepIndex: number;
  toolClass: ToolClass;
  hookOrigin: ToolCallHookOrigin;
}

export interface SnapshotCaptureRecord {
  captureStatus: SnapshotCaptureStatus;
  captureError?: string;
  snapshotLatencyMs?: number;
  snapshotId?: string;
  path?: string;
  summary?: string;
  snapshot_hash?: string;
}

export interface RefinementSnapshotRef {
  snapshotId: string;
  path: string;
  summary: string;
  snapshot_hash: string;
}

export interface RefinementElementHints {
  ref?: string;
  selector?: string;
  text?: string;
  role?: string;
}

export interface RefinementStepRecord {
  schemaVersion: "refinement_step_record.v0";
  runId: string;
  sessionId: string;
  stepIndex: number;
  recordUnit: ToolCallRecordUnit;
  pageStepId: string;
  toolCallId: string;
  operationIndexWithinPageStep: number;
  pageBoundaryReason?: PageBoundaryReason;
  pageId: string;
  beforeSnapshot: RefinementSnapshotRef;
  afterSnapshot: RefinementSnapshotRef;
  assistantIntent: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  resultExcerpt: string;
  elementHints?: RefinementElementHints;
  outcome: RefinementStepOutcome;
  relevance: RefinementStepRelevance;
  human_intervention_note: string[];
  snapshot_mode: SnapshotMode;
}
