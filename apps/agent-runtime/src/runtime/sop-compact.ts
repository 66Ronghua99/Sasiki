/**
 * Deps: node:fs/promises, node:path, domain/sop-trace.ts, runtime/sop-rule-compact-builder.ts, runtime/sop-semantic-runner.ts, runtime/sop-compact-renderer.ts
 * Used By: index.ts
 * Last Updated: 2026-03-05
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SemanticMode } from "../core/semantic-compactor.js";
import type { SopTrace } from "../domain/sop-trace.js";
import { renderSopCompactMarkdown } from "./sop-compact-renderer.js";
import { SopRuleCompactBuilder } from "./sop-rule-compact-builder.js";
import { SopSemanticRunner, type SopCompactSemanticOptions, type SemanticOutcome } from "./sop-semantic-runner.js";

interface SopCompactServiceOptions {
  semantic?: SopCompactSemanticOptions;
}

export interface SopCompactResult {
  runId: string;
  runDir: string;
  sourceTracePath: string;
  compactPath: string;
  semanticMode: SemanticMode;
  semanticFallback: boolean;
  semanticGuidePath?: string;
  sourceSteps: number;
  compactSteps: number;
  tabs: string[];
}

export class SopCompactService {
  private readonly artifactsDir: string;
  private readonly semanticOptions: SopCompactSemanticOptions;
  private readonly ruleBuilder: SopRuleCompactBuilder;

  constructor(artifactsDir: string, options?: SopCompactServiceOptions) {
    this.artifactsDir = path.resolve(artifactsDir);
    this.semanticOptions = options?.semantic ?? {
      mode: "off",
      timeoutMs: 12000,
      model: "openai/gpt-4o-mini",
      apiKey: "",
      thinkingLevel: "minimal",
    };
    this.ruleBuilder = new SopRuleCompactBuilder();
    process.stdout.write(
      `Initialized SopCompactService with artifactsDir=${this.artifactsDir} and semanticOptions=${JSON.stringify(this.semanticOptions)}\n`
    );
  }

  async compact(runId: string): Promise<SopCompactResult> {
    const runDir = path.join(this.artifactsDir, runId);
    const sourceTracePath = path.join(runDir, "demonstration_trace.json");
    const compactPath = path.join(runDir, "sop_compact.md");
    const semanticGuidePath = path.join(runDir, "guide_semantic.md");

    const trace = await this.readTrace(sourceTracePath);
    const built = this.ruleBuilder.build(trace);
    const semantic = await new SopSemanticRunner(this.semanticOptions).run({
      runId,
      trace,
      built,
      guidePath: semanticGuidePath,
    });

    await this.persistSemanticOutputs(runDir, runId, semantic);

    const markdown = renderSopCompactMarkdown({
      runId,
      sourceTracePath,
      trace,
      built,
      semantic,
      generatedAt: new Date().toISOString(),
    });
    await writeFile(compactPath, markdown, "utf-8");

    return {
      runId,
      runDir,
      sourceTracePath,
      compactPath,
      semanticMode: semantic.mode,
      semanticFallback: semantic.fallback,
      semanticGuidePath: semantic.guidePath,
      sourceSteps: trace.steps.length,
      compactSteps: built.stepCount,
      tabs: built.tabs,
    };
  }

  private async readTrace(tracePath: string): Promise<SopTrace> {
    const raw = await readFile(tracePath, "utf-8");
    return JSON.parse(raw) as SopTrace;
  }

  private async persistSemanticOutputs(runDir: string, runId: string, semantic: SemanticOutcome): Promise<void> {
    if (semantic.guidePath && semantic.guideMarkdown) {
      await writeFile(semantic.guidePath, semantic.guideMarkdown, "utf-8");
    }
    if (semantic.mode === "off") {
      return;
    }
    if (!semantic.fallback) {
      await this.appendRuntimeLog(runDir, "INFO", "semantic_compaction_succeeded", {
        runId,
        mode: semantic.mode,
        guidePath: semantic.guidePath,
        model: semantic.model,
        provider: semantic.provider,
        stopReason: semantic.stopReason,
      });
      return;
    }
    await this.appendRuntimeLog(runDir, "WARN", "semantic_compaction_fallback", {
      runId,
      mode: semantic.mode,
      reason: semantic.error,
    });
  }

  private async appendRuntimeLog(
    runDir: string,
    level: "INFO" | "WARN" | "ERROR",
    event: string,
    payload?: Record<string, unknown>
  ): Promise<void> {
    const runtimeLogPath = path.join(runDir, "runtime.log");
    const line = `${new Date().toISOString()} ${level} ${event}${payload ? ` ${JSON.stringify(payload)}` : ""}`;
    let existing = "";
    try {
      existing = await readFile(runtimeLogPath, "utf-8");
    } catch {
      existing = "";
    }
    const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    await writeFile(runtimeLogPath, `${existing}${prefix}${line}\n`, "utf-8");
  }
}
