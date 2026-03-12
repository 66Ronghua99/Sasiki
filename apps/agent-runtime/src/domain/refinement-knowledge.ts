/**
 * Deps: domain/refinement-session.ts
 * Used By: runtime/artifacts-writer.ts
 * Last Updated: 2026-03-12
 */
export type {
  RefinementElementHints,
  RefinementSnapshotRef,
  RefinementStepOutcome,
  RefinementStepRecord,
  RefinementStepRelevance,
  SnapshotMode as RefinementSnapshotMode,
} from "./refinement-session.js";

export type RefinementKnowledgeType =
  | "element_affordance"
  | "branch_guard"
  | "completion_signal"
  | "recovery_rule"
  | "noise_pattern";

export type RefinementKnowledgeConfidence = "high" | "medium" | "low";

export type RefinementKnowledgeStatus = "active" | "superseded" | "held";

export interface RefinementKnowledgeProvenance {
  runId: string;
  pageId: string;
  stepIndex: number;
  snapshot_hash: string;
}

export interface PromotedKnowledgeRecord {
  schemaVersion: "refinement_knowledge.v0";
  knowledgeId: string;
  knowledgeType: RefinementKnowledgeType;
  surfaceKey: string;
  taskKey: string;
  instruction: string;
  sourceStepIds: string[];
  confidence: RefinementKnowledgeConfidence;
  rationale: string;
  critic_challenge: string[];
  final_decision: "promote" | "hold";
  status: RefinementKnowledgeStatus;
  createdAt: string;
  updatedAt: string;
  provenance: RefinementKnowledgeProvenance;
}

export type SnapshotIndexPhase = "before" | "after";

export interface RefinementSnapshotIndexRecord {
  schemaVersion: "snapshot_index.v0";
  snapshotId: string;
  runId: string;
  pageId: string;
  stepIndex: number;
  phase: SnapshotIndexPhase;
  path: string;
  snapshotHash: string;
  charCount: number;
  tokenEstimate: number;
  capturedAt: string;
}
