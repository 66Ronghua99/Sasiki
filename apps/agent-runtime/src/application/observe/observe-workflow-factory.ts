/**
 * Deps: application/observe/observe-executor.ts, application/observe/observe-workflow.ts, application/observe/support/sop-demonstration-recorder.ts
 * Used By: application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-23
 */
import type { Logger } from "../../contracts/logger.js";
import type { RuntimeTelemetryRegistry } from "../../contracts/runtime-telemetry.js";
import { ObserveExecutor, type ObserveArtifactsWriter, type ObserveAssetStore, type ObserveRecorder } from "./observe-executor.js";
import { createObserveWorkflow, type ObserveWorkflow, type ObserveWorkflowBrowserLifecycle } from "./observe-workflow.js";
import { SopDemonstrationRecorder } from "./support/sop-demonstration-recorder.js";

export interface ObserveWorkflowFactoryOptions {
  browserLifecycle: ObserveWorkflowBrowserLifecycle;
  logger: Logger;
  cdpEndpoint: string;
  observeTimeoutMs: number;
  createRunId: () => string;
  createArtifactsWriter: (runId: string) => ObserveArtifactsWriter;
  sopAssetStore: ObserveAssetStore;
  createRecorder: () => ObserveRecorder;
  telemetryRegistry: RuntimeTelemetryRegistry;
}

export function createObserveWorkflowFactory(
  options: ObserveWorkflowFactoryOptions
): (taskHint: string) => ObserveWorkflow {
  return (taskHint: string): ObserveWorkflow => {
    const observeExecutor = new ObserveExecutor({
      logger: options.logger,
      cdpEndpoint: options.cdpEndpoint,
      observeTimeoutMs: options.observeTimeoutMs,
      createRunId: options.createRunId,
      sopRecorder: new SopDemonstrationRecorder(),
      createArtifactsWriter: options.createArtifactsWriter,
      sopAssetStore: options.sopAssetStore,
      createRecorder: options.createRecorder,
      telemetryRegistry: options.telemetryRegistry,
    });

    return createObserveWorkflow({
      browserLifecycle: options.browserLifecycle,
      observeExecutor,
      taskHint,
    });
  };
}
