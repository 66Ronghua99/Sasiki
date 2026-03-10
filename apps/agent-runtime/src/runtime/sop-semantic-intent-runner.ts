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
  ClarificationQuestionsV2,
  SemanticClarificationRequirement,
  SemanticCoreFieldDraft,
  SemanticCoreFieldKey,
  SemanticSupportingHypotheses,
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
  clarificationQuestions?: ClarificationQuestionsV2;
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
      return {
        mode,
        fallback: true,
        draft: this.buildDeterministicFallbackDraft(input),
        error: "semantic intent drafting disabled by semantic mode off",
      };
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
        draft: this.buildDeterministicFallbackDraft(input),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private normalizeResult(
    result: SemanticIntentDraftOutput,
    input: SemanticIntentDraftRunInput
  ): {
    draft: SemanticIntentDraft;
    clarificationQuestions?: ClarificationQuestionsV2;
  } {
    const payload = result.payload;
    const v2CoreFields = this.normalizeCoreFields(payload, input);
    const supportingHypotheses = this.normalizeSupportingHypotheses(payload, input.behaviorWorkflow);
    const blockingUncertainties = this.normalizeBlockingUncertainties(payload, v2CoreFields);
    const nonBlockingUncertainties = this.normalizeNonBlockingUncertainties(payload, input.behaviorWorkflow);
    const clarificationRequirements = this.normalizeClarificationRequirements(payload, v2CoreFields, blockingUncertainties);

    const draft: SemanticIntentDraft = {
      schemaVersion: "semantic_intent_draft.v2",
      coreFields: v2CoreFields,
      supportingHypotheses,
      actionPurposeHypotheses: this.buildConservativePurposeHypotheses(input.behaviorWorkflow),
      noiseObservations: [],
      clarificationRequirements,
      blockingUncertainties,
      nonBlockingUncertainties,
    };
    return {
      draft,
    };
  }

  private buildDeterministicFallbackDraft(input: SemanticIntentDraftRunInput): SemanticIntentDraft {
    return this.normalizeResult(
      {
        payload: {},
        rawText: "",
        model: "deterministic-fallback",
        provider: "rule",
        stopReason: "fallback",
      },
      input
    ).draft;
  }

  private normalizeCoreFields(
    _payload: Record<string, unknown>,
    input: SemanticIntentDraftRunInput
  ): Record<SemanticCoreFieldKey, SemanticCoreFieldDraft> {
    return {
      task_intent: this.buildCoreFieldDraft(
        this.defaultTaskIntentHypothesis(input.behaviorWorkflow, input.rawTask),
        this.defaultEvidenceRefs(input.behaviorWorkflow, ["locate_candidate", "iterate_collection", "inspect_state"]),
      ),
      scope: this.buildCoreFieldDraft(
        this.defaultScopeHypothesis(input.behaviorWorkflow),
        this.defaultEvidenceRefs(input.behaviorWorkflow, ["open_surface", "locate_candidate", "iterate_collection"]),
      ),
      completion_criteria: this.buildCoreFieldDraft(
        this.defaultCompletionHypothesis(input.behaviorWorkflow),
        this.defaultEvidenceRefs(input.behaviorWorkflow, ["iterate_collection", "submit_action", "verify_outcome"]),
      ),
      final_action: this.buildCoreFieldDraft(
        this.defaultFinalActionHypothesis(input.behaviorWorkflow),
        this.defaultEvidenceRefs(input.behaviorWorkflow, ["submit_action", "inspect_state", "iterate_collection"]),
      ),
    };
  }

  private buildCoreFieldDraft(hypothesis: string, evidenceRefs: string[]): SemanticCoreFieldDraft {
    return {
      hypothesis,
      status: "unresolved",
      confidence: "medium",
      evidenceRefs,
    };
  }

  private normalizeSupportingHypotheses(
    payload: Record<string, unknown>,
    behaviorWorkflow: BehaviorWorkflow
  ): SemanticSupportingHypotheses {
    const selection =
      this.readNestedStringArray(payload, ["supportingHypotheses", "selection"]) ??
      this.readStringArray(payload.selectionHypotheses);
    const skip =
      this.readNestedStringArray(payload, ["supportingHypotheses", "skip"]) ?? this.readStringArray(payload.skipHypotheses);
    const branch =
      this.readNestedStringArray(payload, ["supportingHypotheses", "branch"]) ??
      this.defaultBranchHypotheses(behaviorWorkflow);
    return {
      selection,
      skip,
      branch,
    };
  }

  private normalizeBlockingUncertainties(
    _payload: Record<string, unknown>,
    coreFields: Record<SemanticCoreFieldKey, SemanticCoreFieldDraft>
  ): SemanticUncertainty[] {
    const byField = new Map<SemanticCoreFieldKey, SemanticUncertainty>();
    for (const field of Object.keys(coreFields) as SemanticCoreFieldKey[]) {
      byField.set(field, {
        field,
        severity: field === "final_action" ? "medium" : "high",
        reason: this.defaultBlockingReason(field),
      });
    }
    return Array.from(byField.values());
  }

  private normalizeNonBlockingUncertainties(
    payload: Record<string, unknown>,
    behaviorWorkflow: BehaviorWorkflow
  ): SemanticUncertainty[] {
    const normalized = this.normalizeUncertainties(payload.nonBlockingUncertainties)
      .map((item) => ({
        ...item,
        field: this.normalizeCoreFieldKey(item.field) ?? item.field,
      }))
      .filter((item) => !this.isCoreFieldKey(item.field));
    if (behaviorWorkflow.branchPoints.length === 0) {
      return this.deduplicateUncertainties(normalized);
    }
    return this.deduplicateUncertainties([
      ...normalized,
      {
        field: "branch_supporting_hypothesis",
        severity: "low",
        reason: "当前行为骨架包含上下文切换或分流，分支规则仍需在后续澄清中确认。",
      },
    ]);
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

  private normalizeClarificationRequirements(
    _payload: Record<string, unknown>,
    coreFields: Record<SemanticCoreFieldKey, SemanticCoreFieldDraft>,
    blockingUncertainties: SemanticUncertainty[]
  ): SemanticClarificationRequirement[] {
    const byField = new Map<SemanticCoreFieldKey, SemanticClarificationRequirement>();
    for (const field of Object.keys(coreFields) as SemanticCoreFieldKey[]) {
      if (byField.has(field)) {
        continue;
      }
      byField.set(field, {
        questionId: `q_${field}`,
        field,
        priority: field === "final_action" ? "P1" : "P0",
        blocking: true,
        prompt: this.defaultPrompt(field),
        reason: blockingUncertainties.find((item) => item.field === field)?.reason ?? this.defaultBlockingReason(field),
        evidenceRefs: coreFields[field].evidenceRefs,
        resolutionRuleId: `core_field_rule_${field}_v1`,
      });
    }
    return Array.from(byField.values());
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

  private buildConservativePurposeHypotheses(behaviorWorkflow: BehaviorWorkflow): SemanticPurposeHypothesis[] {
    return behaviorWorkflow.steps.map((step) => ({
      stepId: step.id,
      purpose: this.defaultPurpose(step.primitive),
      confidence: step.primitive === "submit_action" ? "low" : "medium",
      evidenceRefs: [...step.evidenceRefs],
    }));
  }

  private readString(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private readNestedStringArray(value: Record<string, unknown>, path: string[]): string[] | undefined {
    let current: unknown = value;
    for (const key of path) {
      if (!current || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }
    const rows = this.readStringArray(current);
    return rows.length > 0 ? rows : undefined;
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
    if (value === "P0" || value === "P1") {
      return value;
    }
    if (value === "high") {
      return "P0";
    }
    if (value === "medium") {
      return "P1";
    }
    return fallbackSeverity === "high" ? "P0" : "P1";
  }

  private normalizeCoreFieldKey(value: string | undefined): SemanticCoreFieldKey | undefined {
    switch (value) {
      case "task_intent":
      case "taskIntentHypothesis":
      case "target_identity":
        return "task_intent";
      case "scope":
      case "scopeHypothesis":
      case "target_scope":
      case "selection_criteria":
        return "scope";
      case "completion_criteria":
      case "completionHypothesis":
      case "done_criteria":
        return "completion_criteria";
      case "final_action":
      case "submit_requirement":
        return "final_action";
      default:
        return undefined;
    }
  }

  private isCoreFieldKey(value: string): value is SemanticCoreFieldKey {
    return value === "task_intent" || value === "scope" || value === "completion_criteria" || value === "final_action";
  }

  private readCoreFieldHypothesis(
    payload: Record<string, unknown>,
    field: SemanticCoreFieldKey
  ): string | undefined {
    const coreFields = payload.coreFields;
    if (coreFields && typeof coreFields === "object") {
      const record = (coreFields as Record<string, unknown>)[field];
      if (record && typeof record === "object") {
        const hypothesis = this.readString((record as Record<string, unknown>).hypothesis);
        if (hypothesis) {
          return hypothesis;
        }
      }
    }
    switch (field) {
      case "task_intent":
        return undefined;
      case "scope":
        return undefined;
      case "completion_criteria":
        return undefined;
      case "final_action":
        return undefined;
    }
  }

  private defaultTaskIntentHypothesis(behaviorWorkflow: BehaviorWorkflow, rawTask: string): string {
    const taskHint = rawTask.trim();
    if (behaviorWorkflow.observedLoops.length > 0) {
      return taskHint
        ? `用户可能想围绕“${taskHint}”定位目标对象并浏览多个相关内容项，具体最终任务意图仍需用户确认。`
        : "用户可能想先定位目标对象，再浏览多个相关内容项，具体最终任务意图仍需用户确认。";
    }
    return taskHint
      ? `用户可能想在当前工作区执行与“${taskHint}”相关的对象定位与检查流程，具体任务目标仍需确认。`
      : "用户可能想在当前工作区执行一段对象定位与检查流程，具体任务目标仍需确认。";
  }

  private defaultScopeHypothesis(behaviorWorkflow: BehaviorWorkflow): string {
    if (behaviorWorkflow.observedLoops.length > 0) {
      return "范围可能涉及进入目标工作区后浏览多个候选对象或内容项，但具体边界仍需用户确认。";
    }
    return "范围可能局限于当前工作区中的单个目标对象，但是否需要扩展到多个候选对象仍需确认。";
  }

  private defaultCompletionHypothesis(behaviorWorkflow: BehaviorWorkflow): string {
    if (behaviorWorkflow.submitPoints.length > 0 || behaviorWorkflow.verificationPoints.length > 0) {
      return "完成条件可能与浏览流程结束及一次对象状态变化有关，但具体什么结果算完成仍需用户确认。";
    }
    return "完成条件可能与完成对象浏览或检查有关，但具体停止条件仍需用户确认。";
  }

  private defaultFinalActionHypothesis(behaviorWorkflow: BehaviorWorkflow): string {
    if (behaviorWorkflow.submitPoints.length > 0) {
      return "当前示教中观察到一次可能改变对象状态的动作，但其具体业务语义仍需用户确认。";
    }
    return "当前示教主要体现浏览与检查流程，是否需要最终对象动作仍需用户确认。";
  }

  private defaultEvidenceRefs(
    behaviorWorkflow: BehaviorWorkflow,
    primitives: Array<BehaviorWorkflow["steps"][number]["primitive"]>
  ): string[] {
    return behaviorWorkflow.steps
      .filter((step) => primitives.includes(step.primitive))
      .flatMap((step) => step.evidenceRefs)
      .slice(0, 4);
  }

  private defaultBranchHypotheses(behaviorWorkflow: BehaviorWorkflow): string[] {
    if (behaviorWorkflow.branchPoints.length === 0) {
      return [];
    }
    return ["当出现候选对象分流或上下文切换时，仍应保持当前任务范围，不把单次示教入口当作固定规则。"];
  }

  private defaultBlockingReason(field: SemanticCoreFieldKey): string {
    switch (field) {
      case "task_intent":
        return "当前行为骨架只能说明存在对象定位与浏览流程，但真实任务目标仍未冻结。";
      case "scope":
        return "当前证据无法唯一确定对象范围是单个对象、当前主页，还是多个候选内容。";
      case "completion_criteria":
        return "当前证据无法唯一确定什么页面状态或业务结果才算真正完成。";
      case "final_action":
        return "当前 evidence 无法稳定判断最终对象动作的业务语义，仍需用户明确是否需要执行对象动作。";
    }
  }

  private defaultPrompt(field: SemanticCoreFieldKey): string {
    switch (field) {
      case "task_intent":
        return "你这次示教最终想完成的任务目标是什么？请用一句话说明对象和动作。";
      case "scope":
        return "这次任务的范围边界是什么？例如单个对象、目标主页中的多个帖子，还是搜索结果中的某个候选对象。";
      case "completion_criteria":
        return "什么页面状态或业务结果才算真正完成？请给出可观察的完成条件。";
      case "final_action":
        return "你最终希望执行的对象动作是什么？请明确是执行一次对象动作，还是仅浏览不操作。";
    }
  }

  private defaultPurpose(primitive: BehaviorWorkflow["steps"][number]["primitive"]): string {
    switch (primitive) {
      case "open_surface":
        return "进入本次示教的工作区或目标页面。";
      case "switch_context":
        return "切换到当前任务相关的上下文或标签页。";
      case "locate_candidate":
        return "根据搜索或输入线索定位候选对象。";
      case "iterate_collection":
        return "浏览或切换多个候选对象或内容项。";
      case "inspect_state":
        return "查看当前对象的详情或状态。";
      case "edit_content":
        return "编辑当前对象相关的输入内容。";
      case "submit_action":
        return "观察到一次可能改变对象状态的动作，具体业务语义待确认。";
      case "verify_outcome":
        return "回读页面结果或返回上一层继续流程。";
    }
  }
}
