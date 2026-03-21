/**
 * Deps: domain/agent-types.ts, application/config/runtime-config.ts, application/shell/runtime-composition-root.ts
 * Used By: index.ts, runtime/agent-runtime.ts
 * Last Updated: 2026-03-21
 */
import type { AgentRunRequest, AgentRunResult, ObserveRunResult, RuntimeMode } from "../../domain/agent-types.js";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { RuntimeHost } from "./runtime-host.js";
import { createWorkflowRegistry } from "./workflow-registry.js";
import type { HostedWorkflow } from "./workflow-contract.js";
import {
  createRuntimeComposition,
  type BrowserLifecycle,
  type RuntimeComposition,
} from "./runtime-composition-root.js";

export class WorkflowRuntime {
  private readonly browserLifecycle: BrowserLifecycle;
  private readonly agentRuntime: RuntimeComposition["agentRuntime"];
  private readonly observeRuntime: RuntimeComposition["observeRuntime"];
  private activeHost: RuntimeHost<unknown> | null = null;

  constructor(config: RuntimeConfig) {
    const composition = createRuntimeComposition(config);
    this.browserLifecycle = composition.browserLifecycle;
    this.agentRuntime = composition.agentRuntime;
    this.observeRuntime = composition.observeRuntime;
  }

  async start(_mode: RuntimeMode = "refine"): Promise<void> {
    // Transitional compatibility shim: the selected workflow now owns lifecycle through RuntimeHost.
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const registry = createWorkflowRegistry({
      refine: () => this.createRefineWorkflow(request),
    });
    const factory = registry.resolve("refine") as (() => HostedWorkflow<AgentRunResult>) | undefined;
    if (!factory) {
      throw new Error("missing refine workflow factory");
    }
    return this.executeWorkflow<AgentRunResult>(factory);
  }

  async observe(taskHint: string): Promise<ObserveRunResult> {
    const registry = createWorkflowRegistry({
      observe: () => this.createObserveWorkflow(taskHint),
    });
    const factory = registry.resolve("observe") as (() => HostedWorkflow<ObserveRunResult>) | undefined;
    if (!factory) {
      throw new Error("missing observe workflow factory");
    }
    return this.executeWorkflow<ObserveRunResult>(factory);
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<void> {
    if (this.activeHost) {
      await this.activeHost.requestInterrupt(signalName);
      return;
    }
    if (await this.observeRuntime.requestInterrupt(signalName)) {
      return;
    }
    await this.agentRuntime.requestInterrupt(signalName);
  }

  async stop(): Promise<void> {
    if (!this.activeHost) {
      return;
    }
    await this.activeHost.dispose();
    this.activeHost = null;
  }

  private async executeWorkflow<T>(workflowFactory: () => HostedWorkflow<T>): Promise<T> {
    const host = new RuntimeHost({ workflow: workflowFactory() });
    this.activeHost = host as RuntimeHost<unknown>;
    try {
      await host.start();
      return await host.execute();
    } finally {
      await host.dispose();
      if (this.activeHost === host) {
        this.activeHost = null;
      }
    }
  }

  private createObserveWorkflow(taskHint: string): HostedWorkflow<ObserveRunResult> {
    return {
      prepare: async () => {
        await this.browserLifecycle.start();
        await this.browserLifecycle.prepareObserveSession();
      },
      execute: async () => this.observeRuntime.observe(taskHint),
      requestInterrupt: async (signalName) => this.observeRuntime.requestInterrupt(signalName),
      dispose: async () => {
        await this.agentRuntime.stop();
        await this.browserLifecycle.stop();
      },
    };
  }

  private createRefineWorkflow(request: AgentRunRequest): HostedWorkflow<AgentRunResult> {
    return {
      prepare: async () => {
        await this.browserLifecycle.start();
        await this.agentRuntime.start();
      },
      execute: async () => this.agentRuntime.run(request),
      requestInterrupt: async (signalName) => {
        if (await this.observeRuntime.requestInterrupt(signalName)) {
          return true;
        }
        return this.agentRuntime.requestInterrupt(signalName);
      },
      dispose: async () => {
        await this.agentRuntime.stop();
        await this.browserLifecycle.stop();
      },
    };
  }
}
