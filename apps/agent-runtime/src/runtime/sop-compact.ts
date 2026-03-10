/**
 * Deps: node:fs/promises, node:path, domain/sop-trace.ts, runtime/sop-rule-compact-builder.ts, runtime/sop-semantic-runner.ts, runtime/sop-compact-renderer.ts
 * Used By: index.ts
 * Last Updated: 2026-03-09
 */
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SemanticMode } from "../core/semantic-compactor.js";
import type { IntentResolution } from "../domain/sop-compact-artifacts.js";
import type { SopTrace } from "../domain/sop-trace.js";
import { renderSopCompactMarkdown } from "./sop-compact-renderer.js";
import { SopIntentAbstractionBuilder } from "./sop-intent-abstraction-builder.js";
import { SopRuleCompactBuilder } from "./sop-rule-compact-builder.js";
import { SopSemanticIntentRunner, type SemanticIntentDraftOutcome } from "./sop-semantic-intent-runner.js";
import { SopSemanticRunner, type SopCompactSemanticOptions, type SemanticOutcome } from "./sop-semantic-runner.js";

interface SopCompactServiceOptions {
  semantic?: SopCompactSemanticOptions;
}

export interface SopCompactResult {
  runId: string;
  runDir: string;
  sourceTracePath: string;
  compactPath: string;
  abstractionInputPath: string;
  behaviorEvidencePath: string;
  behaviorWorkflowPath: string;
  semanticIntentDraftPath?: string;
  semanticIntentRawPath?: string;
  observedExamplesPath: string;
  clarificationQuestionsPath?: string;
  intentResolutionPath?: string;
  frozenSemanticIntentPath?: string;
  executionGuidePath: string;
  compactManifestPath: string;
  status: "draft" | "needs_clarification" | "ready_for_replay" | "rejected";
  semanticMode: SemanticMode;
  semanticFallback: boolean;
  semanticGuidePath?: string;
  semanticIntentFallback: boolean;
  sourceSteps: number;
  compactSteps: number;
  tabs: string[];
}

const LEGACY_ARTIFACT_NAMES = [
  "structured_abstraction_draft.json",
  "structured_abstraction_raw.txt",
  "workflow_guide.json",
  "workflow_guide.md",
  "decision_model.json",
];

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
  }

  async compact(runId: string): Promise<SopCompactResult> {
    const runDir = path.join(this.artifactsDir, runId);
    const sourceTracePath = path.join(runDir, "demonstration_trace.json");
    const compactPath = path.join(runDir, "sop_compact.md");
    const semanticGuidePath = path.join(runDir, "guide_semantic.md");
    const abstractionInputPath = path.join(runDir, "abstraction_input.json");
    const behaviorEvidencePath = path.join(runDir, "behavior_evidence.json");
    const behaviorWorkflowPath = path.join(runDir, "behavior_workflow.json");
    const semanticIntentDraftPath = path.join(runDir, "semantic_intent_draft.json");
    const semanticIntentRawPath = path.join(runDir, "semantic_intent_raw.txt");
    const observedExamplesPath = path.join(runDir, "observed_examples.json");
    const clarificationQuestionsPath = path.join(runDir, "clarification_questions.json");
    const intentResolutionPath = path.join(runDir, "intent_resolution.json");
    const frozenSemanticIntentPath = path.join(runDir, "frozen_semantic_intent.json");
    const executionGuidePath = path.join(runDir, "execution_guide.json");
    const compactManifestPath = path.join(runDir, "compact_manifest.json");

    const trace = await this.readTrace(sourceTracePath);
    const built = this.ruleBuilder.build(trace);
    const abstractionBuilder = new SopIntentAbstractionBuilder();
    const generatedAt = new Date().toISOString();
    const { abstractionInput } = abstractionBuilder.buildEvidenceInput(runId, trace, built, generatedAt);
    const { behaviorEvidence, behaviorWorkflow } = abstractionBuilder.buildBehaviorArtifactsFromEvidence(abstractionInput, trace);
    const semantic = await new SopSemanticRunner(this.semanticOptions).run({
      runId,
      trace,
      built,
      guidePath: semanticGuidePath,
    });
    const intentResolution = await this.readIntentResolution(intentResolutionPath);
    const initialAbstraction = abstractionBuilder.build({
      runId,
      trace,
      built,
      generatedAt,
      intentResolution,
    });
    const semanticIntent = await new SopSemanticIntentRunner(this.semanticOptions).run({
      runId,
      traceId: trace.traceId,
      rawTask: trace.taskHint,
      behaviorEvidence,
      behaviorWorkflow,
      observedExamples: initialAbstraction.observedExamples,
    });
    const semanticIntentDraft =
      semanticIntent.draft
        ? {
            ...semanticIntent.draft,
            noiseObservations: abstractionInput.noiseObservations.map((item) => item.id),
          }
        : undefined;
    const abstraction = abstractionBuilder.build({
      runId,
      trace,
      built,
      generatedAt,
      intentResolution,
      semanticIntentDraft,
    });

    await this.persistSemanticOutputs(runDir, runId, semantic, semanticIntent);
    await writeFile(abstractionInputPath, `${JSON.stringify(abstraction.abstractionInput, null, 2)}\n`, "utf-8");
    await writeFile(behaviorEvidencePath, `${JSON.stringify(behaviorEvidence, null, 2)}\n`, "utf-8");
    await writeFile(behaviorWorkflowPath, `${JSON.stringify(behaviorWorkflow, null, 2)}\n`, "utf-8");
    await this.syncOptionalJson(semanticIntentDraftPath, semanticIntentDraft);
    await this.syncOptionalText(semanticIntentRawPath, semanticIntent.rawText);
    await writeFile(observedExamplesPath, `${JSON.stringify(abstraction.observedExamples, null, 2)}\n`, "utf-8");
    await this.syncOptionalJson(clarificationQuestionsPath, abstraction.clarificationQuestions);
    await this.syncOptionalJson(frozenSemanticIntentPath, abstraction.frozenSemanticIntent);
    await writeFile(executionGuidePath, `${JSON.stringify(abstraction.executionGuide, null, 2)}\n`, "utf-8");
    await writeFile(compactManifestPath, `${JSON.stringify(abstraction.manifest, null, 2)}\n`, "utf-8");
    await this.cleanupLegacyArtifacts(runDir);

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
      behaviorEvidencePath,
      behaviorWorkflowPath,
      semanticIntentDraftPath: semanticIntentDraft ? semanticIntentDraftPath : undefined,
      semanticIntentRawPath: semanticIntent.rawText ? semanticIntentRawPath : undefined,
      observedExamplesPath,
      clarificationQuestionsPath: abstraction.clarificationQuestions ? clarificationQuestionsPath : undefined,
      intentResolutionPath: intentResolution ? intentResolutionPath : undefined,
      frozenSemanticIntentPath: abstraction.frozenSemanticIntent ? frozenSemanticIntentPath : undefined,
      executionGuidePath,
      compactManifestPath,
      status: abstraction.manifest.status,
      semanticMode: semantic.mode,
      semanticFallback: semantic.fallback,
      semanticGuidePath: semantic.guidePath,
      semanticIntentFallback: semanticIntent.fallback,
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
    semanticIntent: SemanticIntentDraftOutcome
  ): Promise<void> {
    if (semantic.guidePath && semantic.guideMarkdown) {
      await writeFile(semantic.guidePath, semantic.guideMarkdown, "utf-8");
    }
    if (semanticIntent.mode !== "off") {
      if (!semanticIntent.fallback) {
        await this.appendRuntimeLog(runDir, "INFO", "semantic_intent_draft_succeeded", {
          runId,
          mode: semanticIntent.mode,
          model: semanticIntent.model,
          provider: semanticIntent.provider,
          stopReason: semanticIntent.stopReason,
        });
      } else {
        await this.appendRuntimeLog(runDir, "WARN", "semantic_intent_draft_fallback", {
          runId,
          mode: semanticIntent.mode,
          reason: semanticIntent.error,
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

  private async syncOptionalJson(filePath: string, value: unknown): Promise<void> {
    if (value === undefined) {
      await this.removeIfExists(filePath);
      return;
    }
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  }

  private async syncOptionalText(filePath: string, value: string | undefined): Promise<void> {
    if (!value?.trim()) {
      await this.removeIfExists(filePath);
      return;
    }
    await writeFile(filePath, `${value.trim()}\n`, "utf-8");
  }

  private async cleanupLegacyArtifacts(runDir: string): Promise<void> {
    await Promise.all(
      LEGACY_ARTIFACT_NAMES.map((artifactName) => this.removeIfExists(path.join(runDir, artifactName)))
    );
  }

  private async removeIfExists(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch {
      // Ignore missing files so re-runs can converge artifacts idempotently.
    }
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
