/**
 * Deps: core/agent-loop.ts, runtime/artifacts-writer.ts, runtime/replay-refinement/*
 * Used By: runtime/workflow-runtime.ts
 * Last Updated: 2026-03-13
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { HitlController } from "../../contracts/hitl-controller.js";
import type { Logger } from "../../contracts/logger.js";
import type { AgentLoop } from "../../core/agent-loop.js";
import { JsonModelClient } from "../../core/json-model-client.js";
import type {
  AgentRunRequest,
  AgentRunResult,
  AgentStepRecord,
  AssistantTurnRecord,
  McpCallRecord,
} from "../../domain/agent-types.js";
import type { CompactCapabilityOutput } from "../../domain/compact-reasoning.js";
import type {
  PromotedKnowledgeRecord,
  RefinementSnapshotIndexRecord,
  RefinementStepRecord,
} from "../../domain/refinement-knowledge.js";
import { ArtifactsWriter } from "../artifacts-writer.js";
import { CoreConsumptionFilter, type CoreConsumptionBundle } from "./core-consumption-filter.js";
import {
  DefaultBrowserOperatorGateway,
  type BrowserOperatorTurnInput,
  type BrowserOperatorTurnResult,
  type BrowserSnapshotRef,
} from "./browser-operator-gateway.js";
import {
  OnlineRefinementOrchestrator,
  type OnlineRefinementRunResult,
} from "./online-refinement-orchestrator.js";
import { RefinementHitlLoop } from "./refinement-hitl-loop.js";
import {
  DefaultRefinementDecisionEngine,
  type RefinementDecisionAudit,
} from "./refinement-decision-engine.js";
import { RefinementMemoryStore, canonicalizeSurfaceKey, canonicalizeTaskKey } from "./refinement-memory-store.js";

interface RuntimeLogBuffer extends Logger {
  toText(): string;
}

export interface OnlineRefinementRunExecutorOptions {
  loop: AgentLoop;
  logger: RuntimeLogBuffer;
  artifactsDir: string;
  createRunId: () => string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  maxRounds: number;
  tokenBudget: number;
  knowledgeTopN: number;
  hitlController?: HitlController;
}

interface ActiveRefinementRunState {
  runId: string;
  sessionId: string;
  artifacts: ArtifactsWriter;
  snapshotCaptureSeq: number;
  turns: BrowserOperatorTurnResult[];
  snapshotIndex: RefinementSnapshotIndexRecord[];
  promotedKnowledge: PromotedKnowledgeRecord[];
  decisionAudits: Record<string, RefinementDecisionAudit>;
  steps: AgentStepRecord[];
  mcpCalls: McpCallRecord[];
  assistantTurns: AssistantTurnRecord[];
}

interface CapabilityResolution {
  capabilityOutput: CompactCapabilityOutput;
  source: "pinned" | "generated";
  path?: string;
}

export class OnlineRefinementRunExecutor {
  private readonly loop: AgentLoop;
  private readonly logger: RuntimeLogBuffer;
  private readonly artifactsDir: string;
  private readonly createRunId: () => string;
  private readonly maxRounds: number;
  private readonly tokenBudget: number;
  private readonly knowledgeTopN: number;
  private readonly modelClient: JsonModelClient;
  private readonly memoryStore: RefinementMemoryStore;
  private readonly consumptionFilter: CoreConsumptionFilter;
  private readonly hitlLoop: RefinementHitlLoop;
  private activeRun: ActiveRefinementRunState | null = null;
  private flushPromise: Promise<void> | null = null;

  constructor(options: OnlineRefinementRunExecutorOptions) {
    this.loop = options.loop;
    this.logger = options.logger;
    this.artifactsDir = options.artifactsDir;
    this.createRunId = options.createRunId;
    this.maxRounds = Math.max(1, options.maxRounds);
    this.tokenBudget = Math.max(1, options.tokenBudget);
    this.knowledgeTopN = Math.max(1, options.knowledgeTopN);
    this.modelClient = new JsonModelClient({
      model: options.model,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      timeoutMs: 30000,
      thinkingLevel: options.thinkingLevel,
    });
    this.memoryStore = new RefinementMemoryStore({
      defaultTopN: this.knowledgeTopN,
    });
    this.consumptionFilter = new CoreConsumptionFilter({
      defaultTokenBudget: this.tokenBudget,
    });
    this.hitlLoop = new RefinementHitlLoop({
      logger: this.logger,
      controller: options.hitlController,
    });
  }

  async execute(request: AgentRunRequest): Promise<AgentRunResult> {
    const runId = this.createRunId();
    const sessionId = `refine_${runId}`;
    const artifacts = new ArtifactsWriter(this.artifactsDir, runId);
    await artifacts.ensureDir();
    await artifacts.initializeRefinementArtifacts();

    this.activeRun = {
      runId,
      sessionId,
      artifacts,
      snapshotCaptureSeq: 0,
      turns: [],
      snapshotIndex: [],
      promotedKnowledge: [],
      decisionAudits: {},
      steps: [],
      mcpCalls: [],
      assistantTurns: [],
    };

    let resolvedTask = request.task.trim();
    this.logger.info("refinement_run_started", {
      runId,
      sessionId,
      task: resolvedTask,
      sopRunId: request.sopRunId,
      artifactsDir: artifacts.runDir,
    });

    try {
      const capability = await this.resolveCapabilityOutput(request, runId);
      resolvedTask = this.resolveTask(request.task, capability.capabilityOutput.taskUnderstanding);
      const surfaceKey = this.resolveSurfaceKey(resolvedTask);
      const taskKey = this.resolveTaskKey(resolvedTask);
      const loadedKnowledge = await this.memoryStore.queryBySurfaceTask({
        surfaceKey,
        taskKey,
        topN: this.knowledgeTopN,
      });
      const compiledBundle = this.consumptionFilter.compile({
        task: resolvedTask,
        capabilityOutput: capability.capabilityOutput,
        tokenBudget: this.tokenBudget,
        knowledgeRecords: loadedKnowledge,
      });
      await artifacts.writeConsumptionBundle(compiledBundle.bundle);

      this.logger.info("refinement_bundle_compiled", {
        runId,
        sessionId,
        capabilitySource: capability.source,
        capabilityPath: capability.path,
        surfaceKey,
        taskKey,
        tokenBudget: compiledBundle.bundle.tokenBudget,
        tokenEstimate: compiledBundle.bundle.tokenEstimate,
        knowledgeLoadedCount: loadedKnowledge.length,
        selectedKnowledgeIds: compiledBundle.selectedKnowledgeIds,
      });

      const decisionEngine = this.createDecisionEngine();
      const operatorGateway = new DefaultBrowserOperatorGateway({
        logger: this.logger,
        runOperation: (input) => this.runOperatorTurn(input, compiledBundle.bundle),
      });
      const orchestrator = new OnlineRefinementOrchestrator({
        logger: this.logger,
        operatorGateway,
        hitlLoop: this.hitlLoop,
        decisionEngine,
        isGoalAchieved: (turn, evaluation) =>
          evaluation.outcome === "progress" &&
          /save|saved|success|completed|完成|保存|草稿/i.test(
            `${turn.resultExcerpt} ${turn.afterSnapshot?.summary ?? ""}`,
          ),
      });

      const orchestration = await orchestrator.run({
        runId,
        sessionId,
        task: resolvedTask,
        surfaceKey,
        taskKey,
        bundleSource: compiledBundle.bundleSource,
        loadedKnowledgeIds: compiledBundle.selectedKnowledgeIds,
        consumptionBundle: compiledBundle.bundle as unknown as Record<string, unknown>,
        maxRounds: this.maxRounds,
      });

      await this.promoteDecisionKnowledge(decisionEngine, surfaceKey, taskKey);

      const finalScreenshotPath = await this.captureFinalScreenshot(orchestration.status);
      await this.persistArtifacts();
      const result = this.buildRunResult(resolvedTask, orchestration, finalScreenshotPath);
      this.logger.info("refinement_run_finished", {
        runId,
        sessionId,
        status: result.status,
        finishReason: result.finishReason,
        rounds: orchestration.rounds,
        stepCount: this.activeRun?.steps.length ?? 0,
        refinementStepCount: this.activeRun?.turns.length ?? 0,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("refinement_run_failed", {
        runId,
        sessionId,
        error: message,
      });
      await this.flushInProgressArtifacts("run_failed");
      throw error;
    } finally {
      if (this.activeRun) {
        await this.activeRun.artifacts.writeRuntimeLog(this.logger.toText());
      }
      this.activeRun = null;
    }
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean> {
    if (!this.activeRun) {
      return false;
    }
    this.logger.warn("refinement_interrupt_requested", {
      signal: signalName,
      runId: this.activeRun.runId,
      sessionId: this.activeRun.sessionId,
    });
    this.loop.abort(`signal:${signalName}`);
    await this.flushInProgressArtifacts("interrupt_requested");
    return true;
  }

  private createDecisionEngine(): DefaultRefinementDecisionEngine {
    return new DefaultRefinementDecisionEngine({
      logger: this.logger,
      modelClient: this.modelClient,
    });
  }

  private async promoteDecisionKnowledge(
    decisionEngine: DefaultRefinementDecisionEngine,
    surfaceKey: string,
    taskKey: string,
  ): Promise<void> {
    const activeRun = this.requireActiveRun();
    const audits = decisionEngine.listDecisionAudits();
    for (const audit of audits) {
      activeRun.decisionAudits[audit.toolCallId] = audit;
    }

    for (let index = 0; index < activeRun.turns.length; index += 1) {
      const turn = activeRun.turns[index];
      const stepIndex = index + 1;
      const audit = activeRun.decisionAudits[turn.toolCallId];
      if (!audit?.promote || audit.promote.result.promoteDecision !== "promote") {
        continue;
      }

      const finalKnowledge =
        audit.promote.finalKnowledge.length > 0 ? audit.promote.finalKnowledge : (audit.evaluate?.candidateKnowledge ?? []);
      for (const candidate of finalKnowledge) {
        const normalizedSurfaceKey = candidate.surfaceKey.trim() || surfaceKey;
        const normalizedTaskKey = candidate.taskKey.trim() || taskKey;
        const provenanceHash = turn.afterSnapshot?.snapshotHash ?? this.hashText(turn.afterSnapshot?.summary ?? "");
        try {
          const stored = await this.memoryStore.upsert({
            knowledgeType: candidate.knowledgeType,
            surfaceKey: normalizedSurfaceKey,
            taskKey: normalizedTaskKey,
            instruction: candidate.instruction,
            sourceStepIds: [`${turn.pageId}#step${stepIndex}`],
            confidence: audit.promote.result.confidence,
            rationale: audit.promote.result.rationale,
            criticChallenge: [...audit.criticChallenge],
            finalDecision: audit.promote.result.promoteDecision,
            status: "active",
            provenance: {
              runId: activeRun.runId,
              pageId: turn.pageId,
              stepIndex,
              snapshot_hash: provenanceHash,
            },
          });
          activeRun.promotedKnowledge.push(stored);
        } catch (error) {
          this.logger.warn("refinement_knowledge_promote_failed", {
            runId: activeRun.runId,
            sessionId: activeRun.sessionId,
            stepIndex,
            toolCallId: turn.toolCallId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  private async runOperatorTurn(
    input: BrowserOperatorTurnInput,
    bundle: CoreConsumptionBundle
  ): Promise<BrowserOperatorTurnResult> {
    const beforeSnapshot = await this.captureSnapshotRef(input, "before");
    const loopTask = this.composeTaskForLoop(input, bundle);
    this.loop.setToolHookContext({
      runId: input.runId,
      sessionId: input.sessionId,
      pageId: input.pageStepId,
      stepIndex: input.stepIndex,
    });
    const loopResult = await this.loop.run(loopTask, {
      stopAfterFirstToolExecutionEnd: true,
    });
    this.mergeLoopResult(loopResult);
    const afterSnapshot = await this.captureSnapshotRef(input, "after");
    const lastCall = this.pickLastCall(loopResult.mcpCalls);

    const turnResult: BrowserOperatorTurnResult = {
      pageId: input.pageStepId,
      toolCallId: lastCall?.toolCallId ?? `${input.sessionId}_${input.stepIndex}_loop`,
      toolName: lastCall?.toolName ?? "agent_loop",
      toolArgs: { ...(lastCall?.args ?? {}) },
      resultExcerpt: this.resultExcerpt(loopResult, lastCall),
      outcome: this.deriveOutcome(loopResult),
      beforeSnapshot,
      afterSnapshot,
      elementHints: this.extractElementHints(lastCall?.args ?? {}),
      humanInterventionNote: [],
    };

    this.requireActiveRun().turns.push(turnResult);
    return turnResult;
  }

  private composeTaskForLoop(input: BrowserOperatorTurnInput, bundle: CoreConsumptionBundle): string {
    const sections: string[] = [];
    const primaryTask = input.task.trim();
    if (primaryTask) {
      sections.push(primaryTask);
    }
    sections.push("Online refinement context:");
    sections.push(`Capability summary: ${bundle.capabilitySummary}`);

    if (bundle.surfaceScopedKnowledge.length > 0) {
      sections.push(
        `Surface knowledge:\n${bundle.surfaceScopedKnowledge
          .slice(0, 8)
          .map((item, index) => `${index + 1}. ${item}`)
          .join("\n")}`
      );
    }
    if (bundle.activeGuards.length > 0) {
      sections.push(`Guards:\n${bundle.activeGuards.map((item, index) => `${index + 1}. ${item}`).join("\n")}`);
    }
    if (bundle.negativeHints.length > 0) {
      sections.push(`Avoid:\n${bundle.negativeHints.map((item, index) => `${index + 1}. ${item}`).join("\n")}`);
    }
    if (Array.isArray(input.selectedKnowledgeIds) && input.selectedKnowledgeIds.length > 0) {
      sections.push(`Selected knowledge IDs: ${input.selectedKnowledgeIds.join(", ")}`);
    }
    return sections.join("\n\n").trim();
  }

  private async captureSnapshotRef(
    input: BrowserOperatorTurnInput,
    phase: "before" | "after"
  ): Promise<BrowserSnapshotRef> {
    const activeRun = this.requireActiveRun();
    const captureSeq = activeRun.snapshotCaptureSeq + 1;
    activeRun.snapshotCaptureSeq = captureSeq;
    const summaryText = (await this.loop.captureObservationSummary()).trim() || "[empty snapshot summary]";
    const snapshotHash = this.hashText(summaryText);
    const snapshotId = `${input.sessionId}_${input.stepIndex}_${phase}_${captureSeq}`;
    const relativePath = path.join("snapshots", `${input.pageStepId}_step${input.stepIndex}_${phase}_${captureSeq}.md`);
    const absolutePath = path.join(activeRun.artifacts.runDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${summaryText}\n`, "utf-8");

    const now = new Date().toISOString();
    activeRun.snapshotIndex.push({
      schemaVersion: "snapshot_index.v0",
      snapshotId,
      runId: input.runId,
      pageId: input.pageStepId,
      stepIndex: input.stepIndex,
      phase,
      path: relativePath,
      snapshotHash,
      charCount: summaryText.length,
      tokenEstimate: Math.ceil(summaryText.length / 4),
      capturedAt: now,
    });

    return {
      snapshotId,
      path: relativePath,
      summary: summaryText,
      snapshotHash,
    };
  }

  private mergeLoopResult(loopResult: AgentRunResult): void {
    const activeRun = this.requireActiveRun();
    const stepOffset = activeRun.steps.length;
    const callOffset = activeRun.mcpCalls.length;
    const turnOffset = activeRun.assistantTurns.length;

    loopResult.steps.forEach((step, index) => {
      activeRun.steps.push({
        ...step,
        stepIndex: stepOffset + index + 1,
      });
    });
    loopResult.mcpCalls.forEach((call, index) => {
      activeRun.mcpCalls.push({
        ...call,
        index: callOffset + index + 1,
      });
    });
    loopResult.assistantTurns.forEach((turn, index) => {
      activeRun.assistantTurns.push({
        ...turn,
        index: turnOffset + index + 1,
      });
    });
  }

  private deriveOutcome(loopResult: AgentRunResult): BrowserOperatorTurnResult["outcome"] {
    const lastStep = loopResult.steps.length > 0 ? loopResult.steps[loopResult.steps.length - 1] : undefined;
    if (!lastStep) {
      return loopResult.status === "failed" ? "blocked" : "info_only";
    }
    if (!lastStep.progressed || loopResult.status === "failed") {
      return "blocked";
    }
    if (lastStep.action === "navigate" || lastStep.toolName === "browser_navigate" || lastStep.toolName === "browser_navigate_back") {
      return "page_changed";
    }
    if (loopResult.status === "stalled" || loopResult.status === "max_steps") {
      return "no_progress";
    }
    return "progress";
  }

  private pickLastCall(calls: McpCallRecord[]): McpCallRecord | undefined {
    for (let index = calls.length - 1; index >= 0; index -= 1) {
      if (calls[index].phase === "end") {
        return calls[index];
      }
    }
    return calls.length > 0 ? calls[calls.length - 1] : undefined;
  }

  private resultExcerpt(loopResult: AgentRunResult, lastCall: McpCallRecord | undefined): string {
    const fromCall = lastCall?.resultExcerpt?.trim();
    if (fromCall) {
      return fromCall;
    }
    const fromFinishReason = loopResult.finishReason?.trim();
    return fromFinishReason || "loop finished";
  }

  private extractElementHints(
    args: Record<string, unknown>
  ): BrowserOperatorTurnResult["elementHints"] | undefined {
    const ref = this.readString(args.ref);
    const selector = this.readString(args.selector);
    const text = this.readString(args.text) ?? this.readString(args.textHint);
    const role = this.readString(args.role);
    if (!ref && !selector && !text && !role) {
      return undefined;
    }
    return {
      ref,
      selector,
      text,
      role,
    };
  }

  private buildRunResult(
    resolvedTask: string,
    orchestration: OnlineRefinementRunResult,
    finalScreenshotPath: string | undefined
  ): AgentRunResult {
    const activeRun = this.requireActiveRun();
    const { status, finishReason } = this.mapRunStatus(orchestration);
    return {
      runId: activeRun.runId,
      artifactsDir: activeRun.artifacts.runDir,
      task: resolvedTask,
      status,
      finishReason,
      steps: activeRun.steps,
      mcpCalls: activeRun.mcpCalls,
      assistantTurns: activeRun.assistantTurns,
      finalScreenshotPath,
    };
  }

  private mapRunStatus(orchestration: OnlineRefinementRunResult): Pick<AgentRunResult, "status" | "finishReason"> {
    if (orchestration.status === "failed") {
      return {
        status: "failed",
        finishReason: `online_refinement:${orchestration.endReason}`,
      };
    }
    if (orchestration.status === "stopped") {
      return {
        status: "stalled",
        finishReason: `online_refinement:${orchestration.endReason}`,
      };
    }
    if (orchestration.endReason === "max_round_reached") {
      return {
        status: "max_steps",
        finishReason: "online_refinement:max_round_reached",
      };
    }
    return {
      status: "completed",
      finishReason: `online_refinement:${orchestration.endReason}`,
    };
  }

  private async captureFinalScreenshot(orchestrationStatus: OnlineRefinementRunResult["status"]): Promise<string | undefined> {
    if (orchestrationStatus === "failed") {
      return undefined;
    }
    const activeRun = this.requireActiveRun();
    return this.loop.captureFinalScreenshot(activeRun.artifacts.finalScreenshotPath());
  }

  private async persistArtifacts(): Promise<void> {
    const activeRun = this.requireActiveRun();
    const refinementSteps = activeRun.turns.map((turn, index) => this.toRefinementStepRecord(turn, index + 1));
    await Promise.all([
      activeRun.artifacts.writeSteps(activeRun.steps),
      activeRun.artifacts.writeMcpCalls(activeRun.mcpCalls),
      activeRun.artifacts.writeAssistantTurns(activeRun.assistantTurns),
      activeRun.artifacts.writeRefinementSteps(refinementSteps),
      activeRun.artifacts.writeSnapshotIndex(activeRun.snapshotIndex),
      activeRun.artifacts.writeRefinementKnowledge(activeRun.promotedKnowledge),
    ]);
  }

  private toRefinementStepRecord(turn: BrowserOperatorTurnResult, stepIndex: number): RefinementStepRecord {
    const activeRun = this.requireActiveRun();
    const audit = activeRun.decisionAudits[turn.toolCallId];
    const evaluate = audit?.evaluate?.result;
    const beforeSnapshot = this.normalizeSnapshotRef(turn.beforeSnapshot, `missing_before_${stepIndex}`);
    const afterSnapshot = this.normalizeSnapshotRef(turn.afterSnapshot, `missing_after_${stepIndex}`);
    return {
      schemaVersion: "refinement_step_record.v0",
      runId: activeRun.runId,
      sessionId: activeRun.sessionId,
      stepIndex,
      recordUnit: "tool_call",
      pageStepId: turn.pageId,
      toolCallId: turn.toolCallId,
      operationIndexWithinPageStep: 1,
      pageBoundaryReason: turn.outcome === "page_changed" ? "url_change" : undefined,
      pageId: turn.pageId,
      beforeSnapshot,
      afterSnapshot,
      assistantIntent: evaluate?.assistantIntent ?? `Execute ${turn.toolName} for ${turn.pageId}`,
      toolName: turn.toolName,
      toolArgs: { ...turn.toolArgs },
      resultExcerpt: turn.resultExcerpt,
      elementHints: turn.elementHints,
      outcome: evaluate?.outcome ?? turn.outcome,
      relevance: evaluate?.relevance ?? (turn.outcome === "progress" || turn.outcome === "page_changed" ? "task_relevant" : "unknown"),
      human_intervention_note: turn.humanInterventionNote ?? [],
      snapshot_mode: "summary_fallback",
    };
  }

  private normalizeSnapshotRef(snapshot: BrowserSnapshotRef | undefined, fallbackId: string): RefinementStepRecord["beforeSnapshot"] {
    const summary = snapshot?.summary ?? "";
    return {
      snapshotId: snapshot?.snapshotId ?? fallbackId,
      path: snapshot?.path ?? "",
      summary,
      snapshot_hash: snapshot?.snapshotHash ?? this.hashText(summary),
    };
  }

  private async flushInProgressArtifacts(reason: string): Promise<void> {
    if (!this.activeRun) {
      return;
    }
    if (this.flushPromise) {
      await this.flushPromise;
      return;
    }
    this.flushPromise = this.persistArtifacts()
      .catch((error) => {
        this.logger.error("refinement_artifacts_flush_failed", {
          runId: this.activeRun?.runId,
          sessionId: this.activeRun?.sessionId,
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        this.flushPromise = null;
      });
    await this.flushPromise;
  }

  private async resolveCapabilityOutput(request: AgentRunRequest, runId: string): Promise<CapabilityResolution> {
    const pinnedRunId = request.sopRunId?.trim();
    if (pinnedRunId) {
      const candidates = this.buildCapabilityPathCandidates(pinnedRunId);
      for (const capabilityPath of candidates) {
        try {
          const raw = await readFile(capabilityPath, "utf-8");
          const parsed: unknown = JSON.parse(raw);
          if (this.isCompactCapabilityOutput(parsed)) {
            return {
              capabilityOutput: parsed,
              source: "pinned",
              path: capabilityPath,
            };
          }
          this.logger.warn("refinement_capability_invalid_schema", {
            runId,
            pinnedRunId,
            capabilityPath,
          });
        } catch (error) {
          this.logger.warn("refinement_capability_load_failed", {
            runId,
            pinnedRunId,
            capabilityPath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    return {
      capabilityOutput: this.buildFallbackCapabilityOutput(request.task, pinnedRunId, runId),
      source: "generated",
    };
  }

  private buildCapabilityPathCandidates(pinnedRunId: string): string[] {
    const filename = "compact_capability_output.json";
    const candidates = [
      path.join(this.artifactsDir, pinnedRunId, filename),
      path.resolve(process.cwd(), "artifacts", "e2e", pinnedRunId, filename),
      path.resolve(process.cwd(), "..", "..", "artifacts", "e2e", pinnedRunId, filename),
    ];
    const seen = new Set<string>();
    const output: string[] = [];
    for (const candidate of candidates) {
      const normalized = path.resolve(candidate);
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      output.push(normalized);
    }
    return output;
  }

  private buildFallbackCapabilityOutput(task: string, pinnedRunId: string | undefined, runId: string): CompactCapabilityOutput {
    const normalizedTask = task.trim() || "Complete the requested browser task.";
    return {
      schemaVersion: "compact_capability_output.v0",
      runId: pinnedRunId ?? runId,
      taskUnderstanding: normalizedTask,
      workflowSkeleton: [normalizedTask],
      decisionStrategy: [
        "Observe current page state before each action.",
        "Prefer actions that directly advance the user goal.",
        "Verify visible completion signal before finishing.",
      ],
      actionPolicy: {
        requiredActions: [normalizedTask],
        optionalActions: [],
        conditionalActions: [],
        nonCoreActions: [],
      },
      stopPolicy: ["Stop after observing a stable completion signal."],
      reuseBoundary: {
        applicableWhen: [normalizedTask],
        notApplicableWhen: [],
        contextDependencies: [],
      },
      remainingUncertainties: [],
    };
  }

  private isCompactCapabilityOutput(value: unknown): value is CompactCapabilityOutput {
    if (!value || typeof value !== "object") {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
      candidate.schemaVersion === "compact_capability_output.v0" &&
      typeof candidate.runId === "string" &&
      typeof candidate.taskUnderstanding === "string" &&
      Array.isArray(candidate.workflowSkeleton) &&
      Array.isArray(candidate.decisionStrategy) &&
      this.isRecord(candidate.actionPolicy) &&
      this.isRecord(candidate.reuseBoundary) &&
      Array.isArray(candidate.stopPolicy) &&
      Array.isArray(candidate.remainingUncertainties)
    );
  }

  private resolveTask(taskFromRequest: string, taskFromCapability: string): string {
    const fromRequest = taskFromRequest.trim();
    if (fromRequest) {
      return fromRequest;
    }
    const fromCapability = taskFromCapability.trim();
    if (fromCapability) {
      return fromCapability;
    }
    return "Complete the current browser workflow.";
  }

  private resolveSurfaceKey(task: string): string {
    const normalizedTask = task.toLowerCase();
    if (normalizedTask.includes("xiaohongshu") || normalizedTask.includes("小红书")) {
      return "xiaohongshu.creator";
    }
    if (normalizedTask.includes("linkedin")) {
      return "linkedin.feed";
    }
    const canonical = canonicalizeSurfaceKey("generic.web");
    return canonical || "generic.web";
  }

  private resolveTaskKey(task: string): string {
    const canonical = canonicalizeTaskKey(task);
    if (canonical) {
      return canonical;
    }
    return canonicalizeTaskKey("generic online refinement task");
  }

  private hashText(input: string): string {
    return `sha256:${createHash("sha256").update(input, "utf-8").digest("hex")}`;
  }

  private readString(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private requireActiveRun(): ActiveRefinementRunState {
    if (!this.activeRun) {
      throw new Error("online refinement run is not active");
    }
    return this.activeRun;
  }
}
