/**
 * Deps: core/semantic-compactor.ts, domain/sop-compact-artifacts.ts, runtime/sop-semantic-runner.ts
 * Used By: runtime/sop-compact.ts
 * Last Updated: 2026-03-08
 */
import { SemanticCompactor, type SemanticMode } from "../core/semantic-compactor.js";
import type { AbstractionInput } from "../domain/sop-compact-artifacts.js";
import type { SopCompactSemanticOptions } from "./sop-semantic-runner.js";

export interface StructuredAbstractionRunInput {
  runId: string;
  traceId: string;
  abstractionInput: AbstractionInput;
}

export interface StructuredAbstractionOutcome {
  mode: SemanticMode;
  fallback: boolean;
  draft?: Record<string, unknown>;
  rawText?: string;
  error?: string;
  model?: string;
  provider?: string;
  stopReason?: string;
}

export class SopStructuredAbstractionRunner {
  private readonly options: SopCompactSemanticOptions;

  constructor(options: SopCompactSemanticOptions) {
    this.options = options;
  }

  async run(input: StructuredAbstractionRunInput): Promise<StructuredAbstractionOutcome> {
    const mode = this.options.mode;
    if (mode === "off") {
      return { mode, fallback: true, error: "structured abstraction disabled by semantic mode off" };
    }

    try {
      const compactor = new SemanticCompactor({
        model: this.options.model,
        apiKey: this.options.apiKey,
        baseUrl: this.options.baseUrl,
        timeoutMs: this.options.timeoutMs,
        thinkingLevel: this.options.thinkingLevel,
      });
      const result = await compactor.abstractStructured({
        runId: input.runId,
        traceId: input.traceId,
        abstractionInput: input.abstractionInput,
      });
      return {
        mode,
        fallback: false,
        draft: result.payload,
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
}
