/**
 * Deps: domain/agent-types.ts, application/config/runtime-config.ts, application/shell/runtime-composition-root.ts
 * Used By: index.ts, runtime/agent-runtime.ts
 * Last Updated: 2026-03-21
 */
import type { AgentRunResult, ObserveRunResult } from "../../domain/agent-types.js";
import type { InteractiveSopCompactResult } from "../compact/interactive-sop-compact.js";
import type { CliArguments, SopCompactCliArguments } from "./command-router.js";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { createRuntimeComposition, type RuntimeComposition } from "./runtime-composition-root.js";
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
  createRuntimeHost?: () => RuntimeHostLike;
}

export interface RuntimeHostLike {
  run<T>(workflow: HostedWorkflow<T>): Promise<T>;
  requestInterrupt(signal: "SIGINT" | "SIGTERM"): Promise<boolean>;
  dispose(): Promise<void>;
}

export class WorkflowRuntime {
  private readonly observeWorkflowFactory: RuntimeComposition["observeWorkflowFactory"];
  private readonly refineWorkflowFactory: RuntimeComposition["refineWorkflowFactory"];
  private readonly compactWorkflowFactory: RuntimeComposition["compactWorkflowFactory"];
  private readonly createWorkflowRegistry: typeof createWorkflowRegistry;
  private readonly runtimeHost: RuntimeHostLike;

  constructor(config: RuntimeConfig, dependencies: WorkflowRuntimeDependencies = {}) {
    const composition = (dependencies.createRuntimeComposition ?? createRuntimeComposition)(config);
    this.observeWorkflowFactory = composition.observeWorkflowFactory;
    this.refineWorkflowFactory = composition.refineWorkflowFactory;
    this.compactWorkflowFactory = composition.compactWorkflowFactory;
    this.createWorkflowRegistry = dependencies.createWorkflowRegistry ?? createWorkflowRegistry;
    this.runtimeHost = (dependencies.createRuntimeHost ?? (() => new RuntimeHost()))();
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
        if (workflowTask === undefined) {
          throw new Error("missing task for refine workflow");
        }
        return this.refineWorkflowFactory({
          task: workflowTask,
          resumeRunId: request.command === "refine" ? request.resumeRunId : undefined,
        });
      },
      "sop-compact": () => {
        const compactRequest = request as SopCompactCliArguments;
        return this.compactWorkflowFactory({
          runId: compactRequest.runId,
          semanticMode: compactRequest.semanticMode,
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

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean> {
    return this.runtimeHost.requestInterrupt(signalName);
  }

  async stop(): Promise<void> {
    await this.runtimeHost.dispose();
  }

  private async executeWorkflow<T>(workflowFactory: () => HostedWorkflow<T>): Promise<T> {
    return this.runtimeHost.run(workflowFactory());
  }
}
