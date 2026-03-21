/**
 * Deps: application/observe/observe-executor.ts, shell/workflow-contract.ts
 * Used By: application/observe/observe-runtime.ts
 * Last Updated: 2026-03-21
 */
import type { ObserveRunResult } from "../../domain/agent-types.js";
import type { HostedWorkflow } from "../shell/workflow-contract.js";
import type { ObserveExecutor } from "./observe-executor.js";

export interface ObserveWorkflowBrowserLifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
  prepareObserveSession(): Promise<void>;
}

export interface ObserveWorkflowOptions {
  browserLifecycle: ObserveWorkflowBrowserLifecycle;
  observeExecutor: Pick<ObserveExecutor, "execute" | "requestInterrupt">;
  taskHint: string;
}

export class ObserveWorkflow implements HostedWorkflow<ObserveRunResult> {
  private readonly browserLifecycle: ObserveWorkflowBrowserLifecycle;
  private readonly observeExecutor: Pick<ObserveExecutor, "execute" | "requestInterrupt">;
  private readonly taskHint: string;

  constructor(options: ObserveWorkflowOptions) {
    this.browserLifecycle = options.browserLifecycle;
    this.observeExecutor = options.observeExecutor;
    this.taskHint = options.taskHint;
  }

  async prepare(): Promise<void> {
    await this.browserLifecycle.start();
    await this.browserLifecycle.prepareObserveSession();
  }

  async execute(): Promise<ObserveRunResult> {
    return this.observeExecutor.execute(this.taskHint);
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean> {
    return this.observeExecutor.requestInterrupt(signalName);
  }

  async dispose(): Promise<void> {
    await this.browserLifecycle.stop();
  }
}

export function createObserveWorkflow(options: ObserveWorkflowOptions): ObserveWorkflow {
  return new ObserveWorkflow(options);
}
