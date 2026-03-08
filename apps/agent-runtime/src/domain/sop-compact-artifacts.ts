/**
 * Deps: none
 * Used By: runtime/sop-compact.ts, runtime/sop-intent-abstraction-builder.ts
 * Last Updated: 2026-03-08
 */

export type WorkflowStepKind =
  | "navigate"
  | "iterate_collection"
  | "filter"
  | "state_change"
  | "decision_gate"
  | "conditional_action"
  | "verification";

export type GoalType =
  | "single_object_update"
  | "collection_processing"
  | "search_and_select"
  | "form_submission"
  | "multi_step_transaction";

export type TargetEntity =
  | "conversation_thread"
  | "product"
  | "order"
  | "listing"
  | "form"
  | "generic_page_object";

export type RuleSource =
  | "intent_seed"
  | "inferred_from_trace"
  | "inferred_from_examples"
  | "human_clarified"
  | "default_rule"
  | "uncertain";

export type RuleConfidence = "high" | "medium" | "low";
export type UncertainSeverity = "high" | "medium" | "low";
export type ClarificationPriority = "high" | "medium";
export type CompactManifestStatus = "draft" | "needs_clarification" | "ready_for_replay" | "rejected";
export type EvidenceSignalKind =
  | "open_surface"
  | "switch_context"
  | "locate_object"
  | "iterate_collection"
  | "inspect_object"
  | "edit_content"
  | "submit_action"
  | "verify_outcome";

export interface AbstractionSignal {
  id: string;
  kind: EvidenceSignalKind;
  evidence: string[];
  confidence: RuleConfidence;
}

export interface ExampleCandidate {
  id: string;
  sourceStepIndex: number;
  type: "target_text" | "input_value" | "selector" | "text_hint";
  value: string;
}

export interface AbstractionInput {
  schemaVersion: "abstraction_input.v0";
  runId: string;
  traceId: string;
  site: string;
  surface: string;
  rawTask: string;
  highLevelSteps: string[];
  selectorHints: string[];
  actionSummary: Record<string, number>;
  phaseSignals: AbstractionSignal[];
  exampleCandidates: ExampleCandidate[];
  uncertaintyCues: string[];
}

export interface IntentSeed {
  schemaVersion: "intent_seed.v0";
  runId: string;
  rawTask: string;
  site: string;
  surface: string;
  capturedAt: string;
}

export interface WorkflowGuideStep {
  id: string;
  kind: WorkflowStepKind;
  summary: string;
}

export interface WorkflowGuide {
  schemaVersion: "workflow_guide.v0";
  taskName: string;
  goal: string;
  scope: {
    site: string;
    surface: string;
    targetCollection: string;
  };
  preconditions: string[];
  steps: WorkflowGuideStep[];
  completionSignals: string[];
}

export interface DecisionRuleEntry {
  id: string;
  rule?: string;
  condition?: string;
  action?: string;
  source: RuleSource;
  confidence: RuleConfidence;
}

export interface UncertainField {
  field: string;
  severity: UncertainSeverity;
  reason: string;
}

export interface DecisionModel {
  schemaVersion: "decision_model.v0";
  goalType: GoalType;
  targetEntity: TargetEntity;
  selectionRules: DecisionRuleEntry[];
  decisionRules: DecisionRuleEntry[];
  doneCriteria: DecisionRuleEntry[];
  uncertainFields: UncertainField[];
}

export interface ObservedExample {
  id: string;
  entityType: TargetEntity;
  observedSignals: Record<string, string>;
  observedAction: Record<string, string>;
  exampleOnly: true;
}

export interface ObservedExamples {
  schemaVersion: "observed_examples.v0";
  examples: ObservedExample[];
  antiPromotionRules: string[];
}

export interface ClarificationQuestion {
  id: string;
  topic: string;
  question: string;
  targetsField: string;
  priority: ClarificationPriority;
}

export interface ClarificationQuestions {
  schemaVersion: "clarification_questions.v0";
  questions: ClarificationQuestion[];
}

export interface IntentResolution {
  schemaVersion: "intent_resolution.v0";
  resolvedFields: Record<string, boolean | string>;
  notes: string[];
  resolvedAt: string;
}

export interface CompactManifest {
  schemaVersion: "compact_manifest.v0";
  runId: string;
  status: CompactManifestStatus;
  artifacts: {
    abstractionInput: string;
    workflowGuideJson: string;
    workflowGuideMd: string | null;
    decisionModel: string;
    observedExamples: string;
    clarificationQuestions: string | null;
    intentResolution: string | null;
    executionGuide: string;
  };
  quality: {
    highUncertaintyCount: number;
    mediumUncertaintyCount: number;
    lowUncertaintyCount: number;
    exampleCount: number;
    pollutionDetected: boolean;
  };
}

export interface ExecutionGuide {
  schemaVersion: "execution_guide.v0";
  runId: string;
  status: CompactManifestStatus;
  replayReady: boolean;
  goal: string;
  scope: WorkflowGuide["scope"] & {
    goalType: GoalType;
    targetEntity: TargetEntity;
  };
  workflow: WorkflowGuideStep[];
  decisionRules: DecisionRuleEntry[];
  doneCriteria: DecisionRuleEntry[];
  allowedAssumptions: string[];
  forbiddenOverfittingCues: string[];
  unresolvedUncertainties: UncertainField[];
}
