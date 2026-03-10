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
export type ClarificationPriority = "P0" | "P1";
export type ExecutionGuideStatus = "draft" | "needs_clarification" | "ready_for_replay" | "rejected";
export type ExecutionGuideStepRole =
  | "default"
  | "branch_point"
  | "loop"
  | "submit_point"
  | "verification_point"
  | "optional_observed_action";
export type SemanticCoreFieldKey = "task_intent" | "scope" | "completion_criteria" | "final_action";
export type SemanticDraftFieldStatus = "unresolved" | "resolved";
export type FrozenSemanticFieldStatus = "frozen" | "unresolved";

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

export interface SemanticCoreFieldDraft {
  hypothesis: string;
  status: SemanticDraftFieldStatus;
  confidence: SemanticConfidence;
  evidenceRefs: string[];
}

export interface SemanticSupportingHypotheses {
  selection: string[];
  skip: string[];
  branch: string[];
}

export interface SemanticClarificationRequirement {
  questionId: string;
  field: SemanticCoreFieldKey;
  priority: ClarificationPriority;
  blocking: boolean;
  prompt: string;
  reason: string;
  evidenceRefs: string[];
  resolutionRuleId: string;
}

export interface SemanticIntentDraft {
  schemaVersion: "semantic_intent_draft.v2";
  coreFields: Record<SemanticCoreFieldKey, SemanticCoreFieldDraft>;
  supportingHypotheses: SemanticSupportingHypotheses;
  actionPurposeHypotheses: SemanticPurposeHypothesis[];
  noiseObservations: string[];
  clarificationRequirements: SemanticClarificationRequirement[];
  blockingUncertainties: SemanticUncertainty[];
  nonBlockingUncertainties: SemanticUncertainty[];
}

export interface ClarificationQuestionContext {
  workflowSummary: string[];
  observedLoopSummary?: string;
  candidateActionSummary?: string;
  evidenceRefs: string[];
}

export interface ClarificationQuestionV2 {
  questionId: string;
  field: SemanticCoreFieldKey;
  prompt: string;
  priority: ClarificationPriority;
  blocking: boolean;
  reason: string;
  evidenceRefs: string[];
  questionContext: ClarificationQuestionContext;
}

export interface ClarificationQuestionsV2 {
  schemaVersion: "clarification_questions.v2";
  source: "semantic_intent_draft.clarificationRequirements";
  questions: ClarificationQuestionV2[];
}

export interface FrozenSemanticField {
  value?: string;
  status: FrozenSemanticFieldStatus;
  source: "user_answer" | "semantic_hypothesis" | "default_guardrail";
  derivedFromQuestionId?: string;
  evidenceRefs: string[];
}

export interface FrozenSemanticIntentV1 {
  schemaVersion: "frozen_semantic_intent.v1";
  coreFields: Record<SemanticCoreFieldKey, FrozenSemanticField>;
  supportingHypotheses: SemanticSupportingHypotheses;
  actionPurposeHypotheses: SemanticPurposeHypothesis[];
  noiseObservations: string[];
  frozenFrom: {
    semanticIntentDraft: "semantic_intent_draft.json";
    intentResolution: "intent_resolution.json" | null;
  };
  remainingUnresolved: SemanticCoreFieldKey[];
  compileEligibility: {
    eligible: boolean;
    reason: string;
  };
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
