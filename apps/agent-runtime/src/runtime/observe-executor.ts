/**
 * Deps: core/sop-demonstration-recorder.ts, domain/*, contracts/logger.ts, infrastructure/browser/playwright-demonstration-recorder.ts, runtime/artifacts-writer.ts, runtime/sop-asset-store.ts
 * Used By: runtime/agent-runtime.ts
 * Last Updated: 2026-03-05
 */
import type { SopDemonstrationRecorder } from "../core/sop-demonstration-recorder.js";
import type { Logger } from "../contracts/logger.js";
import type { ObserveRunResult } from "../domain/agent-types.js";
import { RuntimeError } from "../domain/runtime-errors.js";
import type { SopAsset, WebElementHint } from "../domain/sop-asset.js";
import { SOP_ASSET_VERSION } from "../domain/sop-asset.js";
import type { DemonstrationRawEvent, SopTrace } from "../domain/sop-trace.js";
import type { ObserveCaptureOptions, PlaywrightDemonstrationRecorder } from "../infrastructure/browser/playwright-demonstration-recorder.js";
import { ArtifactsWriter } from "./artifacts-writer.js";
import type { SopAssetStore } from "./sop-asset-store.js";

interface RuntimeLogBuffer extends Logger {
  toText(): string;
}

interface ActiveObserveState {
  runId: string;
  artifacts: ArtifactsWriter;
  controller: AbortController;
}

export interface ObserveExecutorOptions {
  logger: RuntimeLogBuffer;
  cdpEndpoint: string;
  observeTimeoutMs: number;
  artifactsDir: string;
  createRunId: () => string;
  sopRecorder: SopDemonstrationRecorder;
  sopAssetStore: SopAssetStore;
  createRecorder: () => PlaywrightDemonstrationRecorder;
}

export class ObserveExecutor {
  private readonly logger: RuntimeLogBuffer;
  private readonly observeOptions: ObserveCaptureOptions;
  private readonly artifactsDir: string;
  private readonly createRunId: () => string;
  private readonly sopRecorder: SopDemonstrationRecorder;
  private readonly sopAssetStore: SopAssetStore;
  private readonly createRecorder: () => PlaywrightDemonstrationRecorder;
  private activeObserve: ActiveObserveState | null = null;

  constructor(options: ObserveExecutorOptions) {
    this.logger = options.logger;
    this.observeOptions = {
      cdpEndpoint: options.cdpEndpoint,
      timeoutMs: options.observeTimeoutMs,
    };
    this.artifactsDir = options.artifactsDir;
    this.createRunId = options.createRunId;
    this.sopRecorder = options.sopRecorder;
    this.sopAssetStore = options.sopAssetStore;
    this.createRecorder = options.createRecorder;
  }

  async execute(taskHint: string): Promise<ObserveRunResult> {
    const runId = this.createRunId();
    const artifacts = new ArtifactsWriter(this.artifactsDir, runId);
    await artifacts.ensureDir();
    const recorder = this.createRecorder();
    const controller = new AbortController();
    this.activeObserve = { runId, artifacts, controller };

    this.logger.info("observe_started", {
      runId,
      taskHint,
      artifactsDir: artifacts.runDir,
      timeoutMs: this.observeOptions.timeoutMs,
    });

    let recorderStarted = false;
    let recorderStopped = false;
    try {
      await recorder.start(this.observeOptions);
      recorderStarted = true;
      const stopReason = await this.waitForObserveStop(controller.signal, this.observeOptions.timeoutMs);
      const rawEvents = await recorder.stop();
      recorderStopped = true;
      this.assertRawEvents(rawEvents);

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
      this.activeObserve = null;
    }
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean> {
    if (!this.activeObserve) {
      return false;
    }
    this.logger.warn("observe_interrupt_requested", {
      signal: signalName,
      runId: this.activeObserve.runId,
    });
    this.activeObserve.controller.abort();
    await this.activeObserve.artifacts.writeRuntimeLog(this.logger.toText());
    return true;
  }

  private assertRawEvents(rawEvents: DemonstrationRawEvent[]): void {
    if (rawEvents.length === 0) {
      throw new RuntimeError("OBSERVE_NO_EVENTS_CAPTURED", "observe finished without captured events");
    }
  }

  private buildTrace(runId: string, taskHint: string, rawEvents: DemonstrationRawEvent[]): SopTrace {
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
}
