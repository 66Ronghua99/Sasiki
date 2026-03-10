/**
 * Deps: @mariozechner/pi-ai, core/model-resolver.ts
 * Used By: runtime/sop-semantic-runner.ts, runtime/sop-semantic-intent-runner.ts
 * Last Updated: 2026-03-09
 */
import { completeSimple, type ThinkingLevel } from "@mariozechner/pi-ai";

import { ModelResolver } from "./model-resolver.js";

export type SemanticMode = "off" | "auto" | "on";
export type SemanticThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface SemanticCompactorConfig {
  model: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs: number;
  thinkingLevel: SemanticThinkingLevel;
}

export interface SemanticCompactionInput {
  runId: string;
  traceId: string;
  site: string;
  taskHint: string;
  highLevelSteps: string[];
  hints: string[];
}

export interface SemanticCompactionOutput {
  markdown: string;
  model: string;
  provider: string;
  stopReason: string;
}

export interface SemanticIntentDraftInput {
  runId: string;
  traceId: string;
  rawTask: string;
  behaviorEvidence: unknown;
  behaviorWorkflow: unknown;
  observedExamples: unknown;
}

export interface SemanticIntentDraftOutput {
  payload: Record<string, unknown>;
  rawText: string;
  model: string;
  provider: string;
  stopReason: string;
}

const SEMANTIC_SYSTEM_PROMPT = [
  "You are a SOP semantic editor for browser workflows.",
  "Rewrite noisy action steps into a concise, executable guide.",
  "## Goal",
  "## Steps",
  "## Fallback",
  "Keep steps action-oriented and deterministic. Avoid introducing new actions not present in input.",
].join("\n");

const SEMANTIC_INTENT_DRAFT_SYSTEM_PROMPT = [
  "You are a semantic intent inference engine for browser workflow demonstrations.",
  "Infer the most likely task semantics from one demonstration, but stay conservative and hypothesis-first.",
  "Use behavior_workflow as the primary structure and use other evidence only as supporting clues.",
  "Do not produce a final replay-ready interpretation on the first pass; produce hypotheses and required questions instead.",
  "If semantics are unclear, express them as uncertainties instead of guessing.",
  "Do not promote examples into universal rules.",
  "Return one RFC8259 JSON object containing the semantic_intent_draft.v2 fields.",
  "All string values must stay on a single line and must not contain literal newlines.",
  "Do not wrap the JSON in markdown fences, comments, or trailing commas.",
].join("\n");

export class SemanticCompactor {
  private readonly config: SemanticCompactorConfig;

  constructor(config: SemanticCompactorConfig) {
    this.config = config;
  }

  async compact(input: SemanticCompactionInput): Promise<SemanticCompactionOutput> {
    const message = await this.complete(SEMANTIC_SYSTEM_PROMPT, this.buildMarkdownPrompt(input));
    const markdown = this.extractText(message.content);
    if (!markdown) {
      throw new Error(`semantic model returned empty text (stopReason=${message.stopReason})`);
    }
    return {
      markdown: `${markdown}\n`,
      model: message.model,
      provider: message.provider,
      stopReason: message.stopReason,
    };
  }

  async draftSemanticIntent(input: SemanticIntentDraftInput): Promise<SemanticIntentDraftOutput> {
    const message = await this.complete(SEMANTIC_INTENT_DRAFT_SYSTEM_PROMPT, this.buildSemanticIntentPrompt(input));
    const rawText = this.extractText(message.content);
    if (!rawText) {
      throw new Error(`semantic intent draft returned empty text (stopReason=${message.stopReason})`);
    }
    return {
      payload: this.extractJsonObject(rawText),
      rawText,
      model: message.model,
      provider: message.provider,
      stopReason: message.stopReason,
    };
  }

  private async complete(systemPrompt: string, userPrompt: string): Promise<{
    content: unknown[];
    model: string;
    provider: string;
    stopReason: string;
  }> {
    if (!this.config.apiKey.trim()) {
      throw new Error("semantic api key missing");
    }
    const model = ModelResolver.resolve({ model: this.config.model, baseUrl: this.config.baseUrl });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const message = await completeSimple(
        model,
        {
          systemPrompt,
          messages: [{ role: "user", timestamp: Date.now(), content: userPrompt }],
        },
        {
          apiKey: this.config.apiKey,
          signal: controller.signal,
          reasoning: this.toReasoningLevel(this.config.thinkingLevel),
        }
      );
      if (message.stopReason === "error" || message.stopReason === "aborted") {
        throw new Error(message.errorMessage ?? `semantic generation failed: ${message.stopReason}`);
      }
      return {
        content: message.content,
        model: model.id,
        provider: String(model.provider),
        stopReason: message.stopReason,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private buildMarkdownPrompt(input: SemanticCompactionInput): string {
    const steps = input.highLevelSteps.map((step, index) => `${index + 1}. ${step}`).join("\n");
    const hints = input.hints.length > 0 ? input.hints.map((hint) => `- ${hint}`).join("\n") : "- 无";
    return [
      "请基于以下 rule-based 压缩结果，生成更自然、可执行的 SOP guide。",
      "",
      `runId: ${input.runId}`,
      `traceId: ${input.traceId}`,
      `site: ${input.site}`,
      `taskHint: ${input.taskHint}`,
      "",
      "Noisy Steps:",
      steps || "1. 无",
      "",
      "Hints for Selectors:",
      hints,
      "",
      "要求：",
      "1) Goal 用一段话说明任务目标；",
      "2) Steps 保留关键顺序，并给出可解释的执行原因；",
      "3) Fallback 提供失败时替代目标；",
      "4) 不要输出代码块或 JSON，只输出 markdown 正文。",
    ].join("\n");
  }

  private buildSemanticIntentPrompt(input: SemanticIntentDraftInput): string {
    const behaviorEvidenceSummary = this.summarizeBehaviorEvidence(input.behaviorEvidence);
    const observedExamplesSummary = this.summarizeObservedExamples(input.observedExamples);
    return [
      "请基于以下行为证据和示例，为浏览器示教生成 semantic_intent_draft.v2。",
      "",
      `runId: ${input.runId}`,
      `traceId: ${input.traceId}`,
      `rawTask: ${input.rawTask}`,
      "",
      "工作协议：",
      "A) 优先把 behavior_workflow 当作主骨架，先总结对象定位、浏览、可能的对象动作，再决定 task/scope/completion/final_action 的假设；",
      "B) behavior_evidence 只作为支持线索或不确定性来源，不要逐条复述页面机械动作；",
      "C) observed_examples 只代表单次示教里的实例，不得直接提升为通用规则；",
      "D) 若证据不足，仍要给出最保守的 hypothesis，并把不稳定部分写入 uncertainties 与 clarificationRequirements；",
      "E) 所有字符串必须保持单行，禁止在 JSON 字符串里换行；",
      "",
      "输出要求：",
      "1) 只返回一个 JSON 对象；",
      "2) 只能输出以下字段：coreFields, supportingHypotheses, actionPurposeHypotheses, clarificationRequirements, blockingUncertainties, nonBlockingUncertainties；",
      "3) 不允许使用 goalType、targetEntity、domain enum 等封闭分类字段；",
      "4) coreFields 仅允许这四个 key：task_intent, scope, completion_criteria, final_action；每个 field 都必须包含 hypothesis/status/confidence/evidenceRefs；",
      "5) first pass 默认保持 unresolved，除非证据极强且无需用户补充；不要在 hypothesis 中直接下最终业务结论；",
      "6) actionPurposeHypotheses 必须引用 behavior_workflow 的 stepId，并带 evidenceRefs；尽量覆盖核心 workflow steps；",
      "7) 对无法稳定推出的业务用途、范围、完成条件，必须进入 uncertainties；",
      "8) clarificationRequirements 只针对阻塞 replay 的核心字段；",
      "9) clarificationRequirements 每项格式为 {\"questionId\":\"q_task_intent\",\"field\":\"task_intent\",\"priority\":\"P0|P1\",\"blocking\":true,\"prompt\":\"...\",\"reason\":\"...\",\"evidenceRefs\":[\"signal_1\"],\"resolutionRuleId\":\"core_field_rule_task_intent_v1\"}；",
      "10) supportingHypotheses 仅允许 {selection, skip, branch} 三个数组字段；",
      "11) 不允许把 observed_examples 的具体文本、用户名、选择器直接提升为通用规则；",
      "12) 严格输出合法 JSON：不要 markdown、不要注释、不要额外解释、不要尾逗号；",
      "",
      "期望 JSON 形状示例：",
      JSON.stringify(
        {
          coreFields: {
            task_intent: {
              hypothesis: "用户可能想先定位目标对象并浏览相关内容，最终任务意图仍需用户确认。",
              status: "unresolved",
              confidence: "medium",
              evidenceRefs: ["signal_2_locate_object", "signal_3_iterate_collection"],
            },
            scope: {
              hypothesis: "范围可能是进入目标工作区后浏览多个候选对象。",
              status: "unresolved",
              confidence: "medium",
              evidenceRefs: ["signal_1_open_surface", "signal_3_iterate_collection"],
            },
            completion_criteria: {
              hypothesis: "完成条件可能与完成浏览流程或一次对象状态变化有关。",
              status: "unresolved",
              confidence: "low",
              evidenceRefs: ["signal_4_submit_action", "signal_5_verify_outcome"],
            },
            final_action: {
              hypothesis: "当前示教可能包含一次对象动作，但具体业务语义仍需确认。",
              status: "unresolved",
              confidence: "low",
              evidenceRefs: ["signal_4_submit_action"],
            },
          },
          supportingHypotheses: {
            selection: ["优先处理当前流程中显式进入或打开的候选对象。"],
            skip: ["若对象已明显不在当前任务范围，可跳过继续浏览其他候选对象。"],
            branch: ["出现候选分流时，仍应保持当前任务范围，不把单次入口当作固定规则。"],
          },
          actionPurposeHypotheses: [
            {
              stepId: "behavior_step_3",
              purpose: "定位并逐个处理当前任务范围内的候选对象。",
              confidence: "medium",
              evidenceRefs: ["signal_3_iterate_collection"],
            },
          ],
          clarificationRequirements: [
            {
              questionId: "q_completion_criteria",
              field: "completion_criteria",
              priority: "P0",
              blocking: true,
              prompt: "什么页面状态或业务结果才算真正完成？",
              reason: "从当前行为证据中无法唯一确定什么状态才算完成。",
              evidenceRefs: ["signal_4_submit_action", "signal_5_verify_outcome"],
              resolutionRuleId: "core_field_rule_completion_criteria_v1",
            },
          ],
          blockingUncertainties: [
            {
              field: "completion_criteria",
              severity: "high",
              reason: "从当前行为证据中无法唯一确定什么状态才算完成。",
            },
          ],
          nonBlockingUncertainties: [
            {
              field: "branch_supporting_hypothesis",
              severity: "medium",
              reason: "选择范围仍依赖页面上下文补充。",
            },
          ],
        },
        null,
        2
      ),
      "",
      "Behavior Workflow JSON:",
      JSON.stringify(input.behaviorWorkflow, null, 2),
      "",
      "Behavior Evidence Summary JSON:",
      JSON.stringify(behaviorEvidenceSummary, null, 2),
      "",
      "Observed Examples JSON:",
      JSON.stringify(observedExamplesSummary, null, 2),
    ].join("\n");
  }

  private summarizeBehaviorEvidence(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object") {
      return {};
    }
    const record = value as Record<string, unknown>;
    const stepEvidence = Array.isArray(record.stepEvidence) ? record.stepEvidence : [];
    const prioritized = stepEvidence
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const step = item as Record<string, unknown>;
        const score =
          (typeof step.textHint === "string" && step.textHint.trim().length > 0 ? 2 : 0) +
          (typeof step.assertionHint === "string" && step.assertionHint.trim().length > 0 ? 2 : 0) +
          (typeof step.roleHint === "string" && step.roleHint.trim().length > 0 ? 1 : 0) +
          (typeof step.action === "string" && ["type", "click", "press", "navigate"].includes(step.action) ? 1 : 0);
        return { step, score };
      })
      .filter((item): item is { step: Record<string, unknown>; score: number } => Boolean(item))
      .sort((left, right) => right.score - left.score)
      .slice(0, 10)
      .map(({ step }) => this.summarizeStepEvidence(step));

    return {
      schemaVersion: record.schemaVersion,
      site: record.site,
      surface: record.surface,
      actionSummary: this.summarizeActionSummary(record.actionSummary),
      phaseSignals: Array.isArray(record.phaseSignals)
        ? record.phaseSignals
            .map((item) => this.summarizePhaseSignal(item))
            .filter((item): item is Record<string, unknown> => Boolean(item))
            .slice(0, 6)
        : [],
      exampleCandidates: Array.isArray(record.exampleCandidates)
        ? record.exampleCandidates
            .map((item) => this.summarizeExampleCandidate(item))
            .filter((item): item is Record<string, unknown> => Boolean(item))
            .slice(0, 4)
        : [],
      uncertaintyCues: Array.isArray(record.uncertaintyCues) ? record.uncertaintyCues.slice(0, 4) : [],
      stepEvidenceSample: prioritized,
      stepEvidenceTruncated: stepEvidence.length,
    };
  }

  private summarizeObservedExamples(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object") {
      return {};
    }
    const record = value as Record<string, unknown>;
    return {
      schemaVersion: record.schemaVersion,
      antiPromotionRules: Array.isArray(record.antiPromotionRules) ? record.antiPromotionRules.slice(0, 3) : [],
      examples: Array.isArray(record.examples)
        ? record.examples
            .map((item) => this.summarizeObservedExample(item))
            .filter((item): item is Record<string, unknown> => Boolean(item))
            .slice(0, 4)
        : [],
    };
  }

  private summarizeActionSummary(value: unknown): Record<string, number> {
    if (!value || typeof value !== "object") {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        ([, count]) => typeof count === "number" && Number.isFinite(count) && count > 0
      )
    ) as Record<string, number>;
  }

  private summarizePhaseSignal(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const summarizedEvidence = Array.isArray(record.evidence)
      ? record.evidence
          .map((item) => this.summarizeEvidenceToken(item))
          .filter((item): item is string => Boolean(item))
          .slice(0, 2)
      : [];
    return {
      id: this.normalizePromptText(record.id, 60),
      primitive: this.normalizePromptText(record.primitive, 60),
      confidence: this.normalizePromptText(record.confidence, 20),
      supportingClues: summarizedEvidence,
    };
  }

  private summarizeExampleCandidate(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const type = this.normalizePromptText(record.type, 40);
    const candidateValue = this.normalizePromptText(record.value, 80);
    if (!type || !candidateValue || type === "selector") {
      return undefined;
    }
    return {
      id: this.normalizePromptText(record.id, 40),
      sourceStepIndex: typeof record.sourceStepIndex === "number" ? record.sourceStepIndex : undefined,
      type,
      value: candidateValue,
    };
  }

  private summarizeStepEvidence(value: Record<string, unknown>): Record<string, unknown> {
    const targetType = this.normalizePromptText(value.targetType, 30);
    const summary: Record<string, unknown> = {
      stepIndex: typeof value.stepIndex === "number" ? value.stepIndex : undefined,
      action: this.normalizePromptText(value.action, 30),
      tabId: this.normalizePromptText(value.tabId, 30),
    };
    if (targetType && targetType !== "selector") {
      summary.targetType = targetType;
    }
    const textHint = this.normalizePromptText(value.textHint, 80);
    const assertionHint = this.normalizePromptText(value.assertionHint, 80);
    const roleHint = this.normalizePromptText(value.roleHint, 40);
    if (textHint) {
      summary.textHint = textHint;
    }
    if (assertionHint) {
      summary.assertionHint = assertionHint;
    }
    if (roleHint) {
      summary.roleHint = roleHint;
    }
    const targetValue = this.summarizeTargetValue(targetType, value.targetValue);
    if (targetValue) {
      summary.targetValue = targetValue;
    }
    return Object.fromEntries(Object.entries(summary).filter(([, item]) => item !== undefined));
  }

  private summarizeObservedExample(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const observedSignals =
      record.observedSignals && typeof record.observedSignals === "object"
        ? this.summarizeObservedSignals(record.observedSignals as Record<string, unknown>)
        : undefined;
    const observedAction =
      record.observedAction && typeof record.observedAction === "object"
        ? {
            description: this.normalizePromptText(
              (record.observedAction as Record<string, unknown>).description,
              100
            ),
          }
        : undefined;
    if ((!observedSignals || Object.keys(observedSignals).length === 0) && !observedAction?.description) {
      return undefined;
    }
    return {
      id: this.normalizePromptText(record.id, 40),
      entityType: this.normalizePromptText(record.entityType, 40),
      observedSignals,
      observedAction: observedAction?.description ? observedAction : undefined,
      exampleOnly: true,
    };
  }

  private summarizeObservedSignals(value: Record<string, unknown>): Record<string, unknown> {
    const summarized: Record<string, unknown> = {};
    const textHint =
      this.normalizePromptText(value.text_hint, 80) ?? this.normalizePromptText(value.textHint, 80);
    const assertionHint =
      this.normalizePromptText(value.assertion_hint, 80) ?? this.normalizePromptText(value.assertionHint, 80);
    const roleHint = this.normalizePromptText(value.role, 40) ?? this.normalizePromptText(value.roleHint, 40);
    const urlHint =
      typeof value.url === "string"
        ? this.normalizeUrlForPrompt(value.url)
        : typeof value.href === "string"
          ? this.normalizeUrlForPrompt(value.href)
          : undefined;
    if (textHint) {
      summarized.text_hint = textHint;
    }
    if (assertionHint) {
      summarized.assertion_hint = assertionHint;
    }
    if (roleHint) {
      summarized.role = roleHint;
    }
    if (urlHint) {
      summarized.url = urlHint;
    }
    return summarized;
  }

  private summarizeTargetValue(targetType: string | undefined, value: unknown): string | undefined {
    if (typeof value !== "string" || value.trim().length === 0) {
      return undefined;
    }
    if (targetType === "url") {
      return this.normalizeUrlForPrompt(value);
    }
    if (targetType === "text") {
      if (value.trim().toLowerCase() === "wait") {
        return undefined;
      }
      return this.normalizePromptText(value, 80);
    }
    if (targetType === "selector") {
      return undefined;
    }
    return this.normalizePromptText(value, 80);
  }

  private summarizeEvidenceToken(value: unknown): string | undefined {
    const text = this.normalizePromptText(value, 120);
    if (!text) {
      return undefined;
    }
    const separatorIndex = text.indexOf(":");
    if (separatorIndex < 0) {
      return text;
    }
    const prefix = text.slice(0, separatorIndex);
    const payload = text.slice(separatorIndex + 1);
    if (prefix === "navigate") {
      const url = this.normalizeUrlForPrompt(payload);
      return url ? `${prefix}:${url}` : prefix;
    }
    if ((prefix === "click" || prefix === "type") && /nth-of-type|>\s*/.test(payload)) {
      return `${prefix}:selector`;
    }
    const normalizedPayload = this.normalizePromptText(payload, 60);
    return normalizedPayload ? `${prefix}:${normalizedPayload}` : prefix;
  }

  private normalizeUrlForPrompt(value: string): string | undefined {
    try {
      const parsed = new URL(value);
      return this.normalizePromptText(`${parsed.host}${parsed.pathname}`, 80);
    } catch {
      return this.normalizePromptText(value, 80);
    }
  }

  private normalizePromptText(value: unknown, limit = 120): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length === 0) {
      return undefined;
    }
    if (normalized.length <= limit) {
      return normalized;
    }
    return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
  }

  private extractText(content: unknown[]): string | undefined {
    const textBlocks: string[] = [];
    for (const block of content) {
      if (typeof block !== "object" || block === null) {
        continue;
      }
      const candidate = block as { type?: unknown; text?: unknown };
      if (candidate.type === "text" && typeof candidate.text === "string" && candidate.text.trim().length > 0) {
        textBlocks.push(candidate.text.trim());
      }
    }
    if (textBlocks.length === 0) {
      return undefined;
    }
    return textBlocks.join("\n\n");
  }

  private extractJsonObject(text: string): Record<string, unknown> {
    const normalized = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("semantic output did not return a JSON object");
    }
    const candidate = normalized.slice(start, end + 1);
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("semantic output payload must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  }

  private toReasoningLevel(level: SemanticThinkingLevel): ThinkingLevel | undefined {
    if (level === "off") {
      return undefined;
    }
    return level;
  }
}
