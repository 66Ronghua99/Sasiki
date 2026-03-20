/**
 * Deps: domain/agent-types.ts, runtime/runtime-composition-root.ts
 * Used By: index.ts, runtime/agent-runtime.ts
 * Last Updated: 2026-03-21
 */
import type { AgentRunRequest, AgentRunResult, ObserveRunResult, RuntimeMode } from "../domain/agent-types.js";
import type { RuntimeConfig } from "./runtime-config.js";
import {
  createRuntimeComposition,
  type BrowserLifecycle,
  type RuntimeComposition,
} from "./runtime-composition-root.js";

export class WorkflowRuntime {
  private readonly browserLifecycle: BrowserLifecycle;
  private readonly agentRuntime: RuntimeComposition["agentRuntime"];
  private readonly observeRuntime: RuntimeComposition["observeRuntime"];
  private started = false;

  constructor(config: RuntimeConfig) {
    const composition = createRuntimeComposition(config);
    this.browserLifecycle = composition.browserLifecycle;
    this.agentRuntime = composition.agentRuntime;
    this.observeRuntime = composition.observeRuntime;
  }

  async start(mode: RuntimeMode = "refine"): Promise<void> {
    if (!this.started) {
      await this.browserLifecycle.start();
      this.started = true;
    }
    if (mode === "observe") {
      await this.browserLifecycle.prepareObserveSession();
    }
    if (mode === "refine") {
      await this.agentRuntime.start();
    }
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    return this.agentRuntime.run(request);
  }

  async observe(taskHint: string): Promise<ObserveRunResult> {
    return this.observeRuntime.observe(taskHint);
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<void> {
    if (await this.observeRuntime.requestInterrupt(signalName)) {
      return;
    }
    await this.agentRuntime.requestInterrupt(signalName);
  }

  async stop(): Promise<void> {
    await this.agentRuntime.stop();
    if (!this.started) {
      return;
    }
    await this.browserLifecycle.stop();
    this.started = false;
  }
}
