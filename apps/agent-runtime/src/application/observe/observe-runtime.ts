/**
 * Deps: domain/agent-types.ts, application/observe/observe-workflow.ts, application/shell/runtime-host.ts
 * Used By: application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import type { ObserveRunResult } from "../../domain/agent-types.js";
import type { Logger } from "../../contracts/logger.js";
import type { PlaywrightDemonstrationRecorder } from "../../infrastructure/browser/playwright-demonstration-recorder.js";
import { RuntimeHost } from "../shell/runtime-host.js";
import { ObserveExecutor } from "./observe-executor.js";
import { ObserveWorkflow } from "./observe-workflow.js";
import type { SopDemonstrationRecorder } from "./support/sop-demonstration-recorder.js";

type ObserveRuntimeLogger = Logger & {
  toText(): string;
};

export interface ObserveRuntimeOptions {
  createWorkflow: (taskHint: string) => ObserveWorkflow;
}

export class ObserveRuntime {
  private readonly createWorkflow: (taskHint: string) => ObserveWorkflow;
  private activeHost: RuntimeHost<ObserveRunResult> | null = null;

  constructor(options: ObserveRuntimeOptions) {
    this.createWorkflow = options.createWorkflow;
  }

  async observe(taskHint: string): Promise<ObserveRunResult> {
    const host = new RuntimeHost({ workflow: this.createWorkflow(taskHint) });
    this.activeHost = host;
    try {
      await host.start();
      return await host.execute();
    } finally {
      try {
        await host.dispose();
      } finally {
        if (this.activeHost === host) {
          this.activeHost = null;
        }
      }
    }
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean> {
    if (!this.activeHost) {
      return false;
    }
    return this.activeHost.requestInterrupt(signalName);
  }
}

export interface ObserveRuntimeFactoryOptions {
  logger: ObserveRuntimeLogger;
  cdpEndpoint: string;
  observeTimeoutMs: number;
  artifactsDir: string;
  createRunId: () => string;
  sopAssetRootDir: string;
  browserLifecycle: {
    prepareObserveSession(): Promise<void>;
  };
  createSopRecorder: () => SopDemonstrationRecorder;
  createRecorder: () => PlaywrightDemonstrationRecorder;
  createObserveExecutor?: (options: import("./observe-executor.js").ObserveExecutorOptions) => ObserveExecutor;
}

export function createObserveRuntime(options: ObserveRuntimeFactoryOptions): ObserveRuntime {
  return new ObserveRuntime({
    createWorkflow: (taskHint: string) =>
      new ObserveWorkflow({
        browserLifecycle: options.browserLifecycle,
        observeExecutor: options.createObserveExecutor?.({
          logger: options.logger,
          cdpEndpoint: options.cdpEndpoint,
          observeTimeoutMs: options.observeTimeoutMs,
          artifactsDir: options.artifactsDir,
          createRunId: options.createRunId,
          sopRecorder: options.createSopRecorder(),
          sopAssetRootDir: options.sopAssetRootDir,
          createRecorder: options.createRecorder,
        }) ??
          new ObserveExecutor({
            logger: options.logger,
            cdpEndpoint: options.cdpEndpoint,
            observeTimeoutMs: options.observeTimeoutMs,
            artifactsDir: options.artifactsDir,
            createRunId: options.createRunId,
            sopRecorder: options.createSopRecorder(),
            sopAssetRootDir: options.sopAssetRootDir,
            createRecorder: options.createRecorder,
          }),
        taskHint,
      }),
  });
}
