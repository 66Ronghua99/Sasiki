/**
 * Deps: domain/agent-types.ts, application/config/runtime-config.ts, application/shell/runtime-composition-root.ts, application/compact/interactive-sop-compact.ts
 * Used By: index.ts, runtime/agent-runtime.ts
 * Last Updated: 2026-03-21
 */
import type { AgentRunRequest, AgentRunResult, ObserveRunResult } from "../../domain/agent-types.js";
import type { InteractiveSopCompactResult } from "../compact/interactive-sop-compact.js";
import { InteractiveSopCompactService } from "../compact/interactive-sop-compact.js";
import { createCompactWorkflow } from "../compact/compact-workflow.js";
import type { CliArguments, SopCompactCliArguments } from "./command-router.js";
import type { RuntimeConfig, RuntimeSemanticMode } from "../config/runtime-config.js";
import {
  createRuntimeComposition,
  type BrowserLifecycle,
  type RuntimeComposition,
} from "./runtime-composition-root.js";
import { RuntimeHost } from "./runtime-host.js";
import { createWorkflowRegistry } from "./workflow-registry.js";
import type { HostedWorkflow } from "./workflow-contract.js";

type WorkflowRuntimeCommandRequest =
  | Extract<CliArguments, { command: "observe" }>
  | Extract<CliArguments, { command: "refine" }>
  | Extract<CliArguments, { command: "sop-compact" }>;

export interface WorkflowRuntimeDependencies {
  createRuntimeComposition?: typeof createRuntimeComposition;
  createWorkflowRegistry?: typeof createWorkflowRegistry;
  createRuntimeHost?: <T>(workflow: HostedWorkflow<T>) => RuntimeHostLike<T>;
}

export interface RuntimeHostLike<T> {
  start(): Promise<void>;
  execute(): Promise<T>;
  requestInterrupt(signal: "SIGINT" | "SIGTERM"): Promise<boolean>;
  dispose(): Promise<void>;
}

export class WorkflowRuntime {
  private readonly config: RuntimeConfig;
  private readonly browserLifecycle: BrowserLifecycle;
  private readonly agentRuntime: RuntimeComposition["agentRuntime"];
  private readonly observeRuntime: RuntimeComposition["observeRuntime"];
  private readonly observeWorkflowFactory: RuntimeComposition["observeWorkflowFactory"];
  private readonly refineWorkflowFactory: RuntimeComposition["refineWorkflowFactory"];
  private readonly createWorkflowRegistry: typeof createWorkflowRegistry;
  private readonly createRuntimeHost: <T>(workflow: HostedWorkflow<T>) => RuntimeHostLike<T>;
  private activeHost: RuntimeHostLike<unknown> | null = null;
  private activeWorkflow: HostedWorkflow<unknown> | null = null;

  constructor(config: RuntimeConfig, dependencies: WorkflowRuntimeDependencies = {}) {
    this.config = config;
    const composition = (dependencies.createRuntimeComposition ?? createRuntimeComposition)(config);
    this.browserLifecycle = composition.browserLifecycle;
    this.agentRuntime = composition.agentRuntime;
    this.observeRuntime = composition.observeRuntime;
    this.observeWorkflowFactory = composition.observeWorkflowFactory;
    this.refineWorkflowFactory = composition.refineWorkflowFactory;
    this.createWorkflowRegistry = dependencies.createWorkflowRegistry ?? createWorkflowRegistry;
    this.createRuntimeHost =
      dependencies.createRuntimeHost ?? ((workflow) => new RuntimeHost({ workflow }));
  }

  async execute(request: WorkflowRuntimeCommandRequest): Promise<ObserveRunResult | AgentRunResult | InteractiveSopCompactResult> {
    const workflowTask = request.command === "observe" || request.command === "refine" ? request.task : undefined;
    const registry = this.createWorkflowRegistry({
      observe: () => {
        if (!workflowTask) {
          throw new Error("missing task for observe workflow");
        }
        return this.observeWorkflowFactory(workflowTask);
      },
      refine: () => {
        if (!workflowTask) {
          throw new Error("missing task for refine workflow");
        }
        return this.refineWorkflowFactory({
          task: workflowTask,
          resumeRunId: request.command === "refine" ? request.resumeRunId : undefined,
        });
      },
      "sop-compact": () => {
        const compactRequest = request as SopCompactCliArguments;
        const compactSemanticMode: RuntimeSemanticMode = compactRequest.semanticMode ?? this.config.semanticMode;
        const compactService = new InteractiveSopCompactService(this.config.artifactsDir, {
          semantic: {
            mode: compactSemanticMode,
            timeoutMs: this.config.semanticTimeoutMs,
            model: this.config.model,
            apiKey: this.config.apiKey,
            baseUrl: this.config.baseUrl,
            thinkingLevel: this.config.thinkingLevel,
          },
        });
        return createCompactWorkflow({
          service: compactService,
          runId: compactRequest.runId,
        });
      },
    });
    const factory = registry.resolve(request.command);
    if (!factory) {
      throw new Error(`missing workflow factory for command: ${request.command}`);
    }
    if (request.command === "observe") {
      return this.executeWorkflow<ObserveRunResult>(factory as () => HostedWorkflow<ObserveRunResult>);
    }
    if (request.command === "sop-compact") {
      return this.executeWorkflow<InteractiveSopCompactResult>(
        factory as () => HostedWorkflow<InteractiveSopCompactResult>
      );
    }
    return this.executeWorkflow<AgentRunResult>(factory as () => HostedWorkflow<AgentRunResult>);
  }

  async start(): Promise<void> {
    // Transitional compatibility shim: workflow execution now owns lifecycle via RuntimeHost.
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    return (await this.execute({
      command: "refine",
      task: request.task,
      resumeRunId: request.resumeRunId,
    })) as AgentRunResult;
  }

  async observe(taskHint: string): Promise<ObserveRunResult> {
    return (await this.execute({
      command: "observe",
      task: taskHint,
    })) as ObserveRunResult;
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<void> {
    if (this.activeHost) {
      if (await this.activeHost.requestInterrupt(signalName)) {
        return;
      }
    }
    if (this.activeWorkflow) {
      if (await this.activeWorkflow.requestInterrupt(signalName)) {
        return;
      }
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
    const workflow = workflowFactory();
    const host = this.createRuntimeHost(workflow);
    this.activeHost = host as RuntimeHostLike<unknown>;
    this.activeWorkflow = workflow as HostedWorkflow<unknown>;
    try {
      await host.start();
      return await host.execute();
    } finally {
      await host.dispose();
      if (this.activeHost === host) {
        this.activeHost = null;
      }
      if (this.activeWorkflow === workflow) {
        this.activeWorkflow = null;
      }
    }
  }
}
