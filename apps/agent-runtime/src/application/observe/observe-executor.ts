/**
 * Deps: application/observe/support/sop-demonstration-recorder.ts, domain/*, contracts/logger.ts, infrastructure/browser/playwright-demonstration-recorder.ts, infrastructure/persistence/*
 * Used By: application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import type { SopDemonstrationRecorder } from "./support/sop-demonstration-recorder.js";
import type { Logger } from "../../contracts/logger.js";
import type {
  RuntimeEvent,
  RuntimeRunTelemetry,
  RuntimeRunTelemetryScope,
  RuntimeTelemetryRegistry,
} from "../../contracts/runtime-telemetry.js";
import type { ObserveRunResult } from "../../domain/agent-types.js";
import { RuntimeError } from "../../domain/runtime-errors.js";
import type { SopAsset, WebElementHint } from "../../domain/sop-asset.js";
import { SOP_ASSET_VERSION } from "../../domain/sop-asset.js";
import type { DemonstrationRawEvent, SopTrace } from "../../domain/sop-trace.js";
import type { ObserveCaptureOptions, PlaywrightDemonstrationRecorder } from "../../infrastructure/browser/playwright-demonstration-recorder.js";
import { ArtifactsWriter } from "../../infrastructure/persistence/artifacts-writer.js";
import { SopAssetStore } from "../../infrastructure/persistence/sop-asset-store.js";

interface ActiveObserveState {
  runId: string;
  artifacts: ArtifactsWriter;
  controller: AbortController;
  telemetry: RuntimeRunTelemetry | null;
}

export interface ObserveExecutorOptions {
  logger: Logger;
  cdpEndpoint: string;
  observeTimeoutMs: number;
  artifactsDir: string;
  createRunId: () => string;
  sopRecorder: SopDemonstrationRecorder;
  sopAssetRootDir: string;
  createRecorder: () => PlaywrightDemonstrationRecorder;
  telemetryRegistry: RuntimeTelemetryRegistry;
}

export class ObserveExecutor {
  private readonly logger: Logger;
  private readonly observeOptions: ObserveCaptureOptions;
  private readonly artifactsDir: string;
  private readonly createRunId: () => string;
  private readonly sopRecorder: SopDemonstrationRecorder;
  private readonly sopAssetStore: SopAssetStore;
  private readonly createRecorder: () => PlaywrightDemonstrationRecorder;
  private readonly telemetryRegistry: RuntimeTelemetryRegistry;
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
    this.sopAssetStore = new SopAssetStore(options.sopAssetRootDir);
    this.createRecorder = options.createRecorder;
    this.telemetryRegistry = options.telemetryRegistry;
  }

  async execute(taskHint: string): Promise<ObserveRunResult> {
    const runId = this.createRunId();
    const artifacts = new ArtifactsWriter(this.artifactsDir, runId);
    await artifacts.ensureDir();
    const recorder = this.createRecorder();
    const controller = new AbortController();
    const telemetry = this.createTelemetry({ workflow: "observe", runId, artifactsDir: artifacts.runDir });
    this.activeObserve = { runId, artifacts, controller, telemetry };

    this.logger.info("observe_started", {
      runId,
      taskHint,
      artifactsDir: artifacts.runDir,
      timeoutMs: this.observeOptions.timeoutMs,
    });
    await this.emitTelemetry(telemetry, {
      timestamp: new Date().toISOString(),
      workflow: "observe",
      runId,
      eventType: "workflow.lifecycle",
      payload: {
        phase: "started",
        taskHint,
        artifactsDir: artifacts.runDir,
      },
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
      await this.emitTelemetry(telemetry, {
        timestamp: new Date().toISOString(),
        workflow: "observe",
        runId,
        eventType: "workflow.lifecycle",
        payload: {
          phase: "finished",
          status: result.status,
          finishReason: result.finishReason,
          artifactsDir: artifacts.runDir,
        },
      });
      return result;
    } catch (error) {
      this.logger.error("observe_failed", {
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.emitTelemetry(telemetry, {
        timestamp: new Date().toISOString(),
        workflow: "observe",
        runId,
        eventType: "workflow.lifecycle",
        payload: {
          phase: "failed",
          error: error instanceof Error ? error.message : String(error),
          artifactsDir: artifacts.runDir,
        },
      });
      throw error;
    } finally {
      this.activeObserve = null;
      if (recorderStarted && !recorderStopped) {
        try {
          await recorder.stop();
        } catch {
          // Best effort stop during error path.
        }
      }
      await telemetry?.dispose();
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
    await this.emitTelemetry(this.activeObserve.telemetry, {
      timestamp: new Date().toISOString(),
      workflow: "observe",
      runId: this.activeObserve.runId,
      eventType: "workflow.lifecycle",
      payload: {
        phase: "interrupt_requested",
        signal: signalName,
      },
    });
    return true;
  }

  private async emitTelemetry(telemetry: RuntimeRunTelemetry | null, event: RuntimeEvent): Promise<void> {
    if (!telemetry) {
      return;
    }
    try {
      await telemetry.eventBus.emit(event);
    } catch (error) {
      this.logger.warn("observe_telemetry_emit_failed", {
        runId: event.runId,
        eventType: event.eventType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private createTelemetry(scope: RuntimeRunTelemetryScope): RuntimeRunTelemetry | null {
    try {
      return this.telemetryRegistry.createRunTelemetry(scope);
    } catch (error) {
      this.logger.warn("observe_telemetry_setup_failed", {
        runId: scope.runId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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
