/**
 * Deps: none
 * Used By: runtime/sop-compact.ts, runtime/sop-intent-abstraction-builder.ts, runtime/sop-semantic-intent-runner.ts
 * Last Updated: 2026-03-09
 */

export type RuleConfidence = "high" | "medium" | "low";
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

export interface ObservedExample {
  id: string;
  entityType: string;
  observedSignals: Record<string, string>;
  observedAction: Record<string, string>;
  exampleOnly: true;
}

export interface ObservedExamples {
  schemaVersion: "observed_examples.v1";
  examples: ObservedExample[];
  antiPromotionRules: string[];
}

export interface IntentResolution {
  schemaVersion: "intent_resolution.v0";
  resolvedFields: Record<string, boolean | string>;
  notes: string[];
  resolvedAt: string;
}

export interface CompactManifest {
  schemaVersion: "compact_manifest.v1";
  runId: string;
  status: CompactManifestStatus;
  artifacts: {
    abstractionInput: string;
    behaviorEvidence: string;
    behaviorWorkflow: string;
    semanticIntentDraft: string | null;
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
