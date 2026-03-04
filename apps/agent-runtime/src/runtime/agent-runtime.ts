/**
 * Deps: core/*, domain/*, infrastructure/*, runtime/*
 * Used By: index.ts
 * Last Updated: 2026-03-04
 */
import { AgentLoop } from "../core/agent-loop.js";
import { SopDemonstrationRecorder } from "../core/sop-demonstration-recorder.js";
import type { AgentRunResult, ObserveRunResult, RuntimeMode } from "../domain/agent-types.js";
import { RuntimeError } from "../domain/runtime-errors.js";
import type { SopAsset, WebElementHint } from "../domain/sop-asset.js";
import { SOP_ASSET_VERSION } from "../domain/sop-asset.js";
import type { DemonstrationRawEvent, SopTrace } from "../domain/sop-trace.js";
import { CdpBrowserLauncher } from "../infrastructure/browser/cdp-browser-launcher.js";
import { PlaywrightDemonstrationRecorder } from "../infrastructure/browser/playwright-demonstration-recorder.js";
import { RuntimeLogger } from "../infrastructure/logging/runtime-logger.js";
import { McpStdioClient } from "../infrastructure/mcp/mcp-stdio-client.js";
import { ArtifactsWriter } from "./artifacts-writer.js";
import type { RuntimeConfig } from "./runtime-config.js";
import { SopAssetStore } from "./sop-asset-store.js";

interface RunActiveState {
  mode: "run";
  runId: string;
  artifacts: ArtifactsWriter;
}

interface ObserveActiveState {
  mode: "observe";
  runId: string;
  artifacts: ArtifactsWriter;
  controller: AbortController;
}

type ActiveRunState = RunActiveState | ObserveActiveState;

export class AgentRuntime {
  private readonly config: RuntimeConfig;
  private readonly logger: RuntimeLogger;
  private readonly cdpLauncher: CdpBrowserLauncher;
  private readonly loop: AgentLoop;
  private readonly sopRecorder: SopDemonstrationRecorder;
  private readonly sopAssetStore: SopAssetStore;
  private activeRun: ActiveRunState | null = null;
  private flushPromise: Promise<void> | null = null;
  private started = false;
  private loopInitialized = false;

  constructor(config: RuntimeConfig) {
    this.config = config;
    this.logger = new RuntimeLogger();
    this.cdpLauncher = new CdpBrowserLauncher(
      {
        cdpEndpoint: config.cdpEndpoint,
        launchCdp: config.launchCdp,
        userDataDir: config.cdpUserDataDir,
        headless: config.cdpHeadless,
        injectCookies: config.cdpInjectCookies,
        cookiesDir: config.cdpCookiesDir,
        preferSystemBrowser: config.cdpPreferSystemBrowser,
        executablePath: config.cdpExecutablePath,
        startupTimeoutMs: config.cdpStartupTimeoutMs,
      },
      this.logger
    );
    const toolClient = new McpStdioClient({
      command: config.mcpCommand,
      args: [...config.mcpArgs, "--cdp-endpoint", config.cdpEndpoint],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter((pair): pair is [string, string] => typeof pair[1] === "string")
        ),
        ...config.mcpEnv,
        PLAYWRIGHT_MCP_CDP_ENDPOINT: config.cdpEndpoint,
      },
    });

    this.loop = new AgentLoop(
      {
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        thinkingLevel: config.thinkingLevel,
      },
      toolClient,
      this.logger
    );
    this.sopRecorder = new SopDemonstrationRecorder();
    this.sopAssetStore = new SopAssetStore(config.sopAssetRootDir);
  }

  async start(mode: RuntimeMode = "run"): Promise<void> {
    if (!this.started) {
      await this.cdpLauncher.start();
      this.started = true;
    }
    if (mode === "run") {
      await this.ensureLoopInitialized();
    }
  }

  async run(task: string): Promise<AgentRunResult> {
    await this.ensureLoopInitialized();

    const runId = this.createRunId();
    const artifacts = new ArtifactsWriter(this.config.artifactsDir, runId);
    await artifacts.ensureDir();
    this.activeRun = { mode: "run", runId, artifacts };
    this.logger.info("run_started", { runId, task, artifactsDir: artifacts.runDir });

    try {
      const baseResult = await this.loop.run(task);
      const finalScreenshotPath = await this.loop.captureFinalScreenshot(artifacts.finalScreenshotPath());
      await artifacts.writeSteps(baseResult.steps);
      await artifacts.writeMcpCalls(baseResult.mcpCalls);
      await artifacts.writeAssistantTurns(baseResult.assistantTurns);

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

      this.logger.info("run_finished", {
        runId,
        status: result.status,
        finishReason: result.finishReason,
        steps: result.steps.length,
        mcpCalls: result.mcpCalls.length,
        assistantTurns: result.assistantTurns.length,
        finalScreenshotPath: result.finalScreenshotPath,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("run_failed", { runId, error: message });
      throw error;
    } finally {
      await artifacts.writeRuntimeLog(this.logger.toText());
      this.activeRun = null;
    }
  }

  async observe(taskHint: string): Promise<ObserveRunResult> {
    const runId = this.createRunId();
    const artifacts = new ArtifactsWriter(this.config.artifactsDir, runId);
    await artifacts.ensureDir();
    const recorder = new PlaywrightDemonstrationRecorder();
    const controller = new AbortController();
    this.activeRun = { mode: "observe", runId, artifacts, controller };
    this.logger.info("observe_started", {
      runId,
      taskHint,
      artifactsDir: artifacts.runDir,
      timeoutMs: this.config.observeTimeoutMs,
    });

    let recorderStarted = false;
    let recorderStopped = false;
    try {
      await recorder.start({
        cdpEndpoint: this.config.cdpEndpoint,
        singleTabOnly: true,
        timeoutMs: this.config.observeTimeoutMs,
      });
      recorderStarted = true;
      const stopReason = await this.waitForObserveStop(controller.signal, this.config.observeTimeoutMs);
      const rawEvents = await recorder.stop();
      recorderStopped = true;

      if (rawEvents.length === 0) {
        throw new RuntimeError("OBSERVE_NO_EVENTS_CAPTURED", "observe finished without captured events");
      }

      const trace = this.buildTrace(runId, taskHint, rawEvents);
      const draft = this.sopRecorder.buildDraft(trace);
      const webElementHints = this.sopRecorder.buildWebElementHints(trace);
      const asset = this.buildAsset(runId, trace, webElementHints, artifacts);

      await artifacts.writeDemonstrationRaw(rawEvents);
      await artifacts.writeDemonstrationTrace(trace);
      await artifacts.writeSopDraft(draft);
      await artifacts.writeSopAsset(asset);
      await this.sopAssetStore.upsert(asset);

      const result: ObserveRunResult = {
        runId,
        mode: "observe",
        taskHint,
        status: "completed",
        finishReason: stopReason === "interrupt" ? "interrupt_requested" : "observe_timeout_reached",
        artifactsDir: artifacts.runDir,
        tracePath: artifacts.demonstrationTracePath(),
        draftPath: artifacts.sopDraftPath(),
        assetPath: artifacts.sopAssetPath(),
      };
      this.logger.info("observe_finished", {
        runId,
        status: result.status,
        finishReason: result.finishReason,
        events: rawEvents.length,
        tracePath: result.tracePath,
        assetPath: result.assetPath,
      });
      return result;
    } catch (error) {
      this.logger.error("observe_failed", {
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      if (recorderStarted && !recorderStopped) {
        try {
          await recorder.stop();
        } catch {
          // Best effort stop during error path.
        }
      }
      await artifacts.writeRuntimeLog(this.logger.toText());
      this.activeRun = null;
    }
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<void> {
    if (!this.activeRun) {
      return;
    }
    if (this.activeRun.mode === "observe") {
      this.logger.warn("observe_interrupt_requested", { signal: signalName, runId: this.activeRun.runId });
      this.activeRun.controller.abort();
      await this.activeRun.artifacts.writeRuntimeLog(this.logger.toText());
      return;
    }

    this.logger.warn("run_interrupt_requested", {
      signal: signalName,
      runId: this.activeRun.runId,
    });
    this.loop.abort(`signal:${signalName}`);
    await this.flushInProgressArtifacts("interrupt_requested");
  }

  async stop(): Promise<void> {
    if (this.loopInitialized) {
      await this.loop.shutdown();
      this.loopInitialized = false;
    }
    if (this.started) {
      await this.cdpLauncher.stop();
      this.started = false;
    }
  }

  private async ensureLoopInitialized(): Promise<void> {
    if (this.loopInitialized) {
      return;
    }
    await this.loop.initialize();
    this.loopInitialized = true;
  }

  private buildTrace(runId: string, taskHint: string, rawEvents: DemonstrationRawEvent[]) {
    return this.sopRecorder.buildTrace({
      traceId: runId,
      taskHint,
      site: this.detectSite(rawEvents),
      rawEvents,
    });
  }

  private buildAsset(
    runId: string,
    trace: SopTrace,
    webElementHints: WebElementHint[],
    artifacts: ArtifactsWriter
  ): SopAsset {
    const tags = this.sopRecorder.buildTags(trace);
    return {
      assetVersion: SOP_ASSET_VERSION,
      assetId: `sop_${runId}`,
      site: trace.site,
      taskHint: trace.taskHint,
      tags: tags.length > 0 ? tags : ["observe"],
      tracePath: artifacts.demonstrationTracePath(),
      draftPath: artifacts.sopDraftPath(),
      guidePath: artifacts.sopDraftPath(),
      webElementHints,
      createdAt: new Date().toISOString(),
    };
  }

  private detectSite(rawEvents: DemonstrationRawEvent[]): string {
    for (let i = rawEvents.length - 1; i >= 0; i -= 1) {
      const event = rawEvents[i];
      try {
        const host = new URL(event.url).hostname;
        if (host) {
          return host;
        }
      } catch {
        // keep searching previous events
      }
    }
    return "unknown";
  }

  private waitForObserveStop(signal: AbortSignal, timeoutMs: number): Promise<"timeout" | "interrupt"> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve("timeout");
      }, timeoutMs);
      const onAbort = (): void => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve("interrupt");
      };

      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort);
    });
  }

  private async flushInProgressArtifacts(reason: string): Promise<void> {
    if (!this.activeRun || this.activeRun.mode !== "run") {
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
    if (!this.activeRun || this.activeRun.mode !== "run") {
      return;
    }
    try {
      const snapshot = this.loop.snapshotProgress();
      await this.activeRun.artifacts.writeSteps(snapshot.steps);
      await this.activeRun.artifacts.writeMcpCalls(snapshot.mcpCalls);
      await this.activeRun.artifacts.writeAssistantTurns(snapshot.assistantTurns);
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

  private createRunId(): string {
    const now = new Date();
    const parts = [
      now.getFullYear().toString().padStart(4, "0"),
      (now.getMonth() + 1).toString().padStart(2, "0"),
      now.getDate().toString().padStart(2, "0"),
      "_",
      now.getHours().toString().padStart(2, "0"),
      now.getMinutes().toString().padStart(2, "0"),
      now.getSeconds().toString().padStart(2, "0"),
      "_",
      now.getMilliseconds().toString().padStart(3, "0"),
    ];
    return parts.join("");
  }
}
