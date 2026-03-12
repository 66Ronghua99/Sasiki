/**
 * Deps: domain/compact-reasoning.ts, runtime/replay-refinement/refinement-memory-store.ts
 * Used By: runtime/replay-refinement/online-refinement-orchestrator.ts
 * Last Updated: 2026-03-12
 */
import type { CompactCapabilityOutput } from "../../domain/compact-reasoning.js";
import type { PromotedKnowledgeRecord } from "./refinement-memory-store.js";

export const DEFAULT_CORE_CONSUMPTION_TOKEN_BUDGET = 1000;
export const CORE_CONSUMPTION_ESTIMATOR_VERSION = "char_div_4.v0" as const;

const DEFAULT_CAPABILITY_SUMMARY_MIN_CHARS = 160;
const DEFAULT_CAPABILITY_SUMMARY_TRIM_STEP = 120;

export type CoreConsumptionBundleSource = "capability_only" | "capability_plus_knowledge";

export interface CoreConsumptionBundle {
  task: string;
  capabilitySummary: string;
  surfaceScopedKnowledge: string[];
  activeGuards: string[];
  negativeHints: string[];
  tokenBudget: number;
  tokenEstimate: number;
  estimatorVersion: typeof CORE_CONSUMPTION_ESTIMATOR_VERSION;
  snapshotRefs?: string[];
}

export interface CoreConsumptionCompileInput {
  task: string;
  capabilityOutput: CompactCapabilityOutput;
  tokenBudget?: number;
  snapshotRefs?: string[];
  knowledgeRecords?: PromotedKnowledgeRecord[];
}

export interface CoreConsumptionCompileResult {
  bundle: CoreConsumptionBundle;
  bundleSource: CoreConsumptionBundleSource;
  selectedKnowledgeIds: string[];
  budgetSatisfied: boolean;
}

export interface CoreConsumptionFilterOptions {
  defaultTokenBudget?: number;
  capabilitySummaryMinChars?: number;
  capabilitySummaryTrimStep?: number;
}

interface KnowledgeBundleItem {
  knowledgeId: string;
  instruction: string;
  knowledgeType: PromotedKnowledgeRecord["knowledgeType"];
  confidence: PromotedKnowledgeRecord["confidence"];
  status: PromotedKnowledgeRecord["status"];
  updatedAt: string;
}

interface BundleDraft {
  task: string;
  capabilitySummary: string;
  capabilityKnowledge: string[];
  promotedKnowledge: KnowledgeBundleItem[];
  activeGuards: string[];
  negativeHints: string[];
  tokenBudget: number;
  snapshotRefs?: string[];
}

interface TrimmedBundle {
  bundle: CoreConsumptionBundle;
  retainedPromotedKnowledge: KnowledgeBundleItem[];
  budgetSatisfied: boolean;
}

export class CoreConsumptionFilter {
  private readonly defaultTokenBudget: number;
  private readonly capabilitySummaryMinChars: number;
  private readonly capabilitySummaryTrimStep: number;

  constructor(options?: CoreConsumptionFilterOptions) {
    this.defaultTokenBudget = this.normalizeTokenBudget(options?.defaultTokenBudget);
    this.capabilitySummaryMinChars = this.normalizePositiveInt(
      options?.capabilitySummaryMinChars,
      DEFAULT_CAPABILITY_SUMMARY_MIN_CHARS
    );
    this.capabilitySummaryTrimStep = this.normalizePositiveInt(
      options?.capabilitySummaryTrimStep,
      DEFAULT_CAPABILITY_SUMMARY_TRIM_STEP
    );
  }

  compile(input: CoreConsumptionCompileInput): CoreConsumptionCompileResult {
    const records = this.readKnowledgeRecords(input.knowledgeRecords);
    if (records.length === 0) {
      return this.compileCapabilityOnly(input);
    }
    return this.compileCapabilityPlusKnowledge({
      ...input,
      knowledgeRecords: records,
    });
  }

  compileCapabilityOnly(input: Omit<CoreConsumptionCompileInput, "knowledgeRecords">): CoreConsumptionCompileResult {
    const tokenBudget = this.normalizeTokenBudget(input.tokenBudget);
    const draft = this.buildDraft({
      task: input.task,
      capabilityOutput: input.capabilityOutput,
      tokenBudget,
      snapshotRefs: input.snapshotRefs,
      knowledgeRecords: [],
    });
    const trimmed = this.trimByBudget(draft);
    return {
      bundle: trimmed.bundle,
      bundleSource: "capability_only",
      selectedKnowledgeIds: [],
      budgetSatisfied: trimmed.budgetSatisfied,
    };
  }

  compileCapabilityPlusKnowledge(
    input: CoreConsumptionCompileInput & { knowledgeRecords: PromotedKnowledgeRecord[] }
  ): CoreConsumptionCompileResult {
    const tokenBudget = this.normalizeTokenBudget(input.tokenBudget);
    const draft = this.buildDraft({
      task: input.task,
      capabilityOutput: input.capabilityOutput,
      tokenBudget,
      snapshotRefs: input.snapshotRefs,
      knowledgeRecords: input.knowledgeRecords,
    });
    const trimmed = this.trimByBudget(draft);
    return {
      bundle: trimmed.bundle,
      bundleSource: "capability_plus_knowledge",
      selectedKnowledgeIds: trimmed.retainedPromotedKnowledge.map((item) => item.knowledgeId),
      budgetSatisfied: trimmed.budgetSatisfied,
    };
  }

  private buildDraft(input: {
    task: string;
    capabilityOutput: CompactCapabilityOutput;
    tokenBudget: number;
    snapshotRefs?: string[];
    knowledgeRecords: PromotedKnowledgeRecord[];
  }): BundleDraft {
    const task = input.task.trim();
    const capabilitySummary = this.buildCapabilitySummary(task, input.capabilityOutput);
    const capabilityKnowledge = this.uniqueNonEmptyStrings([
      ...input.capabilityOutput.actionPolicy.requiredActions,
      ...input.capabilityOutput.actionPolicy.conditionalActions,
    ]);
    const activeGuards = this.uniqueNonEmptyStrings([
      ...input.capabilityOutput.stopPolicy,
      ...input.capabilityOutput.reuseBoundary.notApplicableWhen,
    ]);
    const negativeHints = this.uniqueNonEmptyStrings(input.capabilityOutput.actionPolicy.nonCoreActions);

    const promotedKnowledge = input.knowledgeRecords
      .map((record) => this.toKnowledgeBundleItem(record))
      .filter((item): item is KnowledgeBundleItem => item !== null)
      .sort((left, right) => this.compareKnowledgePriority(left, right));

    return {
      task,
      capabilitySummary,
      capabilityKnowledge,
      promotedKnowledge,
      activeGuards,
      negativeHints,
      tokenBudget: input.tokenBudget,
      snapshotRefs: input.snapshotRefs,
    };
  }

  private trimByBudget(draft: BundleDraft): TrimmedBundle {
    const working: BundleDraft = {
      task: draft.task,
      capabilitySummary: draft.capabilitySummary,
      capabilityKnowledge: [...draft.capabilityKnowledge],
      promotedKnowledge: [...draft.promotedKnowledge],
      activeGuards: [...draft.activeGuards],
      negativeHints: [...draft.negativeHints],
      tokenBudget: draft.tokenBudget,
      snapshotRefs: draft.snapshotRefs ? [...draft.snapshotRefs] : undefined,
    };

    let estimate = this.estimateBundleTokens(this.toBundleWithoutEstimate(working));

    // Trim order 1: negative hints first.
    while (estimate > working.tokenBudget && working.negativeHints.length > 0) {
      working.negativeHints.pop();
      estimate = this.estimateBundleTokens(this.toBundleWithoutEstimate(working));
    }

    // Trim order 2: low-priority promoted knowledge (never drop completion_signal).
    if (estimate > working.tokenBudget && working.promotedKnowledge.length > 0) {
      const removableIds = working.promotedKnowledge
        .filter((item) => this.isLowPriorityKnowledge(item) && !this.isTrimProtectedKnowledge(item))
        .sort((left, right) => this.compareLowPriorityForTrim(left, right))
        .map((item) => item.knowledgeId);
      for (const knowledgeId of removableIds) {
        if (estimate <= working.tokenBudget) {
          break;
        }
        const index = working.promotedKnowledge.findIndex((item) => item.knowledgeId === knowledgeId);
        if (index === -1) {
          continue;
        }
        working.promotedKnowledge.splice(index, 1);
        estimate = this.estimateBundleTokens(this.toBundleWithoutEstimate(working));
      }
    }

    // Trim order 3: capability summary tail.
    while (estimate > working.tokenBudget && working.capabilitySummary.length > this.capabilitySummaryMinChars) {
      const nextSummary = this.trimTail(
        working.capabilitySummary,
        this.capabilitySummaryTrimStep,
        this.capabilitySummaryMinChars
      );
      if (nextSummary.length >= working.capabilitySummary.length) {
        break;
      }
      working.capabilitySummary = nextSummary;
      estimate = this.estimateBundleTokens(this.toBundleWithoutEstimate(working));
    }

    return {
      bundle: {
        ...this.toBundleWithoutEstimate(working),
        tokenEstimate: estimate,
        estimatorVersion: CORE_CONSUMPTION_ESTIMATOR_VERSION,
      },
      retainedPromotedKnowledge: working.promotedKnowledge,
      budgetSatisfied: estimate <= working.tokenBudget,
    };
  }

  private toBundleWithoutEstimate(working: BundleDraft): Omit<CoreConsumptionBundle, "tokenEstimate" | "estimatorVersion"> {
    const surfaceScopedKnowledge = this.uniqueNonEmptyStrings([
      ...working.capabilityKnowledge,
      ...working.promotedKnowledge.map((item) => item.instruction),
    ]);
    const snapshotRefs = working.snapshotRefs ? this.uniqueNonEmptyStrings(working.snapshotRefs) : undefined;
    return {
      task: working.task,
      capabilitySummary: working.capabilitySummary,
      surfaceScopedKnowledge,
      activeGuards: [...working.activeGuards],
      negativeHints: [...working.negativeHints],
      tokenBudget: working.tokenBudget,
      snapshotRefs: snapshotRefs && snapshotRefs.length > 0 ? snapshotRefs : undefined,
    };
  }

  private buildCapabilitySummary(task: string, capability: CompactCapabilityOutput): string {
    const workflow = capability.workflowSkeleton.join(" -> ");
    const decisionStrategy = capability.decisionStrategy.join("; ");
    const sections = this.uniqueNonEmptyStrings([
      task ? `Task: ${task}` : "",
      capability.taskUnderstanding,
      workflow ? `Workflow: ${workflow}` : "",
      decisionStrategy ? `Decision strategy: ${decisionStrategy}` : "",
    ]);
    return sections.join(" ");
  }

  private toKnowledgeBundleItem(record: PromotedKnowledgeRecord): KnowledgeBundleItem | null {
    const instruction = record.instruction.trim();
    if (!instruction) {
      return null;
    }
    return {
      knowledgeId: record.knowledgeId,
      instruction,
      knowledgeType: record.knowledgeType,
      confidence: record.confidence,
      status: record.status,
      updatedAt: record.updatedAt,
    };
  }

  private readKnowledgeRecords(records: PromotedKnowledgeRecord[] | undefined): PromotedKnowledgeRecord[] {
    if (!Array.isArray(records) || records.length === 0) {
      return [];
    }
    return records.filter(
      (record) =>
        Boolean(
          record &&
            typeof record.knowledgeId === "string" &&
            record.knowledgeId.trim() &&
            record.status === "active",
        ),
    );
  }

  private compareKnowledgePriority(left: KnowledgeBundleItem, right: KnowledgeBundleItem): number {
    const priorityDelta = this.knowledgePriority(right) - this.knowledgePriority(left);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  }

  private compareLowPriorityForTrim(left: KnowledgeBundleItem, right: KnowledgeBundleItem): number {
    const priorityDelta = this.knowledgePriority(left) - this.knowledgePriority(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return left.updatedAt.localeCompare(right.updatedAt);
  }

  private knowledgePriority(item: KnowledgeBundleItem): number {
    const statusBase = item.status === "active" ? 100 : item.status === "held" ? 60 : 20;
    const confidenceBase = item.confidence === "high" ? 30 : item.confidence === "medium" ? 20 : 10;
    const typeBase = item.knowledgeType === "completion_signal" ? 20 : item.knowledgeType === "branch_guard" ? 10 : 0;
    return statusBase + confidenceBase + typeBase;
  }

  private isLowPriorityKnowledge(item: KnowledgeBundleItem): boolean {
    if (item.status !== "active") {
      return true;
    }
    if (item.confidence === "low") {
      return true;
    }
    return item.knowledgeType === "noise_pattern";
  }

  private isTrimProtectedKnowledge(item: KnowledgeBundleItem): boolean {
    return item.knowledgeType === "completion_signal";
  }

  private trimTail(value: string, trimStep: number, minChars: number): string {
    if (value.length <= minChars) {
      return value;
    }
    const target = Math.max(minChars, value.length - trimStep);
    const trimmed = value.slice(0, target).trimEnd();
    if (!trimmed) {
      return value.slice(0, minChars).trimEnd();
    }
    if (trimmed.length <= minChars) {
      return trimmed;
    }
    return trimmed.endsWith("...") ? trimmed : `${trimmed}...`;
  }

  private estimateBundleTokens(bundle: Omit<CoreConsumptionBundle, "tokenEstimate" | "estimatorVersion">): number {
    const chars = JSON.stringify(bundle).length;
    return Math.max(1, Math.ceil(chars / 4));
  }

  private uniqueNonEmptyStrings(values: string[]): string[] {
    const output: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
      if (typeof value !== "string") {
        continue;
      }
      const normalized = value.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      output.push(normalized);
      seen.add(normalized);
    }
    return output;
  }

  private normalizeTokenBudget(value: number | undefined): number {
    return this.normalizePositiveInt(value, this.defaultTokenBudget || DEFAULT_CORE_CONSUMPTION_TOKEN_BUDGET);
  }

  private normalizePositiveInt(value: number | undefined, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return Math.max(1, Math.floor(fallback));
    }
    return Math.max(1, Math.floor(value));
  }
}
