/**
 * Deps: domain/agent-types.ts, application/observe/observe-workflow.ts
 * Used By: application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import type { ObserveRunResult } from "../../domain/agent-types.js";
import { ObserveWorkflow } from "./observe-workflow.js";

export interface ObserveRuntimeOptions {
  createWorkflow: (taskHint: string) => ObserveWorkflow;
}

export class ObserveRuntime {
  private readonly createWorkflow: (taskHint: string) => ObserveWorkflow;
  private activeWorkflow: ObserveWorkflow | null = null;

  constructor(options: ObserveRuntimeOptions) {
    this.createWorkflow = options.createWorkflow;
  }

  async observe(taskHint: string): Promise<ObserveRunResult> {
    const workflow = this.createWorkflow(taskHint);
    this.activeWorkflow = workflow;
    try {
      return await workflow.execute();
    } finally {
      try {
        await workflow.dispose();
      } finally {
        if (this.activeWorkflow === workflow) {
          this.activeWorkflow = null;
        }
      }
    }
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean> {
    if (!this.activeWorkflow) {
      return false;
    }
    return this.activeWorkflow.requestInterrupt(signalName);
  }
}
