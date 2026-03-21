/**
 * Deps: application/shell/workflow-contract.ts
 * Used By: application/shell/workflow-runtime.ts
 * Last Updated: 2026-03-21
 */
import type { HostedWorkflow } from "./workflow-contract.js";

export interface RuntimeHostOptions<T> {
  workflow: HostedWorkflow<T>;
}

export class RuntimeHost<T> {
  private readonly workflow: HostedWorkflow<T>;
  private started = false;

  constructor(options: RuntimeHostOptions<T>) {
    this.workflow = options.workflow;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    try {
      await this.workflow.prepare();
      this.started = true;
    } catch (error) {
      await this.workflow.dispose();
      throw error;
    }
  }

  async execute(): Promise<T> {
    await this.start();
    return this.workflow.execute();
  }

  async requestInterrupt(signal: "SIGINT" | "SIGTERM"): Promise<boolean> {
    if (!this.started) {
      return false;
    }
    return this.workflow.requestInterrupt(signal);
  }

  async dispose(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.started = false;
    await this.workflow.dispose();
  }
}
