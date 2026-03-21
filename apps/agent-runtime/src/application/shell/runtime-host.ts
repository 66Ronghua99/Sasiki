/**
 * Deps: application/shell/workflow-contract.ts
 * Used By: application/shell/workflow-runtime.ts
 * Last Updated: 2026-03-21
 */
import type { HostedWorkflow } from "./workflow-contract.js";

export interface RuntimeHostOptions<T> {
  workflow?: HostedWorkflow<T>;
}

export class RuntimeHost<T = never> {
  private readonly workflow?: HostedWorkflow<T>;
  private activeWorkflow: HostedWorkflow<unknown> | null = null;
  private started = false;
  private disposePromise: Promise<void> | null = null;

  constructor(options: RuntimeHostOptions<T> = {}) {
    this.workflow = options.workflow;
  }

  async run<TResult>(workflow: HostedWorkflow<TResult>): Promise<TResult> {
    this.claimWorkflow(workflow);
    try {
      await this.startActiveWorkflow();
      return await workflow.execute();
    } finally {
      await this.disposeActiveWorkflow(workflow);
    }
  }

  async start(): Promise<void> {
    this.claimWorkflow(this.requireWorkflow());
    await this.startActiveWorkflow();
  }

  async execute(): Promise<T> {
    await this.start();
    return this.requireWorkflow().execute();
  }

  async requestInterrupt(signal: "SIGINT" | "SIGTERM"): Promise<boolean> {
    if (!this.activeWorkflow) {
      return false;
    }
    return this.activeWorkflow.requestInterrupt(signal);
  }

  async dispose(): Promise<void> {
    if (!this.activeWorkflow) {
      return;
    }
    await this.disposeActiveWorkflow(this.activeWorkflow);
  }

  private requireWorkflow(): HostedWorkflow<T> {
    if (!this.workflow) {
      throw new Error("runtime host requires a bound workflow");
    }
    return this.workflow;
  }

  private claimWorkflow<TResult>(workflow: HostedWorkflow<TResult>): void {
    if (this.activeWorkflow && this.activeWorkflow !== workflow) {
      throw new Error("runtime host already owns an active workflow");
    }
    if (!this.activeWorkflow) {
      this.activeWorkflow = workflow as HostedWorkflow<unknown>;
    }
  }

  private async startActiveWorkflow(): Promise<void> {
    if (!this.activeWorkflow || this.started) {
      return;
    }
    try {
      await this.activeWorkflow.prepare();
      this.started = true;
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }

  private async disposeActiveWorkflow(workflow: HostedWorkflow<unknown>): Promise<void> {
    if (this.disposePromise) {
      await this.disposePromise;
      return;
    }

    let disposePromise: Promise<void> | null = null;
    disposePromise = (async () => {
      try {
        await workflow.dispose();
      } finally {
        if (this.activeWorkflow === workflow) {
          this.activeWorkflow = null;
          this.started = false;
        }
        if (this.disposePromise === disposePromise) {
          this.disposePromise = null;
        }
      }
    })();

    this.disposePromise = disposePromise;
    await disposePromise;
  }
}
