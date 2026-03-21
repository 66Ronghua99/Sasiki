/**
 * Deps: domain/agent-types.ts, application/observe/observe-workflow.ts, application/shell/runtime-host.ts
 * Used By: application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import type { ObserveRunResult } from "../../domain/agent-types.js";
import { RuntimeHost } from "../shell/runtime-host.js";
import { ObserveWorkflow } from "./observe-workflow.js";

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

export function createObserveRuntime(options: ObserveRuntimeOptions): ObserveRuntime {
  return new ObserveRuntime(options);
}
