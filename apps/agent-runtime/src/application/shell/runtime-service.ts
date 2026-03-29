import type { AgentRunResult, ObserveRunResult } from "../../domain/agent-types.js";
import type { InteractiveSopCompactResult } from "../compact/interactive-sop-compact.js";
import type { RuntimeSemanticMode, CliArguments } from "./command-router.js";
import { parseCliArguments } from "./command-router.js";
import type { RuntimeConfig } from "../config/runtime-config.js";
import type { RuntimeEvent, RuntimeTelemetrySink } from "../../contracts/runtime-telemetry.js";
import { CallbackTelemetrySink } from "../../infrastructure/logging/callback-telemetry-sink.js";
import {
  WorkflowRuntime,
  type WorkflowRuntimeCommandRequest,
  type WorkflowRuntimeDependencies,
} from "./workflow-runtime.js";
import { createRuntimeComposition } from "./runtime-composition-root.js";

export type RuntimeServiceWorkflow = "observe" | "sop-compact" | "refine";

export type RuntimeServiceCommandRequest =
  | Extract<CliArguments, { command: "observe" }>
  | Extract<CliArguments, { command: "refine" }>
  | Extract<CliArguments, { command: "sop-compact" }>;

export type RuntimeServiceResult =
  | ObserveRunResult
  | AgentRunResult
  | InteractiveSopCompactResult
  | Array<unknown>;

export type RuntimeServiceEvent =
  | {
      type: "run.started";
      workflow: RuntimeServiceWorkflow;
      timestamp: string;
      status: "running";
    }
  | {
      type: "run.log";
      workflow: RuntimeServiceWorkflow;
      timestamp: string;
      level: "info" | "warning" | "error";
      message: string;
    }
  | {
      type: "run.finished";
      workflow: RuntimeServiceWorkflow;
      timestamp: string;
      status: "completed" | "failed";
      resultSummary?: string;
    }
  | {
      type: "run.interrupted";
      workflow: RuntimeServiceWorkflow;
      timestamp: string;
      status: "interrupted";
      reason?: string;
    };

export interface RuntimeServiceHooks {
  onEvent?(event: RuntimeServiceEvent): void;
}

export interface RuntimeServiceLike {
  runCommand(
    request: RuntimeServiceCommandRequest,
    hooks?: RuntimeServiceHooks,
  ): Promise<RuntimeServiceResult>;
  requestInterrupt(signal: "SIGINT" | "SIGTERM"): Promise<boolean>;
  stop(): Promise<void>;
}

export interface RuntimeServiceDependencies extends WorkflowRuntimeDependencies {
  parseCliArguments?: typeof parseCliArguments;
  createRuntimeServiceRuntime?: (
    config: RuntimeConfig,
    dependencies: WorkflowRuntimeDependencies,
  ) => RuntimeServiceLike;
}

interface ActiveRuntimeContext {
  runtime: RuntimeServiceLike;
  workflow: RuntimeServiceWorkflow;
  hooks: RuntimeServiceHooks;
}

export class RuntimeService {
  private readonly parseCliArguments: typeof parseCliArguments;
  private activeRuntime: ActiveRuntimeContext | null = null;

  constructor(
    private readonly config: RuntimeConfig,
    private readonly dependencies: RuntimeServiceDependencies = {},
  ) {
    this.parseCliArguments = dependencies.parseCliArguments ?? parseCliArguments;
  }

  async runObserve(
    request: { task: string },
    hooks: RuntimeServiceHooks = {},
  ): Promise<ObserveRunResult> {
    return this.runCommand(
      {
        command: "observe",
        task: request.task,
      },
      hooks,
    ) as Promise<ObserveRunResult>;
  }

  async runCompact(
    request: { runId: string; semanticMode?: RuntimeSemanticMode },
    hooks: RuntimeServiceHooks = {},
  ): Promise<InteractiveSopCompactResult> {
    return this.runCommand(
      {
        command: "sop-compact",
        action: "run",
        runId: request.runId,
        semanticMode: request.semanticMode,
      },
      hooks,
    ) as Promise<InteractiveSopCompactResult>;
  }

  async runRefine(
    request: { task?: string; skillName?: string; resumeRunId?: string },
    hooks: RuntimeServiceHooks = {},
  ): Promise<AgentRunResult> {
    return this.runCommand(
      {
        command: "refine",
        task: request.task ?? "",
        skillName: request.skillName,
        resumeRunId: request.resumeRunId,
      },
      hooks,
    ) as Promise<AgentRunResult>;
  }

  async runFromCliArguments(
    argv: string[],
    hooks: RuntimeServiceHooks = {},
  ): Promise<RuntimeServiceResult> {
    const parsed = this.parseCliArguments(argv);
    return this.runCommand(parsed, hooks);
  }

  async runCommand(
    request: RuntimeServiceCommandRequest,
    hooks: RuntimeServiceHooks = {},
  ): Promise<RuntimeServiceResult> {
    if (this.activeRuntime) {
      throw new Error("runtime service already has an active run");
    }

    const workflow = resolveRuntimeServiceWorkflow(request);
    const runtime = this.createRuntime(hooks);
    this.activeRuntime = { runtime, workflow, hooks };

    if (!(request.command === "sop-compact" && request.action === "list")) {
      hooks.onEvent?.({
        type: "run.started",
        workflow,
        timestamp: new Date().toISOString(),
        status: "running",
      });
    }

    try {
      const result = await runtime.runCommand(request, hooks);

      if (!(request.command === "sop-compact" && request.action === "list")) {
        hooks.onEvent?.({
          type: "run.finished",
          workflow,
          timestamp: new Date().toISOString(),
          status: "completed",
          resultSummary: summarizeRuntimeResult(result),
        });
      }

      return result;
    } catch (error) {
      hooks.onEvent?.({
        type: "run.finished",
        workflow,
        timestamp: new Date().toISOString(),
        status: "failed",
        resultSummary: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.activeRuntime = null;
      await runtime.stop();
    }
  }

  async requestInterrupt(signal: "SIGINT" | "SIGTERM"): Promise<boolean> {
    if (!this.activeRuntime) {
      return false;
    }

    const interrupted = await this.activeRuntime.runtime.requestInterrupt(signal);
    if (interrupted) {
      this.activeRuntime.hooks.onEvent?.({
        type: "run.interrupted",
        workflow: this.activeRuntime.workflow,
        timestamp: new Date().toISOString(),
        status: "interrupted",
        reason: signal,
      });
    }
    return interrupted;
  }

  async stop(): Promise<void> {
    if (!this.activeRuntime) {
      return;
    }
    await this.activeRuntime.runtime.stop();
    this.activeRuntime = null;
  }

  private createRuntime(hooks: RuntimeServiceHooks): RuntimeServiceLike {
    if (this.dependencies.createRuntimeServiceRuntime) {
      return this.dependencies.createRuntimeServiceRuntime(
        this.config,
        this.buildWorkflowRuntimeDependencies(hooks),
      );
    }

    const runtime = new WorkflowRuntime(this.config, this.buildWorkflowRuntimeDependencies(hooks));
    return {
      runCommand(request) {
        return runtime.execute(request);
      },
      requestInterrupt(signal) {
        return runtime.requestInterrupt(signal);
      },
      stop() {
        return runtime.stop();
      },
    };
  }

  private buildWorkflowRuntimeDependencies(hooks: RuntimeServiceHooks): WorkflowRuntimeDependencies {
    const extraSinks = hooks.onEvent
      ? [new CallbackTelemetrySink((event) => this.forwardTelemetryEvent(event, hooks)) as RuntimeTelemetrySink]
      : [];
    const baseFactory = this.dependencies.createRuntimeComposition ?? createRuntimeComposition;

    return {
      ...this.dependencies,
      createRuntimeComposition: (config) =>
        baseFactory(config, {
          createAdditionalTelemetrySinks: () => extraSinks,
        }),
    };
  }

  private forwardTelemetryEvent(event: RuntimeEvent, hooks: RuntimeServiceHooks): void {
    const mapped = mapRuntimeTelemetryEvent(event);
    if (mapped) {
      hooks.onEvent?.(mapped);
    }
  }
}

function resolveRuntimeServiceWorkflow(request: RuntimeServiceCommandRequest): RuntimeServiceWorkflow {
  if (request.command === "sop-compact") {
    return "sop-compact";
  }
  return request.command;
}

function mapRuntimeTelemetryEvent(event: RuntimeEvent): RuntimeServiceEvent | null {
  if (event.eventType === "workflow.lifecycle") {
    const phase = typeof event.payload.phase === "string" ? event.payload.phase : "";
    if (phase === "started" || phase === "finished" || phase === "failed" || phase === "interrupt_requested") {
      return null;
    }
  }

  return {
    type: "run.log",
    workflow: event.workflow === "compact" ? "sop-compact" : event.workflow,
    timestamp: event.timestamp,
    level: event.eventType === "workflow.lifecycle" ? "info" : "info",
    message: `${event.eventType} ${JSON.stringify(event.payload)}`,
  };
}

function summarizeRuntimeResult(result: RuntimeServiceResult): string {
  if (Array.isArray(result)) {
    return `listed ${result.length} item(s)`;
  }
  if ("mode" in result && result.mode === "observe") {
    return `${result.status}:${result.finishReason}`;
  }
  if ("sourceObserveRunId" in result) {
    return `${result.status}:${result.sourceObserveRunId}`;
  }
  if ("status" in result && "finishReason" in result) {
    return `${result.status}:${result.finishReason}`;
  }
  return "completed";
}
