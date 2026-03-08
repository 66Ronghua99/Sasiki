/**
 * Deps: @mariozechner/pi-ai, core/model-resolver.ts
 * Used By: runtime/sop-compact.ts
 * Last Updated: 2026-03-08
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

export interface StructuredSemanticInput {
  runId: string;
  traceId: string;
  abstractionInput: unknown;
}

export interface StructuredSemanticOutput {
  payload: Record<string, unknown>;
  rawText: string;
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

const STRUCTURED_ABSTRACTION_SYSTEM_PROMPT = [
  "You are a structured SOP abstraction engine for browser workflow demonstrations.",
  "Your job is to infer task structure from evidence and return strict JSON only.",
  "Never promote concrete examples into general policy.",
  "Never invent actions that are not supported by the evidence.",
  "If something is unclear, keep it in uncertainFields instead of guessing.",
  "Return one JSON object with keys: workflowGuide, decisionModel, observedExamples, clarificationQuestions.",
  "Do not wrap the JSON in markdown fences.",
].join("\n");

const SEMANTIC_INTENT_DRAFT_SYSTEM_PROMPT = [
  "You are a semantic intent inference engine for browser workflow demonstrations.",
  "You receive only behavior evidence and concrete examples from one demonstration.",
  "Infer semantic hypotheses, but do not hardcode domain taxonomies or closed business enums.",
  "If semantics are unclear, express them as uncertainties instead of guessing.",
  "Do not promote examples into universal rules.",
  "Return one JSON object with keys exactly matching the semantic_intent_draft.v1 schema.",
  "Do not wrap the JSON in markdown fences.",
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

  async abstractStructured(input: StructuredSemanticInput): Promise<StructuredSemanticOutput> {
    const message = await this.complete(STRUCTURED_ABSTRACTION_SYSTEM_PROMPT, this.buildStructuredPrompt(input));
    const rawText = this.extractText(message.content);
    if (!rawText) {
      throw new Error(`structured abstraction returned empty text (stopReason=${message.stopReason})`);
    }
    return {
      payload: this.extractJsonObject(rawText),
      rawText,
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

  private buildStructuredPrompt(input: StructuredSemanticInput): string {
    return [
      "请基于以下结构化 evidence，为浏览器示教生成结构化 SOP 抽象。",
      "",
      `runId: ${input.runId}`,
      `traceId: ${input.traceId}`,
      "",
      "输出要求：",
      "1) workflowGuide 只能描述通用 goal / steps / completionSignals，不允许带具体示例文本；",
      "2) decisionModel 必须包含 goalType / targetEntity / selectionRules / decisionRules / doneCriteria / uncertainFields；",
      "3) goalType 只能取以下枚举之一：single_object_update, collection_processing, search_and_select, form_submission, multi_step_transaction；",
      "4) targetEntity 只能取以下枚举之一：conversation_thread, product, order, listing, form, generic_page_object；",
      "5) 如果 evidence 不足以确定 targetEntity，请使用 generic_page_object，不要自造新类型；",
      "6) observedExamples 只能放具体实例，且 exampleOnly 必须为 true；",
      "7) clarificationQuestions 只针对 blocking uncertainties；",
      "8) 无法确定时保守处理，不要捏造不存在的动作或规则；",
      "9) workflowGuide.steps 必须是对象数组，每项格式为 {\"id\":\"step_1\",\"kind\":\"navigate\",\"summary\":\"...\"}；",
      "10) selectionRules / decisionRules / doneCriteria 必须是对象数组，不要只返回字符串数组；",
      "11) uncertainFields 必须是对象数组，每项格式为 {\"field\":\"...\",\"severity\":\"high|medium|low\",\"reason\":\"...\"}；",
      "12) observedExamples 必须返回 {\"examples\":[...]}，每个 example 至少包含 description 或 observedSignals/observedAction 之一；",
      "13) clarificationQuestions 必须返回 {\"questions\":[...]}，每项格式为 {\"id\":\"q_1\",\"topic\":\"...\",\"question\":\"...\",\"targetsField\":\"...\",\"priority\":\"high|medium\"}；",
      "",
      "期望 JSON 形状示例：",
      JSON.stringify(
        {
          workflowGuide: {
            taskName: "任务名称",
            goal: "抽象目标",
            preconditions: ["前置条件"],
            steps: [{ id: "step_1", kind: "navigate", summary: "进入目标工作区" }],
            completionSignals: ["完成信号"],
          },
          decisionModel: {
            goalType: "collection_processing",
            targetEntity: "generic_page_object",
            selectionRules: [{ id: "select_1", rule: "仅处理当前任务范围内的对象", source: "inferred_from_trace", confidence: "medium" }],
            decisionRules: [{ id: "decide_1", condition: "对象状态已被检查", action: "再决定是否继续执行动作", source: "inferred_from_trace", confidence: "medium" }],
            doneCriteria: [{ id: "done_1", rule: "已观察到完成信号", source: "inferred_from_trace", confidence: "medium" }],
            uncertainFields: [{ field: "done_criteria", severity: "high", reason: "完成边界仍不清晰" }],
          },
          observedExamples: {
            examples: [
              {
                id: "example_1",
                entityType: "generic_page_object",
                observedSignals: { text_hint: "示例文本" },
                observedAction: { description: "具体示例动作" },
                exampleOnly: true,
              },
            ],
          },
          clarificationQuestions: {
            questions: [
              {
                id: "q_1",
                topic: "completion",
                question: "什么状态才算真正完成？",
                targetsField: "done_criteria",
                priority: "high",
              },
            ],
          },
        },
        null,
        2
      ),
      "",
      "Evidence JSON:",
      JSON.stringify(input.abstractionInput, null, 2),
    ].join("\n");
  }

  private buildSemanticIntentPrompt(input: SemanticIntentDraftInput): string {
    const behaviorEvidenceSummary = this.summarizeBehaviorEvidence(input.behaviorEvidence);
    const observedExamplesSummary = this.summarizeObservedExamples(input.observedExamples);
    return [
      "请基于以下行为证据和示例，为浏览器示教生成 semantic_intent_draft.v1。",
      "",
      `runId: ${input.runId}`,
      `traceId: ${input.traceId}`,
      `rawTask: ${input.rawTask}`,
      "",
      "输出要求：",
      "1) 只返回一个 JSON 对象；",
      "2) 只能输出以下字段：taskIntentHypothesis, scopeHypothesis, completionHypothesis, actionPurposeHypotheses, selectionHypotheses, skipHypotheses, blockingUncertainties, nonBlockingUncertainties；",
      "3) 不允许使用 goalType、targetEntity、domain enum 等封闭分类字段；",
      "4) actionPurposeHypotheses 必须引用 behavior_workflow 的 stepId，并带 evidenceRefs；",
      "5) 对无法稳定推出的业务用途、范围、完成条件，必须进入 uncertainties；",
      "6) 不允许把 observed_examples 的具体文本、用户名、选择器直接提升为通用规则；",
      "7) selectionHypotheses 和 skipHypotheses 只描述语义假设，不描述页面机械动作；",
      "",
      "期望 JSON 形状示例：",
      JSON.stringify(
        {
          taskIntentHypothesis: "用户可能想批量处理当前页面中的一组待处理对象。",
          scopeHypothesis: "范围可能是当前工作区中满足筛选条件的候选对象。",
          completionHypothesis: "所有目标对象都已被检查，并对需要处理的对象执行了预期动作。",
          actionPurposeHypotheses: [
            {
              stepId: "behavior_step_3",
              purpose: "定位并逐个处理当前任务范围内的候选对象。",
              confidence: "medium",
              evidenceRefs: ["signal_3_iterate_collection"],
            },
          ],
          selectionHypotheses: ["只处理当前工作区中与任务相关的候选对象。"],
          skipHypotheses: ["若对象已满足完成条件，则可能无需重复处理。"],
          blockingUncertainties: [
            {
              field: "completionHypothesis",
              severity: "high",
              reason: "从当前行为证据中无法唯一确定什么状态才算完成。",
            },
          ],
          nonBlockingUncertainties: [
            {
              field: "selectionHypotheses",
              severity: "medium",
              reason: "选择范围仍依赖页面上下文补充。",
            },
          ],
        },
        null,
        2
      ),
      "",
      "Behavior Evidence JSON:",
      JSON.stringify(behaviorEvidenceSummary, null, 2),
      "",
      "Behavior Workflow JSON:",
      JSON.stringify(input.behaviorWorkflow, null, 2),
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
      .slice(0, 16)
      .map(({ step }) => step);

    return {
      schemaVersion: record.schemaVersion,
      runId: record.runId,
      traceId: record.traceId,
      site: record.site,
      surface: record.surface,
      rawTask: record.rawTask,
      actionSummary: record.actionSummary,
      phaseSignals: Array.isArray(record.phaseSignals) ? record.phaseSignals : [],
      exampleCandidates: Array.isArray(record.exampleCandidates) ? record.exampleCandidates.slice(0, 8) : [],
      uncertaintyCues: Array.isArray(record.uncertaintyCues) ? record.uncertaintyCues.slice(0, 8) : [],
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
      antiPromotionRules: Array.isArray(record.antiPromotionRules) ? record.antiPromotionRules : [],
      examples: Array.isArray(record.examples) ? record.examples.slice(0, 5) : [],
    };
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
      throw new Error("structured abstraction did not return a JSON object");
    }
    const candidate = normalized.slice(start, end + 1);
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("structured abstraction payload must be a JSON object");
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
