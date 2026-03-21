/**
 * Deps: application/observe/observe-executor.ts, application/observe/observe-workflow.ts, application/observe/support/sop-demonstration-recorder.ts, infrastructure/browser/playwright-demonstration-recorder.ts
 * Used By: application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import { PlaywrightDemonstrationRecorder } from "../../infrastructure/browser/playwright-demonstration-recorder.js";
import type { RuntimeLogger } from "../../infrastructure/logging/runtime-logger.js";
import { ObserveExecutor } from "./observe-executor.js";
import { createObserveWorkflow, type ObserveWorkflow, type ObserveWorkflowBrowserLifecycle } from "./observe-workflow.js";
import { SopDemonstrationRecorder } from "./support/sop-demonstration-recorder.js";

export interface ObserveWorkflowFactoryOptions {
  browserLifecycle: ObserveWorkflowBrowserLifecycle;
  logger: RuntimeLogger;
  cdpEndpoint: string;
  observeTimeoutMs: number;
  artifactsDir: string;
  createRunId: () => string;
  sopAssetRootDir: string;
}

export function createObserveWorkflowFactory(
  options: ObserveWorkflowFactoryOptions
): (taskHint: string) => ObserveWorkflow {
  return (taskHint: string): ObserveWorkflow => {
    const observeExecutor = new ObserveExecutor({
      logger: options.logger,
      cdpEndpoint: options.cdpEndpoint,
      observeTimeoutMs: options.observeTimeoutMs,
      artifactsDir: options.artifactsDir,
      createRunId: options.createRunId,
      sopRecorder: new SopDemonstrationRecorder(),
      sopAssetRootDir: options.sopAssetRootDir,
      createRecorder: () => new PlaywrightDemonstrationRecorder(),
    });

    return createObserveWorkflow({
      browserLifecycle: options.browserLifecycle,
      observeExecutor,
      taskHint,
    });
  };
}
