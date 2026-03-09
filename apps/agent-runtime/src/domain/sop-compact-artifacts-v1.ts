/**
 * Deps: none
 * Used By: runtime/sop-compact.ts, runtime/sop-intent-abstraction-builder.ts
 * Last Updated: 2026-03-08
 */

export type BehaviorPrimitive =
  | "open_surface"
  | "switch_context"
  | "locate_candidate"
  | "iterate_collection"
  | "inspect_state"
  | "edit_content"
  | "submit_action"
  | "verify_outcome";

export type BehaviorConfidence = "high" | "medium" | "low";
export type SemanticConfidence = "high" | "medium" | "low";
export type SemanticSeverity = "high" | "medium" | "low";
export type ClarificationPriority = "high" | "medium";
export type ExecutionGuideStatus = "draft" | "needs_clarification" | "ready_for_replay" | "rejected";
export type ExecutionGuideStepRole = "default" | "branch_point" | "loop" | "submit_point" | "verification_point";

export interface BehaviorEvidenceSignal {
  id: string;
  primitive: BehaviorPrimitive;
  evidence: string[];
  confidence: BehaviorConfidence;
}

export interface BehaviorStepEvidence {
  stepIndex: number;
  action: string;
  tabId: string;
  targetType: string;
  targetValue: string;
  textHint?: string;
  roleHint?: string;
  assertionHint?: string;
}

export interface BehaviorExampleCandidate {
  id: string;
  sourceStepIndex: number;
  type: "target_text" | "input_value" | "selector" | "text_hint";
  value: string;
}

export interface BehaviorEvidence {
  schemaVersion: "behavior_evidence.v1";
  runId: string;
  traceId: string;
  site: string;
  surface: string;
  rawTask: string;
  actionSummary: Record<string, number>;
  phaseSignals: BehaviorEvidenceSignal[];
  stepEvidence: BehaviorStepEvidence[];
  exampleCandidates: BehaviorExampleCandidate[];
  uncertaintyCues: string[];
}

export interface BehaviorWorkflowStep {
  id: string;
  primitive: BehaviorPrimitive;
  summary: string;
  evidenceRefs: string[];
}

export interface BehaviorWorkflow {
  schemaVersion: "behavior_workflow.v1";
  steps: BehaviorWorkflowStep[];
  branchPoints: string[];
  observedLoops: string[];
  submitPoints: string[];
  verificationPoints: string[];
}

export interface SemanticPurposeHypothesis {
  stepId: string;
  purpose: string;
  confidence: SemanticConfidence;
  evidenceRefs: string[];
}

export interface SemanticUncertainty {
  field: string;
  severity: SemanticSeverity;
  reason: string;
}

export interface SemanticIntentDraft {
  schemaVersion: "semantic_intent_draft.v1";
  taskIntentHypothesis: string;
  scopeHypothesis: string;
  completionHypothesis: string;
  actionPurposeHypotheses: SemanticPurposeHypothesis[];
  selectionHypotheses: string[];
  skipHypotheses: string[];
  blockingUncertainties: SemanticUncertainty[];
  nonBlockingUncertainties: SemanticUncertainty[];
}

export interface ClarificationQuestionV1 {
  id: string;
  targetsSemanticField: string;
  question: string;
  priority: ClarificationPriority;
}

export interface ClarificationQuestionsV1 {
  schemaVersion: "clarification_questions.v1";
  questions: ClarificationQuestionV1[];
}

export interface ExecutionGuideWorkflowOutlineStep {
  stepId: string;
  primitive: BehaviorPrimitive;
  summary: string;
  purpose: string;
  evidenceRefs: string[];
}

export interface ExecutionGuideSemanticConstraint {
  id: string;
  category: "selection" | "skip" | "resolution" | "guardrail";
  statement: string;
}

export interface ExecutionGuideStepDetail {
  stepId: string;
  primitive: BehaviorPrimitive;
  summary: string;
  purpose: string;
  evidenceRefs: string[];
  stepRole: ExecutionGuideStepRole;
}

export interface ExecutionGuideBranchHint {
  id: string;
  stepId: string;
  hint: string;
  relatedSemanticFields: string[];
}

export interface ExecutionGuideUnresolvedQuestion {
  field: string;
  severity: SemanticSeverity;
  reason: string;
  question?: string;
  priority?: ClarificationPriority;
}

export interface ExecutionGuideV1 {
  schemaVersion: "execution_guide.v1";
  runId: string;
  status: ExecutionGuideStatus;
  replayReady: boolean;
  generalPlan: {
    goal: string;
    scope: string;
    workflowOutline: ExecutionGuideWorkflowOutlineStep[];
    doneCriteria: string[];
    semanticConstraints: ExecutionGuideSemanticConstraint[];
  };
  detailContext: {
    stepDetails: ExecutionGuideStepDetail[];
    branchHints: ExecutionGuideBranchHint[];
    resolutionNotes: string[];
    unresolvedQuestions: ExecutionGuideUnresolvedQuestion[];
  };
}
