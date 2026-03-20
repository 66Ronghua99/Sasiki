/**
 * Deps: domain/agent-types.ts, application/observe/observe-executor.ts
 * Used By: application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import type { ObserveRunResult } from "../../domain/agent-types.js";
import { ObserveExecutor } from "./observe-executor.js";

export interface ObserveRuntimeOptions {
  observeExecutor: ObserveExecutor;
}

export class ObserveRuntime {
  private readonly observeExecutor: ObserveExecutor;

  constructor(options: ObserveRuntimeOptions) {
    this.observeExecutor = options.observeExecutor;
  }

  async observe(taskHint: string): Promise<ObserveRunResult> {
    return this.observeExecutor.execute(taskHint);
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean> {
    return this.observeExecutor.requestInterrupt(signalName);
  }
}
