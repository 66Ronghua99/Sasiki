/**
 * Deps: domain/sop-trace.ts, runtime/sop-rule-compact-builder.ts
 * Used By: runtime/sop-compact.ts
 * Last Updated: 2026-03-05
 */
import type { SopTrace } from "../domain/sop-trace.js";
import type { BuiltCompact } from "./sop-rule-compact-builder.js";
import { serializeCompactHint } from "./sop-rule-compact-builder.js";
import type { SemanticOutcome } from "./sop-semantic-runner.js";

export interface SopCompactMarkdownInput {
  runId: string;
  sourceTracePath: string;
  trace: SopTrace;
  built: BuiltCompact;
  semantic: SemanticOutcome;
  generatedAt: string;
}

export function renderSopCompactMarkdown(input: SopCompactMarkdownInput): string {
  const { runId, sourceTracePath, trace, built, semantic, generatedAt } = input;
  const lines: string[] = [];
  lines.push("# SOP Compact (v0)");
  lines.push("");
  lines.push(`- runId: ${runId}`);
  lines.push(`- traceId: ${trace.traceId}`);
  lines.push(`- site: ${trace.site}`);
  lines.push(`- taskHint: ${trace.taskHint}`);
  lines.push(`- generatedAt: ${generatedAt}`);
  lines.push(`- sourceTrace: ${sourceTracePath}`);
  lines.push(`- semanticMode: ${semantic.mode}`);
  lines.push(`- semanticFallback: ${semantic.fallback}`);
  if (semantic.guidePath) {
    lines.push(`- semanticGuidePath: ${semantic.guidePath}`);
  }
  if (semantic.model) {
    lines.push(`- semanticModel: ${semantic.model}`);
  }
  if (semantic.provider) {
    lines.push(`- semanticProvider: ${semantic.provider}`);
  }
  if (semantic.stopReason) {
    lines.push(`- semanticStopReason: ${semantic.stopReason}`);
  }
  if (semantic.error) {
    lines.push(`- semanticError: ${semantic.error}`);
  }
  lines.push("");
  lines.push("## High-Level Steps");
  for (let i = 0; i < built.highSteps.length; i += 1) {
    lines.push(`${i + 1}. ${built.highSteps[i]}`);
  }
  lines.push("");
  lines.push("## Hints");
  if (built.hints.length === 0) {
    lines.push("- 无可提取的关键元素提示");
  } else {
    for (const hint of built.hints) {
      const serialized = serializeCompactHint(hint);
      if (serialized) {
        lines.push(`- ${serialized}`);
      }
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
