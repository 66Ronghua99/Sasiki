/**
 * Deps: core/semantic-compactor.ts, domain/sop-compact-artifacts-v1.ts, domain/sop-compact-artifacts.ts
 * Used By: runtime/sop-compact.ts
 * Last Updated: 2026-03-08
 */
import {
  SemanticCompactor,
  type SemanticMode,
  type SemanticIntentDraftOutput,
} from "../core/semantic-compactor.js";
import type { ObservedExamples } from "../domain/sop-compact-artifacts.js";
import type {
  BehaviorWorkflow,
  BehaviorEvidence,
  SemanticIntentDraft,
  SemanticPurposeHypothesis,
  SemanticUncertainty,
  ClarificationPriority,
  ClarificationQuestionV1,
  ClarificationQuestionsV1,
} from "../domain/sop-compact-artifacts-v1.js";
import type { SopCompactSemanticOptions } from "./sop-semantic-runner.js";

export interface SemanticIntentDraftRunInput {
  runId: string;
  traceId: string;
  rawTask: string;
  behaviorEvidence: BehaviorEvidence;
  behaviorWorkflow: BehaviorWorkflow;
  observedExamples: ObservedExamples;
}

export interface SemanticIntentDraftOutcome {
  mode: SemanticMode;
  fallback: boolean;
  draft?: SemanticIntentDraft;
  clarificationQuestions?: ClarificationQuestionsV1;
  rawText?: string;
  error?: string;
  model?: string;
  provider?: string;
  stopReason?: string;
}

export class SopSemanticIntentRunner {
  private readonly options: SopCompactSemanticOptions;

  constructor(options: SopCompactSemanticOptions) {
    this.options = options;
  }

  async run(input: SemanticIntentDraftRunInput): Promise<SemanticIntentDraftOutcome> {
    const mode = this.options.mode;
    if (mode === "off") {
      return { mode, fallback: true, error: "semantic intent drafting disabled by semantic mode off" };
    }

    try {
      const compactor = new SemanticCompactor({
        model: this.options.model,
        apiKey: this.options.apiKey,
        baseUrl: this.options.baseUrl,
        timeoutMs: this.options.timeoutMs,
        thinkingLevel: this.options.thinkingLevel,
      });
      const result = await compactor.draftSemanticIntent({
        runId: input.runId,
        traceId: input.traceId,
        rawTask: input.rawTask,
        behaviorEvidence: input.behaviorEvidence,
        behaviorWorkflow: input.behaviorWorkflow,
        observedExamples: input.observedExamples,
      });
      const normalized = this.normalizeResult(result, input);
      return {
        mode,
        fallback: false,
        draft: normalized.draft,
        clarificationQuestions: normalized.clarificationQuestions,
        rawText: result.rawText,
        model: result.model,
        provider: result.provider,
        stopReason: result.stopReason,
      };
    } catch (error) {
      return {
        mode,
        fallback: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private normalizeResult(
    result: SemanticIntentDraftOutput,
    input: SemanticIntentDraftRunInput
  ): {
    draft: SemanticIntentDraft;
    clarificationQuestions?: ClarificationQuestionsV1;
  } {
    const payload = result.payload;
    const blockingUncertainties = this.normalizeUncertainties(payload.blockingUncertainties);
    const nonBlockingUncertainties = this.normalizeUncertainties(payload.nonBlockingUncertainties);

    const scopeHypothesis = this.readString(payload.scopeHypothesis) ?? "";
    const completionHypothesis = this.readString(payload.completionHypothesis) ?? "";

    if (!scopeHypothesis) {
      blockingUncertainties.push({
        field: "scopeHypothesis",
        severity: "high",
        reason: "scope hypothesis missing from semantic intent draft",
      });
    }
    if (!completionHypothesis) {
      blockingUncertainties.push({
        field: "completionHypothesis",
        severity: "high",
        reason: "completion hypothesis missing from semantic intent draft",
      });
    }

    const draft: SemanticIntentDraft = {
      schemaVersion: "semantic_intent_draft.v1",
      taskIntentHypothesis: this.readString(payload.taskIntentHypothesis) ?? input.rawTask,
      scopeHypothesis,
      completionHypothesis,
      actionPurposeHypotheses: this.normalizePurposeHypotheses(payload.actionPurposeHypotheses, input.behaviorWorkflow),
      selectionHypotheses: this.readStringArray(payload.selectionHypotheses),
      skipHypotheses: this.readStringArray(payload.skipHypotheses),
      blockingUncertainties: this.deduplicateUncertainties(blockingUncertainties),
      nonBlockingUncertainties: this.deduplicateUncertainties(nonBlockingUncertainties),
    };
    const clarificationQuestions = this.normalizeClarificationQuestions(
      payload.clarificationQuestions,
      draft.blockingUncertainties
    );
    return {
      draft,
      clarificationQuestions:
        clarificationQuestions.length > 0
          ? {
              schemaVersion: "clarification_questions.v1",
              questions: clarificationQuestions,
            }
          : undefined,
    };
  }

  private normalizePurposeHypotheses(
    value: unknown,
    behaviorWorkflow: BehaviorWorkflow
  ): SemanticPurposeHypothesis[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const validStepIds = new Set(behaviorWorkflow.steps.map((step) => step.id));
    return value
      .map((item, index) => {
        if (typeof item === "string") {
          return {
            stepId: behaviorWorkflow.steps[index]?.id ?? "unknown_step",
            purpose: item.trim(),
            confidence: "low" as const,
            evidenceRefs: [],
          };
        }
        if (!item || typeof item !== "object") {
          return null;
        }
        const record = item as Record<string, unknown>;
        const stepId = this.readString(record.stepId) ?? behaviorWorkflow.steps[index]?.id ?? "unknown_step";
        const purpose = this.readString(record.purpose);
        if (!purpose) {
          return null;
        }
        return {
          stepId: validStepIds.has(stepId) ? stepId : behaviorWorkflow.steps[index]?.id ?? "unknown_step",
          purpose,
          confidence: this.readConfidence(record.confidence),
          evidenceRefs: this.readStringArray(record.evidenceRefs),
        };
      })
      .filter((item): item is SemanticPurposeHypothesis => Boolean(item));
  }

  private normalizeUncertainties(value: unknown): SemanticUncertainty[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => {
        if (typeof item === "string") {
          return {
            field: item.trim(),
            severity: "medium" as const,
            reason: "semantic draft returned string-only uncertainty",
          };
        }
        if (!item || typeof item !== "object") {
          return null;
        }
        const record = item as Record<string, unknown>;
        const field = this.readString(record.field);
        const reason = this.readString(record.reason);
        if (!field || !reason) {
          return null;
        }
        return {
          field,
          severity: this.readSeverity(record.severity),
          reason,
        };
      })
      .filter((item): item is SemanticUncertainty => Boolean(item));
  }

  private deduplicateUncertainties(items: SemanticUncertainty[]): SemanticUncertainty[] {
    const seen = new Set<string>();
    const deduped: SemanticUncertainty[] = [];
    for (const item of items) {
      const key = `${item.field}::${item.severity}::${item.reason}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(item);
    }
    return deduped;
  }

  private normalizeClarificationQuestions(
    value: unknown,
    blockingUncertainties: SemanticUncertainty[]
  ): ClarificationQuestionV1[] {
    const rows = Array.isArray(value)
      ? value
      : value && typeof value === "object" && Array.isArray((value as { questions?: unknown[] }).questions)
        ? (value as { questions: unknown[] }).questions
        : [];
    if (rows.length === 0) {
      return [];
    }
    const blockingFieldSeverity = new Map<string, SemanticUncertainty["severity"]>();
    for (const uncertainty of blockingUncertainties) {
      if (!blockingFieldSeverity.has(uncertainty.field)) {
        blockingFieldSeverity.set(uncertainty.field, uncertainty.severity);
      }
    }
    const questions: ClarificationQuestionV1[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const record = row as Record<string, unknown>;
      const targetsSemanticField =
        this.readString(record.targetsSemanticField) ??
        this.readString(record.targetsField) ??
        this.readString(record.field);
      const question = this.readString(record.question);
      if (!targetsSemanticField || !question || !blockingFieldSeverity.has(targetsSemanticField)) {
        continue;
      }
      const key = `${targetsSemanticField}::${question}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      questions.push({
        id: this.readString(record.id) ?? `q_${questions.length + 1}`,
        targetsSemanticField,
        question,
        priority: this.readPriority(record.priority, blockingFieldSeverity.get(targetsSemanticField) ?? "medium"),
      });
    }
    return questions;
  }

  private readString(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private readConfidence(value: unknown): "high" | "medium" | "low" {
    return value === "high" || value === "medium" || value === "low" ? value : "medium";
  }

  private readSeverity(value: unknown): "high" | "medium" | "low" {
    return value === "high" || value === "medium" || value === "low" ? value : "medium";
  }

  private readPriority(
    value: unknown,
    fallbackSeverity: SemanticUncertainty["severity"]
  ): ClarificationPriority {
    if (value === "high" || value === "medium") {
      return value;
    }
    return fallbackSeverity === "high" ? "high" : "medium";
  }
}
