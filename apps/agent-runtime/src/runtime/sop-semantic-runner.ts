/**
 * Deps: core/semantic-compactor.ts, runtime/sop-rule-compact-builder.ts, domain/sop-trace.ts
 * Used By: runtime/sop-compact.ts, runtime/sop-compact-renderer.ts
 * Last Updated: 2026-03-05
 */
import { SemanticCompactor, type SemanticMode, type SemanticThinkingLevel } from "../core/semantic-compactor.js";
import type { SopTrace } from "../domain/sop-trace.js";
import type { BuiltCompact } from "./sop-rule-compact-builder.js";
import { serializeCompactHint } from "./sop-rule-compact-builder.js";

export interface SopCompactSemanticOptions {
  mode: SemanticMode;
  timeoutMs: number;
  model: string;
  apiKey: string;
  baseUrl?: string;
  thinkingLevel: SemanticThinkingLevel;
}

export interface SemanticRunInput {
  runId: string;
  trace: SopTrace;
  built: BuiltCompact;
  guidePath: string;
}

export interface SemanticOutcome {
  mode: SemanticMode;
  fallback: boolean;
  guidePath?: string;
  guideMarkdown?: string;
  error?: string;
  model?: string;
  provider?: string;
  stopReason?: string;
}

export class SopSemanticRunner {
  private readonly options: SopCompactSemanticOptions;

  constructor(options: SopCompactSemanticOptions) {
    this.options = options;
  }

  async run(input: SemanticRunInput): Promise<SemanticOutcome> {
    const mode = this.options.mode;
    if (mode === "off") {
      return { mode, fallback: false };
    }

    try {
      const compactor = new SemanticCompactor({
        model: this.options.model,
        apiKey: this.options.apiKey,
        baseUrl: this.options.baseUrl,
        timeoutMs: this.options.timeoutMs,
        thinkingLevel: this.options.thinkingLevel,
      });
      const result = await compactor.compact({
        runId: input.runId,
        traceId: input.trace.traceId,
        site: input.trace.site,
        taskHint: input.trace.taskHint,
        highLevelSteps: input.built.highSteps,
        hints: input.built.hints.map((hint) => serializeCompactHint(hint)).filter((hint) => hint.length > 0),
      });
      return {
        mode,
        fallback: false,
        guidePath: input.guidePath,
        guideMarkdown: result.markdown,
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
