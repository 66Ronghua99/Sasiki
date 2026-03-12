/**
 * Deps: core/agent-loop.ts, domain/agent-types.ts, runtime/run-executor.ts
 * Used By: runtime/workflow-runtime.ts
 * Last Updated: 2026-03-06
 */
import type { AgentLoop } from "../core/agent-loop.js";
import type { AgentRunRequest, AgentRunResult } from "../domain/agent-types.js";

export interface AgentRunExecutor {
  execute(request: AgentRunRequest): Promise<AgentRunResult>;
  requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean>;
}

export interface AgentExecutionRuntimeOptions {
  loop: AgentLoop;
  runExecutor: AgentRunExecutor;
}

export class AgentExecutionRuntime {
  private readonly loop: AgentLoop;
  private readonly runExecutor: AgentRunExecutor;
  private loopInitialized = false;

  constructor(options: AgentExecutionRuntimeOptions) {
    this.loop = options.loop;
    this.runExecutor = options.runExecutor;
  }

  async start(): Promise<void> {
    await this.ensureLoopInitialized();
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    await this.ensureLoopInitialized();
    return this.runExecutor.execute(request);
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean> {
    return this.runExecutor.requestInterrupt(signalName);
  }

  async stop(): Promise<void> {
    if (!this.loopInitialized) {
      return;
    }
    await this.loop.shutdown();
    this.loopInitialized = false;
  }

  private async ensureLoopInitialized(): Promise<void> {
    if (this.loopInitialized) {
      return;
    }
    await this.loop.initialize();
    this.loopInitialized = true;
  }
}
