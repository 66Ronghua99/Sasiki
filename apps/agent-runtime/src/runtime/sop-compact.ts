/**
 * Deps: node:fs/promises, node:path, domain/sop-trace.ts, runtime/sop-rule-compact-builder.ts, runtime/sop-semantic-runner.ts, runtime/sop-compact-renderer.ts
 * Used By: index.ts
 * Last Updated: 2026-03-05
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SemanticMode } from "../core/semantic-compactor.js";
import type { IntentResolution } from "../domain/sop-compact-artifacts.js";
import type { SopTrace } from "../domain/sop-trace.js";
import { renderSopCompactMarkdown } from "./sop-compact-renderer.js";
import { SopIntentAbstractionBuilder, type StructuredAbstractionDraft } from "./sop-intent-abstraction-builder.js";
import { SopRuleCompactBuilder } from "./sop-rule-compact-builder.js";
import { SopSemanticRunner, type SopCompactSemanticOptions, type SemanticOutcome } from "./sop-semantic-runner.js";
import { SopStructuredAbstractionRunner, type StructuredAbstractionOutcome } from "./sop-structured-abstraction-runner.js";

interface SopCompactServiceOptions {
  semantic?: SopCompactSemanticOptions;
}

export interface SopCompactResult {
  runId: string;
  runDir: string;
  sourceTracePath: string;
  compactPath: string;
  abstractionInputPath: string;
  structuredDraftPath?: string;
  structuredRawPath?: string;
  workflowGuideJsonPath: string;
  workflowGuideMdPath: string;
  decisionModelPath: string;
  observedExamplesPath: string;
  clarificationQuestionsPath?: string;
  intentResolutionPath?: string;
  executionGuidePath: string;
  compactManifestPath: string;
  status: "draft" | "needs_clarification" | "ready_for_replay" | "rejected";
  semanticMode: SemanticMode;
  semanticFallback: boolean;
  semanticGuidePath?: string;
  structuredFallback: boolean;
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
    const abstractionInputPath = path.join(runDir, "abstraction_input.json");
    const structuredDraftPath = path.join(runDir, "structured_abstraction_draft.json");
    const structuredRawPath = path.join(runDir, "structured_abstraction_raw.txt");
    const workflowGuideJsonPath = path.join(runDir, "workflow_guide.json");
    const workflowGuideMdPath = path.join(runDir, "workflow_guide.md");
    const decisionModelPath = path.join(runDir, "decision_model.json");
    const observedExamplesPath = path.join(runDir, "observed_examples.json");
    const clarificationQuestionsPath = path.join(runDir, "clarification_questions.json");
    const intentResolutionPath = path.join(runDir, "intent_resolution.json");
    const executionGuidePath = path.join(runDir, "execution_guide.json");
    const compactManifestPath = path.join(runDir, "compact_manifest.json");

    const trace = await this.readTrace(sourceTracePath);
    const built = this.ruleBuilder.build(trace);
    const abstractionBuilder = new SopIntentAbstractionBuilder();
    const generatedAt = new Date().toISOString();
    const { abstractionInput } = abstractionBuilder.buildEvidenceInput(runId, trace, built, generatedAt);
    const structured = await new SopStructuredAbstractionRunner(this.semanticOptions).run({
      runId,
      traceId: trace.traceId,
      abstractionInput,
    });
    const semantic = await new SopSemanticRunner(this.semanticOptions).run({
      runId,
      trace,
      built,
      guidePath: semanticGuidePath,
    });
    const intentResolution = await this.readIntentResolution(intentResolutionPath);
    const abstraction = abstractionBuilder.build({
      runId,
      trace,
      built,
      generatedAt,
      intentResolution,
      agentDraft: structured.draft as StructuredAbstractionDraft | undefined,
    });

    await this.persistSemanticOutputs(runDir, runId, semantic, structured);
    await writeFile(abstractionInputPath, `${JSON.stringify(abstraction.abstractionInput, null, 2)}\n`, "utf-8");
    if (structured.draft) {
      await writeFile(structuredDraftPath, `${JSON.stringify(structured.draft, null, 2)}\n`, "utf-8");
    }
    if (structured.rawText) {
      await writeFile(structuredRawPath, `${structured.rawText.trim()}\n`, "utf-8");
    }
    await writeFile(workflowGuideJsonPath, `${JSON.stringify(abstraction.workflowGuide, null, 2)}\n`, "utf-8");
    await writeFile(workflowGuideMdPath, abstraction.workflowGuideMarkdown, "utf-8");
    await writeFile(decisionModelPath, `${JSON.stringify(abstraction.decisionModel, null, 2)}\n`, "utf-8");
    await writeFile(observedExamplesPath, `${JSON.stringify(abstraction.observedExamples, null, 2)}\n`, "utf-8");
    if (abstraction.clarificationQuestions) {
      await writeFile(
        clarificationQuestionsPath,
        `${JSON.stringify(abstraction.clarificationQuestions, null, 2)}\n`,
        "utf-8"
      );
    }
    await writeFile(executionGuidePath, `${JSON.stringify(abstraction.executionGuide, null, 2)}\n`, "utf-8");
    await writeFile(compactManifestPath, `${JSON.stringify(abstraction.manifest, null, 2)}\n`, "utf-8");

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
      abstractionInputPath,
      structuredDraftPath: structured.draft ? structuredDraftPath : undefined,
      structuredRawPath: structured.rawText ? structuredRawPath : undefined,
      workflowGuideJsonPath,
      workflowGuideMdPath,
      decisionModelPath,
      observedExamplesPath,
      clarificationQuestionsPath: abstraction.clarificationQuestions ? clarificationQuestionsPath : undefined,
      intentResolutionPath: intentResolution ? intentResolutionPath : undefined,
      executionGuidePath,
      compactManifestPath,
      status: abstraction.manifest.status,
      semanticMode: semantic.mode,
      semanticFallback: semantic.fallback,
      semanticGuidePath: semantic.guidePath,
      structuredFallback: structured.fallback,
      sourceSteps: trace.steps.length,
      compactSteps: built.stepCount,
      tabs: built.tabs,
    };
  }

  private async readTrace(tracePath: string): Promise<SopTrace> {
    const raw = await readFile(tracePath, "utf-8");
    return JSON.parse(raw) as SopTrace;
  }

  private async readIntentResolution(intentResolutionPath: string): Promise<IntentResolution | undefined> {
    try {
      const raw = await readFile(intentResolutionPath, "utf-8");
      return JSON.parse(raw) as IntentResolution;
    } catch {
      return undefined;
    }
  }

  private async persistSemanticOutputs(
    runDir: string,
    runId: string,
    semantic: SemanticOutcome,
    structured: StructuredAbstractionOutcome
  ): Promise<void> {
    if (semantic.guidePath && semantic.guideMarkdown) {
      await writeFile(semantic.guidePath, semantic.guideMarkdown, "utf-8");
    }
    if (structured.mode !== "off") {
      if (!structured.fallback) {
        await this.appendRuntimeLog(runDir, "INFO", "structured_abstraction_succeeded", {
          runId,
          mode: structured.mode,
          model: structured.model,
          provider: structured.provider,
          stopReason: structured.stopReason,
        });
      } else {
        await this.appendRuntimeLog(runDir, "WARN", "structured_abstraction_fallback", {
          runId,
          mode: structured.mode,
          reason: structured.error,
        });
      }
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
