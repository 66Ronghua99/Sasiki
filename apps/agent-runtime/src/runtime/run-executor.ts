/**
 * Deps: core/agent-loop.ts, domain/agent-types.ts, contracts/logger.ts, runtime/artifacts-writer.ts
 * Used By: runtime/agent-runtime.ts
 * Last Updated: 2026-03-05
 */
import type { AgentLoop, AgentLoopProgressSnapshot } from "../core/agent-loop.js";
import type { Logger } from "../contracts/logger.js";
import type { AgentRunResult } from "../domain/agent-types.js";
import { ArtifactsWriter } from "./artifacts-writer.js";

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
}

export class RunExecutor {
  private readonly loop: AgentLoop;
  private readonly logger: RuntimeLogBuffer;
  private readonly artifactsDir: string;
  private readonly createRunId: () => string;
  private activeRun: ActiveRunState | null = null;
  private flushPromise: Promise<void> | null = null;

  constructor(options: RunExecutorOptions) {
    this.loop = options.loop;
    this.logger = options.logger;
    this.artifactsDir = options.artifactsDir;
    this.createRunId = options.createRunId;
  }

  async execute(task: string): Promise<AgentRunResult> {
    const runId = this.createRunId();
    const artifacts = new ArtifactsWriter(this.artifactsDir, runId);
    await artifacts.ensureDir();
    this.activeRun = { runId, artifacts };
    this.logger.info("run_started", { runId, task, artifactsDir: artifacts.runDir });

    try {
      const baseResult = await this.loop.run(task);
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
}
