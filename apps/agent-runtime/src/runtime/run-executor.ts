/**
 * Deps: core/agent-loop.ts, domain/agent-types.ts, domain/high-level-log.ts, domain/intervention-learning.ts, domain/sop-consumption.ts, contracts/*
 * Used By: runtime/workflow-runtime.ts
 * Last Updated: 2026-03-06
 */
import type { AgentLoop, AgentLoopProgressSnapshot } from "../core/agent-loop.js";
import type { HitlController } from "../contracts/hitl-controller.js";
import type { Logger } from "../contracts/logger.js";
import type {
  AgentRunRequest,
  AgentRunResult,
  AgentStepRecord,
  AssistantTurnRecord,
  McpCallRecord,
} from "../domain/agent-types.js";
import type { HighLevelLogEntry, HighLevelLogSource, HighLevelLogStage, HighLevelLogStatus } from "../domain/high-level-log.js";
import type {
  HitlInterventionResponse,
  InterventionIssueType,
  InterventionLearningContext,
  InterventionLearningRecord,
} from "../domain/intervention-learning.js";
import type { SopConsumptionRecord, SopConsumptionResult } from "../domain/sop-consumption.js";
import { ArtifactsWriter } from "./artifacts-writer.js";
import type { LegacyRunBootstrapProvider } from "./providers/legacy-run-bootstrap-provider.js";

interface RuntimeLogBuffer extends Logger {
  toText(): string;
}

interface ActiveRunState {
  runId: string;
  artifacts: ArtifactsWriter;
  runtimeHighLevelLogs: HighLevelLogEntry[];
  cumulativeSteps: AgentStepRecord[];
  cumulativeMcpCalls: McpCallRecord[];
  cumulativeAssistantTurns: AssistantTurnRecord[];
  cumulativeLoopHighLevelLogs: HighLevelLogEntry[];
  latestLoopSnapshotCommitted: boolean;
}

interface AttemptOutcome {
  result: AgentRunResult;
  snapshot: AgentLoopProgressSnapshot;
}

interface AggregatedSnapshot extends AgentLoopProgressSnapshot {
  highLevelLogs: HighLevelLogEntry[];
}

export interface RunExecutorOptions {
  loop: AgentLoop;
  logger: RuntimeLogBuffer;
  artifactsDir: string;
  createRunId: () => string;
  bootstrapProvider?: LegacyRunBootstrapProvider;
  hitlController?: HitlController;
  hitlRetryLimit?: number;
  hitlMaxInterventions?: number;
}

export class RunExecutor {
  private readonly loop: AgentLoop;
  private readonly logger: RuntimeLogBuffer;
  private readonly artifactsDir: string;
  private readonly createRunId: () => string;
  private readonly bootstrapProvider?: LegacyRunBootstrapProvider;
  private readonly hitlController?: HitlController;
  private readonly hitlRetryLimit: number;
  private readonly hitlMaxInterventions: number;
  private activeRun: ActiveRunState | null = null;
  private flushPromise: Promise<void> | null = null;

  constructor(options: RunExecutorOptions) {
    this.loop = options.loop;
    this.logger = options.logger;
    this.artifactsDir = options.artifactsDir;
    this.createRunId = options.createRunId;
    this.bootstrapProvider = options.bootstrapProvider;
    this.hitlController = options.hitlController;
    this.hitlRetryLimit = Math.max(0, options.hitlRetryLimit ?? 2);
    this.hitlMaxInterventions = Math.max(0, options.hitlMaxInterventions ?? 1);
  }

  async execute(request: AgentRunRequest): Promise<AgentRunResult> {
    const runId = this.createRunId();
    const artifacts = new ArtifactsWriter(this.artifactsDir, runId);
    await artifacts.ensureDir();
    this.activeRun = {
      runId,
      artifacts,
      runtimeHighLevelLogs: [],
      cumulativeSteps: [],
      cumulativeMcpCalls: [],
      cumulativeAssistantTurns: [],
      cumulativeLoopHighLevelLogs: [],
      latestLoopSnapshotCommitted: true,
    };
    const task = request.task.trim();
    const sopRunId = request.sopRunId?.trim();
    this.logger.info("run_started", { runId, task, sopRunId, artifactsDir: artifacts.runDir });

    let loopStarted = false;
    try {
      const consumption: SopConsumptionResult = this.bootstrapProvider
        ? await this.bootstrapProvider.prepare(request)
        : {
            taskForLoop: task,
            record: {
              enabled: false,
              originalTask: task,
              taskSource: "request",
              injected: false,
              selectionMode: sopRunId ? "pinned" : "none",
              pinnedRunId: sopRunId,
              candidateAssetIds: [],
              candidateCount: 0,
              guideSource: "none",
              fallbackUsed: true,
              fallbackReason: "consumption_not_configured",
              usedHints: [],
              generatedAt: new Date().toISOString(),
            },
          };
      await artifacts.writeSopConsumption(consumption.record);
      this.logConsumption(runId, consumption.record);
      if (!consumption.taskForLoop.trim()) {
        throw new Error("run task is empty after SOP consumption resolution");
      }

      loopStarted = true;
      const result = await this.executeWithRecovery(consumption);
      this.activeRun.runtimeHighLevelLogs.push(this.createRunOutcomeHighLevelLog(result));
      await this.persistCurrentArtifacts("run_finished");
      this.logger.info("run_finished", this.runFinishedPayload(result));
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("run_failed", { runId, error: errorMessage });
      if (this.activeRun) {
        this.activeRun.runtimeHighLevelLogs.push(
          this.createRuntimeHighLevelLog({
            stage: "result",
            status: "error",
            source: "runtime",
            summary: `Run failed: ${errorMessage}`,
            detail: errorMessage,
            data: {
              loopStarted,
            },
          })
        );
      }
      await this.flushInProgressArtifacts("run_failed", loopStarted);
      throw error;
    } finally {
      await artifacts.writeRuntimeLog(this.logger.toText());
      this.activeRun = null;
    }
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean> {
    if (!this.activeRun) {
      return false;
    }
    this.logger.warn("run_interrupt_requested", {
      signal: signalName,
      runId: this.activeRun.runId,
    });
    this.activeRun.runtimeHighLevelLogs.push(
      this.createRuntimeHighLevelLog({
        stage: "intervention",
        status: "warning",
        source: "human",
        summary: `Human interrupt requested via ${signalName}`,
        data: {
          signal: signalName,
        },
      })
    );
    this.loop.abort(`signal:${signalName}`);
    await this.flushInProgressArtifacts("interrupt_requested", false);
    return true;
  }

  private async executeWithRecovery(consumption: SopConsumptionResult): Promise<AgentRunResult> {
    const originalTask = consumption.record.originalTask;
    let currentTask = consumption.taskForLoop;
    let attempt = 1;
    let interventions = 0;

    while (true) {
      const attemptOutcome = await this.runAttempt(currentTask, originalTask);
      if (attemptOutcome.result.status === "completed") {
        return attemptOutcome.result;
      }

      if (this.shouldAutoRetry(attempt)) {
        this.recordAutomaticRetry(attempt, attemptOutcome.result);
        currentTask = this.buildRetryPrompt(originalTask, attemptOutcome.result, attempt + 1);
        attempt += 1;
        continue;
      }

      if (this.canTriggerHitl(interventions)) {
        const intervention = await this.handleIntervention(attemptOutcome.result, consumption.record, attempt);
        interventions += 1;
        attempt = 1;
        currentTask = this.buildResumePrompt(originalTask, intervention.resumeInstruction, interventions);
        continue;
      }

      return attemptOutcome.result;
    }
  }

  private async runAttempt(taskForLoop: string, originalTask: string): Promise<AttemptOutcome> {
    const activeRun = this.requireActiveRun();
    activeRun.latestLoopSnapshotCommitted = false;

    const loopResult = await this.loop.run(taskForLoop);
    const finalScreenshotPath =
      loopResult.status === "completed" ? await this.loop.captureFinalScreenshot(activeRun.artifacts.finalScreenshotPath()) : undefined;
    const attemptResult = this.finalizeAttemptResult(
      { ...loopResult, task: originalTask },
      activeRun.runId,
      activeRun.artifacts,
      finalScreenshotPath
    );
    const snapshot = this.loop.snapshotProgress({ includeLastSnapshot: true });
    this.commitAttemptSnapshot(snapshot);

    return {
      result: this.buildCumulativeResult(attemptResult),
      snapshot,
    };
  }

  private finalizeAttemptResult(
    baseResult: AgentRunResult,
    runId: string,
    artifacts: ArtifactsWriter,
    finalScreenshotPath: string | undefined
  ): AgentRunResult {
    const result: AgentRunResult = {
      ...baseResult,
      runId,
      artifactsDir: artifacts.runDir,
      finalScreenshotPath,
    };

    if (result.mcpCalls.some((call) => call.phase === "end" && call.isError) && result.status === "completed") {
      result.status = "failed";
      result.finishReason = "mcp tool execution error";
    }
    if (!finalScreenshotPath && result.status === "completed") {
      result.status = "failed";
      result.finishReason = "final screenshot not captured";
    }
    return result;
  }

  private shouldAutoRetry(attempt: number): boolean {
    return Boolean(this.hitlController) && this.hitlRetryLimit > 0 && attempt <= this.hitlRetryLimit;
  }

  private canTriggerHitl(interventions: number): boolean {
    return Boolean(this.hitlController) && this.hitlMaxInterventions > interventions;
  }

  private recordAutomaticRetry(attempt: number, result: AgentRunResult): void {
    const activeRun = this.requireActiveRun();
    activeRun.runtimeHighLevelLogs.push(
      this.createRuntimeHighLevelLog({
        stage: "intervention",
        status: "warning",
        source: "runtime",
        summary: `Automatic retry ${attempt}/${this.hitlRetryLimit} scheduled`,
        detail: result.finishReason,
        data: {
          status: result.status,
          finishReason: result.finishReason,
        },
      })
    );
    this.logger.warn("run_retry_scheduled", {
      runId: activeRun.runId,
      retryAttempt: attempt,
      retryLimit: this.hitlRetryLimit,
      status: result.status,
      finishReason: result.finishReason,
    });
  }

  private async handleIntervention(
    result: AgentRunResult,
    consumptionRecord: SopConsumptionRecord,
    attempt: number
  ): Promise<HitlInterventionResponse> {
    const activeRun = this.requireActiveRun();
    const beforeState = await this.loop.captureObservationSummary();
    const context = this.buildInterventionContext(result, beforeState);
    const issueType = this.classifyIssueType(result);
    const operationIntent = this.deriveOperationIntent(result);

    activeRun.runtimeHighLevelLogs.push(
      this.createRuntimeHighLevelLog({
        stage: "intervention",
        status: "warning",
        source: "human",
        summary: `HITL requested after retry budget exhausted`,
        detail: result.finishReason,
        data: {
          issueType,
          attempt,
          retryLimit: this.hitlRetryLimit,
        },
      })
    );
    await this.persistCurrentArtifacts("hitl_requested");

    const response = await this.hitlController!.requestIntervention({
      runId: activeRun.runId,
      attempt,
      issueType,
      operationIntent,
      failureReason: result.finishReason,
      beforeState,
      context,
    });
    const afterState = await this.loop.captureObservationSummary();

    const learningRecord: InterventionLearningRecord = {
      runId: activeRun.runId,
      sopVersion: consumptionRecord.pinnedRunId ?? consumptionRecord.selectedAssetId ?? "unknown",
      timestamp: new Date().toISOString(),
      issueType,
      operationIntent,
      context,
      beforeState,
      humanAction: response.humanAction,
      afterState,
      resumeInstruction: response.resumeInstruction,
      nextTimeRule: response.nextTimeRule,
    };
    await activeRun.artifacts.appendInterventionLearning(learningRecord);

    activeRun.runtimeHighLevelLogs.push(
      this.createRuntimeHighLevelLog({
        stage: "intervention",
        status: "info",
        source: "human",
        summary: `HITL completed; resuming from current browser state`,
        detail: response.resumeInstruction,
        data: {
          issueType,
          nextTimeRule: response.nextTimeRule,
        },
      })
    );
    this.logger.info("hitl_completed", {
      runId: activeRun.runId,
      issueType,
      operationIntent,
    });
    return response;
  }

  private classifyIssueType(result: AgentRunResult): InterventionIssueType {
    if (result.finishReason === "final screenshot not captured") {
      return "validation_fail";
    }
    if (result.finishReason.includes("tool") || result.mcpCalls.some((call) => call.isError)) {
      return "tool_error";
    }
    if (result.status === "stalled" || result.status === "max_steps") {
      return "uncertain_state";
    }
    return "uncertain_state";
  }

  private deriveOperationIntent(result: AgentRunResult): string {
    const activeRun = this.requireActiveRun();
    const latestActionLog = [...activeRun.cumulativeLoopHighLevelLogs]
      .reverse()
      .find((entry) => entry.stage === "action" || entry.stage === "judge");
    if (latestActionLog?.summary) {
      return latestActionLog.summary;
    }
    const latestStep = result.steps[result.steps.length - 1];
    if (latestStep) {
      return `Continue after ${latestStep.action}`;
    }
    return "Continue the remaining task from the current browser state.";
  }

  private buildInterventionContext(result: AgentRunResult, beforeState: string): InterventionLearningContext {
    const latestStep = result.steps[result.steps.length - 1];
    const toolArguments = latestStep?.toolArguments ?? {};
    const elementHint = this.firstString(toolArguments.element, toolArguments.ref, toolArguments.selector);
    const inputVariable = this.firstString(toolArguments.text, toolArguments.url);

    return {
      pageHint: beforeState ? this.summarizeText(beforeState, 180) : undefined,
      elementHint,
      inputVariable,
    };
  }

  private buildRetryPrompt(originalTask: string, result: AgentRunResult, nextAttempt: number): string {
    return [
      `Retry attempt ${nextAttempt} for the same task.`,
      `Original task: ${originalTask}`,
      `The previous attempt ended with status=${result.status}, reason=${result.finishReason}.`,
      "Continue from the current browser state.",
      "Do not repeat already completed work.",
      "Choose a different approach for the failing point and verify progress after each action.",
    ].join("\n");
  }

  private buildResumePrompt(originalTask: string, resumeInstruction: string, interventionIndex: number): string {
    return [
      `Human intervention ${interventionIndex} completed.`,
      `Original task: ${originalTask}`,
      `Resume instruction: ${resumeInstruction}`,
      "Continue from the current browser state.",
      "Do not undo the manual correction.",
      "Focus only on the remaining unfinished steps.",
    ].join("\n");
  }

  private commitAttemptSnapshot(snapshot: AgentLoopProgressSnapshot): void {
    const activeRun = this.requireActiveRun();
    const stepOffset = activeRun.cumulativeSteps.length;
    const mcpOffset = activeRun.cumulativeMcpCalls.length;
    const turnOffset = activeRun.cumulativeAssistantTurns.length;

    activeRun.cumulativeSteps.push(
      ...snapshot.steps.map((step) => ({
        ...step,
        stepIndex: step.stepIndex + stepOffset,
      }))
    );
    activeRun.cumulativeMcpCalls.push(
      ...snapshot.mcpCalls.map((call) => ({
        ...call,
        index: call.index + mcpOffset,
      }))
    );
    activeRun.cumulativeAssistantTurns.push(
      ...snapshot.assistantTurns.map((turn) => ({
        ...turn,
        index: turn.index + turnOffset,
      }))
    );
    activeRun.cumulativeLoopHighLevelLogs.push(
      ...snapshot.highLevelLogs.map((entry) => ({
        ...entry,
        index: 0,
        stepIndex: typeof entry.stepIndex === "number" ? entry.stepIndex + stepOffset : undefined,
        turnIndex: typeof entry.turnIndex === "number" ? entry.turnIndex + turnOffset : undefined,
      }))
    );
    activeRun.latestLoopSnapshotCommitted = true;
  }

  private buildCumulativeResult(latestResult: AgentRunResult): AgentRunResult {
    const activeRun = this.requireActiveRun();
    return {
      ...latestResult,
      steps: [...activeRun.cumulativeSteps],
      mcpCalls: [...activeRun.cumulativeMcpCalls],
      assistantTurns: [...activeRun.cumulativeAssistantTurns],
    };
  }

  private runFinishedPayload(result: AgentRunResult): Record<string, unknown> {
    const activeRun = this.requireActiveRun();
    return {
      runId: result.runId,
      status: result.status,
      finishReason: result.finishReason,
      steps: result.steps.length,
      mcpCalls: result.mcpCalls.length,
      assistantTurns: result.assistantTurns.length,
      highLevelLogs: this.composeHighLevelLogs(activeRun.cumulativeLoopHighLevelLogs, activeRun.runtimeHighLevelLogs).length,
      finalScreenshotPath: result.finalScreenshotPath,
    };
  }

  private async flushInProgressArtifacts(reason: string, includeLastLoopSnapshot: boolean): Promise<void> {
    if (!this.activeRun) {
      return;
    }
    if (!this.flushPromise) {
      this.flushPromise = this.flushInProgressArtifactsInternal(reason, includeLastLoopSnapshot).finally(() => {
        this.flushPromise = null;
      });
    }
    await this.flushPromise;
  }

  private async flushInProgressArtifactsInternal(reason: string, includeLastLoopSnapshot: boolean): Promise<void> {
    if (!this.activeRun) {
      return;
    }
    try {
      const snapshot = this.getAggregatedSnapshot(includeLastLoopSnapshot);
      await this.writeSnapshot(this.activeRun.artifacts, snapshot, this.activeRun.runtimeHighLevelLogs);
      await this.activeRun.artifacts.writeRuntimeLog(this.logger.toText());
      this.logger.info("run_progress_flushed", {
        runId: this.activeRun.runId,
        reason,
        steps: snapshot.steps.length,
        mcpCalls: snapshot.mcpCalls.length,
        assistantTurns: snapshot.assistantTurns.length,
        highLevelLogs: this.composeHighLevelLogs(snapshot.highLevelLogs, this.activeRun.runtimeHighLevelLogs).length,
      });
    } catch (error) {
      this.logger.warn("run_progress_flush_failed", {
        runId: this.activeRun.runId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async persistCurrentArtifacts(reason: string): Promise<void> {
    if (!this.activeRun) {
      return;
    }
    const snapshot = this.getAggregatedSnapshot(true);
    await this.writeSnapshot(this.activeRun.artifacts, snapshot, this.activeRun.runtimeHighLevelLogs);
    await this.activeRun.artifacts.writeRuntimeLog(this.logger.toText());
    this.logger.info("run_artifacts_persisted", {
      runId: this.activeRun.runId,
      reason,
      steps: snapshot.steps.length,
      highLevelLogs: this.composeHighLevelLogs(snapshot.highLevelLogs, this.activeRun.runtimeHighLevelLogs).length,
    });
  }

  private getAggregatedSnapshot(includeLastLoopSnapshot: boolean): AggregatedSnapshot {
    const activeRun = this.requireActiveRun();
    const aggregated: AggregatedSnapshot = {
      steps: [...activeRun.cumulativeSteps],
      mcpCalls: [...activeRun.cumulativeMcpCalls],
      assistantTurns: [...activeRun.cumulativeAssistantTurns],
      highLevelLogs: [...activeRun.cumulativeLoopHighLevelLogs],
    };
    const shouldAppendLatest =
      !activeRun.latestLoopSnapshotCommitted &&
      (includeLastLoopSnapshot ||
        this.loop.snapshotProgress().steps.length > 0 ||
        this.loop.snapshotProgress().assistantTurns.length > 0 ||
        this.loop.snapshotProgress().mcpCalls.length > 0);
    if (!shouldAppendLatest) {
      return aggregated;
    }

    const latestSnapshot = this.loop.snapshotProgress({ includeLastSnapshot: includeLastLoopSnapshot });
    const stepOffset = aggregated.steps.length;
    const mcpOffset = aggregated.mcpCalls.length;
    const turnOffset = aggregated.assistantTurns.length;
    aggregated.steps.push(
      ...latestSnapshot.steps.map((step) => ({
        ...step,
        stepIndex: step.stepIndex + stepOffset,
      }))
    );
    aggregated.mcpCalls.push(
      ...latestSnapshot.mcpCalls.map((call) => ({
        ...call,
        index: call.index + mcpOffset,
      }))
    );
    aggregated.assistantTurns.push(
      ...latestSnapshot.assistantTurns.map((turn) => ({
        ...turn,
        index: turn.index + turnOffset,
      }))
    );
    aggregated.highLevelLogs.push(
      ...latestSnapshot.highLevelLogs.map((entry) => ({
        ...entry,
        index: 0,
        stepIndex: typeof entry.stepIndex === "number" ? entry.stepIndex + stepOffset : undefined,
        turnIndex: typeof entry.turnIndex === "number" ? entry.turnIndex + turnOffset : undefined,
      }))
    );
    return aggregated;
  }

  private async writeSnapshot(
    artifacts: ArtifactsWriter,
    snapshot: AgentLoopProgressSnapshot,
    runtimeHighLevelLogs: HighLevelLogEntry[]
  ): Promise<void> {
    await artifacts.writeSteps(snapshot.steps);
    await artifacts.writeMcpCalls(snapshot.mcpCalls);
    await artifacts.writeAssistantTurns(snapshot.assistantTurns);
    await artifacts.writeHighLevelLogs(this.composeHighLevelLogs(snapshot.highLevelLogs, runtimeHighLevelLogs));
  }

  private logConsumption(runId: string, record: SopConsumptionRecord): void {
    if (record.fallbackUsed) {
      const payload = {
        runId,
        asset_id: record.selectedAssetId,
        pinned_run_id: record.pinnedRunId,
        selection_mode: record.selectionMode,
        task_source: record.taskSource,
        guide_source: record.guideSource,
        fallback_used: record.fallbackUsed,
        reason: record.fallbackReason,
        candidate_count: record.candidateCount,
      };
      if (record.fallbackReason?.startsWith("build_failed:")) {
        this.logger.warn("sop_consumption_fallback", payload);
        return;
      }
      if (record.fallbackReason === "consumption_disabled" || record.fallbackReason === "consumption_not_configured") {
        this.logger.info("sop_consumption_skipped", payload);
        return;
      }
      this.logger.info("sop_consumption_fallback", payload);
      return;
    }

    this.logger.info("sop_consumption_selected", {
      runId,
      asset_id: record.selectedAssetId,
      pinned_run_id: record.pinnedRunId,
      selection_mode: record.selectionMode,
      task_source: record.taskSource,
      guide_source: record.guideSource,
      fallback_used: record.fallbackUsed,
      candidate_count: record.candidateCount,
      hints: record.usedHints.length,
    });
  }

  private createRuntimeHighLevelLog(input: {
    stage: HighLevelLogStage;
    status: HighLevelLogStatus;
    source: HighLevelLogSource;
    summary: string;
    detail?: string;
    data?: Record<string, unknown>;
  }): HighLevelLogEntry {
    return {
      index: 0,
      timestamp: new Date().toISOString(),
      ...input,
    };
  }

  private createRunOutcomeHighLevelLog(result: AgentRunResult): HighLevelLogEntry {
    return this.createRuntimeHighLevelLog({
      stage: "result",
      status: result.status === "completed" ? "info" : "error",
      source: "runtime",
      summary:
        result.status === "completed"
          ? "Run finished successfully"
          : `Run finished with status ${result.status}: ${result.finishReason}`,
      detail: result.finishReason,
      data: {
        runId: result.runId,
        status: result.status,
        finalScreenshotPath: result.finalScreenshotPath,
      },
    });
  }

  private composeHighLevelLogs(
    loopLogs: HighLevelLogEntry[],
    runtimeLogs: HighLevelLogEntry[] = [],
    extraLogs: HighLevelLogEntry[] = []
  ): HighLevelLogEntry[] {
    const merged = [...loopLogs, ...runtimeLogs, ...extraLogs];
    return merged
      .map((entry, position) => ({ entry, position }))
      .sort((left, right) => {
        const byTimestamp = left.entry.timestamp.localeCompare(right.entry.timestamp);
        return byTimestamp !== 0 ? byTimestamp : left.position - right.position;
      })
      .map(({ entry }, index) => ({
        ...entry,
        index: index + 1,
      }));
  }

  private summarizeText(value: string, maxLength: number): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  private firstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private requireActiveRun(): ActiveRunState {
    if (!this.activeRun) {
      throw new Error("run is not active");
    }
    return this.activeRun;
  }
}
