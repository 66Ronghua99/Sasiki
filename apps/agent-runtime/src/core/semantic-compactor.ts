/**
 * Deps: @mariozechner/pi-ai, core/model-resolver.ts
 * Used By: runtime/sop-compact.ts
 * Last Updated: 2026-03-05
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

const SEMANTIC_SYSTEM_PROMPT = [
  "You are a SOP semantic editor for browser workflows.",
  "Rewrite noisy action steps into a concise, executable guide.",
  "## Goal",
  "## Steps",
  "## Fallback",
  "Keep steps action-oriented and deterministic. Avoid introducing new actions not present in input.",
].join("\n");

export class SemanticCompactor {
  private readonly config: SemanticCompactorConfig;

  constructor(config: SemanticCompactorConfig) {
    this.config = config;
  }

  async compact(input: SemanticCompactionInput): Promise<SemanticCompactionOutput> {
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
          systemPrompt: SEMANTIC_SYSTEM_PROMPT,
          messages: [{ role: "user", timestamp: Date.now(), content: this.buildUserPrompt(input) }],
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
      const markdown = this.extractMarkdown(message.content);
      if (!markdown) {
        throw new Error(`semantic model returned empty text (stopReason=${message.stopReason})`);
      }
      return {
        markdown,
        model: model.id,
        provider: String(model.provider),
        stopReason: message.stopReason,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUserPrompt(input: SemanticCompactionInput): string {
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
      "2) Steps 保留关键顺序，并给出可解释的执行原因",
      "3) Fallback 提供失败时替代目标；",
      "4) 不要输出代码块或 JSON，只输出 markdown 正文。",
    ].join("\n");
  }

  private extractMarkdown(content: unknown[]): string | undefined {
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
    return `${textBlocks.join("\n\n")}\n`;
  }

  private toReasoningLevel(level: SemanticThinkingLevel): ThinkingLevel | undefined {
    if (level === "off") {
      return undefined;
    }
    return level;
  }
}
