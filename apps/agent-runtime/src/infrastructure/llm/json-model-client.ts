import { completeSimple, type ThinkingLevel } from "@mariozechner/pi-ai";

import type { LlmThinkingLevel } from "../../domain/llm-thinking.js";
import { ModelResolver } from "./model-resolver.js";

export interface JsonModelClientConfig {
  model: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs: number;
  thinkingLevel: LlmThinkingLevel;
}

export interface JsonCompletionResult<T extends Record<string, unknown>> {
  payload: T;
  rawText: string;
  model: string;
  provider: string;
  stopReason: string;
}

export interface TextCompletionResult {
  rawText: string;
  model: string;
  provider: string;
  stopReason: string;
}

export class JsonModelClient {
  constructor(private readonly config: JsonModelClientConfig) {}

  async completeText(systemPrompt: string, userPrompt: string): Promise<TextCompletionResult> {
    return this.completeRaw(systemPrompt, userPrompt);
  }

  async completeObject<T extends Record<string, unknown>>(systemPrompt: string, userPrompt: string): Promise<JsonCompletionResult<T>> {
    const result = await this.completeRaw(systemPrompt, userPrompt);
    return {
      payload: this.extractJsonObject<T>(result.rawText),
      rawText: result.rawText,
      model: result.model,
      provider: result.provider,
      stopReason: result.stopReason,
    };
  }

  private async completeRaw(systemPrompt: string, userPrompt: string): Promise<TextCompletionResult> {
    if (!this.config.apiKey.trim()) {
      throw new Error("compact reasoning api key missing");
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
        throw new Error(message.errorMessage ?? `compact reasoning failed: ${message.stopReason}`);
      }

      const rawText = this.extractText(message.content);
      if (!rawText) {
        throw new Error(`compact reasoning returned empty text (stopReason=${message.stopReason})`);
      }

      return {
        rawText,
        model: model.id,
        provider: String(model.provider),
        stopReason: message.stopReason,
      };
    } finally {
      clearTimeout(timer);
    }
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

  private extractJsonObject<T extends Record<string, unknown>>(text: string): T {
    const normalized = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const candidate = this.extractFirstBalancedObject(normalized);
    if (!candidate) {
      throw new Error("compact reasoning output did not return a JSON object");
    }
    const parsed = this.parseJsonObject(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("compact reasoning payload must be a JSON object");
    }
    return parsed as T;
  }

  private extractFirstBalancedObject(text: string): string | undefined {
    const start = text.indexOf("{");
    if (start < 0) {
      return undefined;
    }

    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === "\"") {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return text.slice(start, index + 1);
        }
      }
    }

    return undefined;
  }

  private parseJsonObject(candidate: string): Record<string, unknown> {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/control character/i.test(message)) {
        throw error;
      }
    }

    return JSON.parse(this.escapeControlCharactersInsideStrings(candidate)) as Record<string, unknown>;
  }

  private escapeControlCharactersInsideStrings(input: string): string {
    let result = "";
    let inString = false;
    let escaping = false;

    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];

      if (escaping) {
        result += char;
        escaping = false;
        continue;
      }

      if (char === "\\") {
        result += char;
        escaping = true;
        continue;
      }

      if (char === "\"") {
        result += char;
        inString = !inString;
        continue;
      }

      if (inString) {
        if (char === "\n") {
          result += "\\n";
          continue;
        }
        if (char === "\r") {
          result += "\\r";
          continue;
        }
        if (char === "\t") {
          result += "\\t";
          continue;
        }
        if (char.charCodeAt(0) < 0x20) {
          result += `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
          continue;
        }
      }

      result += char;
    }

    return result;
  }

  private toReasoningLevel(level: LlmThinkingLevel): ThinkingLevel | undefined {
    if (level === "off") {
      return undefined;
    }
    return level;
  }
}
