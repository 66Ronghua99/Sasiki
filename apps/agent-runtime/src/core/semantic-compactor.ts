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
