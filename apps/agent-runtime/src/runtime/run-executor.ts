/**
 * Deps: core/agent-loop.ts, domain/agent-types.ts, domain/sop-consumption.ts, contracts/logger.ts, runtime/artifacts-writer.ts, runtime/sop-consumption-context.ts
 * Used By: runtime/workflow-runtime.ts
 * Last Updated: 2026-03-06
 */
import type { AgentLoop, AgentLoopProgressSnapshot } from "../core/agent-loop.js";
import type { Logger } from "../contracts/logger.js";
import type { AgentRunRequest, AgentRunResult } from "../domain/agent-types.js";
import type { SopConsumptionRecord, SopConsumptionResult } from "../domain/sop-consumption.js";
import { ArtifactsWriter } from "./artifacts-writer.js";
import type { SopConsumptionBuildInput, SopConsumptionContextBuilder } from "./sop-consumption-context.js";

interface RuntimeLogBuffer extends Logger {
  toText(): string;
}

interface ActiveRunState {
  runId: string;
  artifacts: ArtifactsWriter;
}

export interface RunExecutorOptions {
  loop: AgentLoop;
  logger: RuntimeLogBuffer;
  artifactsDir: string;
  createRunId: () => string;
  sopConsumptionContext?: SopConsumptionContextBuilder;
}

export class RunExecutor {
  private readonly loop: AgentLoop;
  private readonly logger: RuntimeLogBuffer;
  private readonly artifactsDir: string;
  private readonly createRunId: () => string;
  private readonly sopConsumptionContext?: SopConsumptionContextBuilder;
  private activeRun: ActiveRunState | null = null;
  private flushPromise: Promise<void> | null = null;

  constructor(options: RunExecutorOptions) {
    this.loop = options.loop;
    this.logger = options.logger;
    this.artifactsDir = options.artifactsDir;
    this.createRunId = options.createRunId;
    this.sopConsumptionContext = options.sopConsumptionContext;
  }

  async execute(request: AgentRunRequest): Promise<AgentRunResult> {
    const runId = this.createRunId();
    const artifacts = new ArtifactsWriter(this.artifactsDir, runId);
    await artifacts.ensureDir();
    this.activeRun = { runId, artifacts };
    const input = this.toConsumptionInput(request);
    this.logger.info("run_started", { runId, task: input.task, sopRunId: input.sopRunId, artifactsDir: artifacts.runDir });

    try {
      const consumption = await this.resolveConsumption(input);
      await artifacts.writeSopConsumption(consumption.record);
      this.logConsumption(runId, consumption.record);
      if (!consumption.taskForLoop.trim()) {
        throw new Error("run task is empty after SOP consumption resolution");
      }

      const loopResult = await this.loop.run(consumption.taskForLoop);
      const baseResult: AgentRunResult = { ...loopResult, task: consumption.record.originalTask };
      const finalScreenshotPath = await this.loop.captureFinalScreenshot(artifacts.finalScreenshotPath());
      await artifacts.writeSteps(baseResult.steps);
      await artifacts.writeMcpCalls(baseResult.mcpCalls);
      await artifacts.writeAssistantTurns(baseResult.assistantTurns);
      const result = this.finalizeResult(baseResult, runId, artifacts, finalScreenshotPath);
      this.logger.info("run_finished", this.runFinishedPayload(result));
      return result;
    } catch (error) {
      this.logger.error("run_failed", { runId, error: error instanceof Error ? error.message : String(error) });
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
    this.loop.abort(`signal:${signalName}`);
    await this.flushInProgressArtifacts("interrupt_requested");
    return true;
  }

  private finalizeResult(
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

  private runFinishedPayload(result: AgentRunResult): Record<string, unknown> {
    return {
      runId: result.runId,
      status: result.status,
      finishReason: result.finishReason,
      steps: result.steps.length,
      mcpCalls: result.mcpCalls.length,
      assistantTurns: result.assistantTurns.length,
      finalScreenshotPath: result.finalScreenshotPath,
    };
  }

  private async flushInProgressArtifacts(reason: string): Promise<void> {
    if (!this.activeRun) {
      return;
    }
    if (!this.flushPromise) {
      this.flushPromise = this.flushInProgressArtifactsInternal(reason).finally(() => {
        this.flushPromise = null;
      });
    }
    await this.flushPromise;
  }

  private async flushInProgressArtifactsInternal(reason: string): Promise<void> {
    if (!this.activeRun) {
      return;
    }
    try {
      const snapshot = this.loop.snapshotProgress();
      await this.writeSnapshot(this.activeRun.artifacts, snapshot);
      await this.activeRun.artifacts.writeRuntimeLog(this.logger.toText());
      this.logger.info("run_interrupt_flushed", {
        runId: this.activeRun.runId,
        reason,
        steps: snapshot.steps.length,
        mcpCalls: snapshot.mcpCalls.length,
        assistantTurns: snapshot.assistantTurns.length,
      });
    } catch (error) {
      this.logger.warn("run_interrupt_flush_failed", {
        runId: this.activeRun.runId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async writeSnapshot(artifacts: ArtifactsWriter, snapshot: AgentLoopProgressSnapshot): Promise<void> {
    await artifacts.writeSteps(snapshot.steps);
    await artifacts.writeMcpCalls(snapshot.mcpCalls);
    await artifacts.writeAssistantTurns(snapshot.assistantTurns);
  }

  private toConsumptionInput(request: AgentRunRequest): SopConsumptionBuildInput {
    return {
      task: request.task.trim(),
      sopRunId: request.sopRunId?.trim(),
    };
  }

  private async resolveConsumption(input: SopConsumptionBuildInput): Promise<SopConsumptionResult> {
    if (!this.sopConsumptionContext) {
      return this.fallbackConsumption(input.task, input.sopRunId, "consumption_not_configured");
    }
    return this.sopConsumptionContext.build(input);
  }

  private fallbackConsumption(task: string, sopRunId: string | undefined, reason: string): SopConsumptionResult {
    return {
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
        fallbackReason: reason,
        usedHints: [],
        generatedAt: new Date().toISOString(),
      },
    };
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
}
