import type {
  CompactRunInput,
  DesktopRunEvent,
  DesktopRunSummary,
  DesktopRunStatus,
  DesktopWorkflow,
  ObserveRunInput,
  RefineRunInput,
} from "../../shared/runs";
import { mapCompactInput, mapObserveInput, mapRefineInput } from "./run-request-mapper";
import { RunEventBus } from "./run-event-bus";
import { RunEventForwarder, type RunEventSubscriber } from "./run-event-forwarder";
import type { DesktopRuntimeServiceFactory } from "./desktop-runtime-factory";

export interface ObserveRuntimeResult {
  runId: string;
  mode: "observe";
  taskHint: string;
  status: "completed" | "failed";
  finishReason: string;
  artifactsDir: string;
}

export interface CompactRuntimeResult {
  runId: string;
  sourceObserveRunId: string;
  sessionId: string;
  sessionDir: string;
  runDir: string;
  sourceTracePath: string;
  sessionStatePath: string;
  humanLoopPath: string;
  selectedSkillName: string | null;
  skillPath: string | null;
  capabilityOutputPath: string | null;
  status: string;
  roundsCompleted: number;
  remainingOpenDecisions: readonly string[];
}

export interface RefineRuntimeResult {
  runId?: string;
  artifactsDir?: string;
  task: string;
  status: string;
  finishReason: string;
  steps: readonly unknown[];
  mcpCalls: readonly unknown[];
  assistantTurns: readonly unknown[];
}

export type DesktopRuntimeServiceEvent =
  | {
      type: "run.started";
      workflow: DesktopWorkflow;
      timestamp: string;
      status: "running";
    }
  | {
      type: "run.log";
      workflow: DesktopWorkflow;
      timestamp: string;
      level: "info" | "warning" | "error";
      message: string;
    }
  | {
      type: "run.finished";
      workflow: DesktopWorkflow;
      timestamp: string;
      status: "completed" | "failed";
      resultSummary?: string;
    }
  | {
      type: "run.interrupted";
      workflow: DesktopWorkflow;
      timestamp: string;
      status: "interrupted";
      reason?: string;
    };

export interface DesktopRuntimeServiceHooks {
  onEvent?(event: DesktopRuntimeServiceEvent): void;
}

export interface DesktopRuntimeService {
  runObserve(request: { task: string }, hooks?: DesktopRuntimeServiceHooks): Promise<ObserveRuntimeResult>;
  runCompact(
    request: { runId: string; semanticMode?: "off" | "auto" | "on" },
    hooks?: DesktopRuntimeServiceHooks,
  ): Promise<CompactRuntimeResult>;
  runRefine(
    request: { task?: string; skillName?: string; resumeRunId?: string },
    hooks?: DesktopRuntimeServiceHooks,
  ): Promise<RefineRuntimeResult>;
  requestInterrupt(signal: "SIGINT" | "SIGTERM"): Promise<boolean>;
  stop(): Promise<void>;
}

export interface RunManagerOptions {
  createRuntime: DesktopRuntimeServiceFactory;
  events?: RunEventBus;
  now?: () => string;
  createRunId?: (workflow: DesktopWorkflow) => string;
}

export class RunManager {
  private readonly createRuntime: DesktopRuntimeServiceFactory;
  private readonly events: RunEventBus;
  private readonly runs = new Map<string, DesktopRunSummary>();
  private readonly runtimes = new Map<string, DesktopRuntimeService>();
  private readonly pendingStartupPromises = new Map<string, Promise<DesktopRuntimeService>>();
  private shutdownRequested = false;
  private readonly now: () => string;
  private readonly createRunId: (workflow: DesktopWorkflow) => string;

  constructor(options: RunManagerOptions) {
    this.createRuntime = options.createRuntime;
    this.events = options.events ?? new RunEventBus();
    this.now = options.now ?? (() => new Date().toISOString());
    this.createRunId =
      options.createRunId ??
      ((workflow) => {
        const suffix = Math.random().toString(36).slice(2, 10);
        return `desktop-${workflow}-${suffix}`;
      });
  }

  async startObserve(input: ObserveRunInput): Promise<{ runId: string }> {
    this.assertCanStart();
    const runId = this.createSummary("observe", input.siteAccountId, input.task, null);
    try {
      const runtime = await this.startRuntime(runId, {
        workflow: "observe",
        siteAccountId: input.siteAccountId,
        sourceRunId: null,
        taskSummary: input.task,
      });
      this.runtimes.set(runId, runtime);
      const hooks = this.createHooks(runId);
      void this.runObserve(runId, runtime, mapObserveInput(input), hooks);
      return { runId };
    } catch (error) {
      await this.failRun(runId, error);
      if (this.isShutdownError(error)) {
        throw error;
      }
      return { runId };
    }
  }

  async startCompact(input: CompactRunInput): Promise<{ runId: string }> {
    this.assertCanStart();
    const sourceRun = this.getRun(input.sourceRunId);
    const runId = this.createSummary(
      "sop-compact",
      sourceRun?.siteAccountId,
      sourceRun?.taskSummary ?? null,
      input.sourceRunId,
    );
    try {
      const runtime = await this.startRuntime(runId, {
        workflow: "sop-compact",
        siteAccountId: sourceRun?.siteAccountId,
        sourceRunId: input.sourceRunId,
        taskSummary: sourceRun?.taskSummary ?? null,
      });
      this.runtimes.set(runId, runtime);
      const hooks = this.createHooks(runId);
      void this.runCompact(runId, runtime, mapCompactInput(input), hooks);
      return { runId };
    } catch (error) {
      await this.failRun(runId, error);
      if (this.isShutdownError(error)) {
        throw error;
      }
      return { runId };
    }
  }

  async startRefine(input: RefineRunInput): Promise<{ runId: string }> {
    this.assertCanStart();
    const sourceRun = input.resumeRunId ? this.getRun(input.resumeRunId) : undefined;
    const siteAccountId = input.siteAccountId ?? sourceRun?.siteAccountId;
    const taskSummary = input.task ?? sourceRun?.taskSummary ?? null;
    const runId = this.createSummary(
      "refine",
      siteAccountId,
      taskSummary,
      input.resumeRunId ?? null,
    );
    try {
      const runtime = await this.startRuntime(runId, {
        workflow: "refine",
        siteAccountId,
        sourceRunId: input.resumeRunId ?? null,
        taskSummary,
      });
      this.runtimes.set(runId, runtime);
      const hooks = this.createHooks(runId);
      void this.runRefine(runId, runtime, mapRefineInput(input), hooks);
      return { runId };
    } catch (error) {
      await this.failRun(runId, error);
      if (this.isShutdownError(error)) {
        throw error;
      }
      return { runId };
    }
  }

  async interruptRun(runId: string): Promise<{ interrupted: boolean }> {
    const runtime = this.runtimes.get(runId);
    if (!runtime) {
      return { interrupted: false };
    }

    const interrupted = await runtime.requestInterrupt("SIGINT");
    if (!interrupted) {
      return { interrupted: false };
    }

    this.updateRun(runId, {
      status: "interrupted",
      updatedAt: this.now(),
    });
    this.events.publish(runId, {
      type: "run.interrupted",
      runId,
      workflow: this.requireRun(runId).workflow,
      timestamp: this.now(),
      status: "interrupted",
      reason: "SIGINT",
    });
    return { interrupted: true };
  }

  async stopAll(): Promise<void> {
    this.shutdownRequested = true;
    await Promise.allSettled(
      [...this.pendingStartupPromises.values()].map(async (startupPromise) => {
        await startupPromise.catch(() => undefined);
      }),
    );
    const activeRuntimes = [...this.runtimes.values()];
    this.runtimes.clear();
    await Promise.allSettled(activeRuntimes.map(async (runtime) => runtime.stop()));
  }

  listRuns(): DesktopRunSummary[] {
    return [...this.runs.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getRun(runId: string): DesktopRunSummary | undefined {
    return this.runs.get(runId);
  }

  subscribe(runId: string, listener: (event: DesktopRunEvent) => void): () => void {
    return this.events.subscribe(runId, listener);
  }

  get eventBus(): RunEventBus {
    return this.events;
  }

  private createSummary(
    workflow: DesktopWorkflow,
    siteAccountId: string | undefined,
    taskSummary: string | null,
    sourceRunId: string | null,
  ): string {
    const runId = this.createRunId(workflow);
    const timestamp = this.now();
    this.runs.set(runId, {
      runId,
      workflow,
      status: "starting",
      siteAccountId,
      taskSummary,
      sourceRunId,
      createdAt: timestamp,
      updatedAt: timestamp,
      artifactPath: null,
    });
    this.events.publish(runId, {
      type: "run.queued",
      runId,
      workflow,
      timestamp,
      status: "starting",
    });
    return runId;
  }

  private createHooks(runId: string): DesktopRuntimeServiceHooks {
    return {
      onEvent: (event: DesktopRuntimeServiceEvent) => {
        this.handleRuntimeEvent(runId, event);
      },
    };
  }

  private assertCanStart(): void {
    if (this.shutdownRequested) {
      throw new Error("Run manager is shutting down");
    }
  }

  private isShutdownError(error: unknown): boolean {
    return error instanceof Error && error.message === "Run manager is shutting down";
  }

  private async startRuntime(
    runId: string,
    context: Parameters<DesktopRuntimeServiceFactory>[0],
  ): Promise<DesktopRuntimeService> {
    const startupPromise = Promise.resolve().then(() => this.createRuntime(context));
    this.pendingStartupPromises.set(runId, startupPromise);

    try {
      const runtime = await startupPromise;
      if (this.shutdownRequested) {
        await runtime.stop().catch(() => undefined);
        throw new Error("Run manager is shutting down");
      }
      return runtime;
    } finally {
      this.pendingStartupPromises.delete(runId);
    }
  }

  private async runObserve(
    runId: string,
    runtime: DesktopRuntimeService,
    request: ReturnType<typeof mapObserveInput>,
    hooks: DesktopRuntimeServiceHooks,
  ): Promise<void> {
    try {
      const result = await runtime.runObserve(request, hooks);
      this.updateRun(runId, {
        artifactPath: result.artifactsDir,
        updatedAt: this.now(),
      });
    } catch (error) {
      await this.failRun(runId, error);
    } finally {
      this.runtimes.delete(runId);
    }
  }

  private async runCompact(
    runId: string,
    runtime: DesktopRuntimeService,
    request: ReturnType<typeof mapCompactInput>,
    hooks: DesktopRuntimeServiceHooks,
  ): Promise<void> {
    try {
      const result = await runtime.runCompact(request, hooks);
      this.updateRun(runId, {
        artifactPath: result.runDir,
        updatedAt: this.now(),
      });
    } catch (error) {
      await this.failRun(runId, error);
    } finally {
      this.runtimes.delete(runId);
    }
  }

  private async runRefine(
    runId: string,
    runtime: DesktopRuntimeService,
    request: ReturnType<typeof mapRefineInput>,
    hooks: DesktopRuntimeServiceHooks,
  ): Promise<void> {
    try {
      const result = await runtime.runRefine(request, hooks);
      this.updateRun(runId, {
        artifactPath: result.artifactsDir ?? null,
        updatedAt: this.now(),
      });
    } catch (error) {
      await this.failRun(runId, error);
    } finally {
      this.runtimes.delete(runId);
    }
  }

  private async failRun(runId: string, error: unknown): Promise<void> {
    const run = this.runs.get(runId);
    if (!run || run.status === "completed" || run.status === "failed" || run.status === "interrupted") {
      return;
    }

    const message = error instanceof Error && error.message ? error.message : "desktop runtime failed";
    this.updateRun(runId, {
      status: "failed",
      updatedAt: this.now(),
    });
    this.events.publish(runId, {
      type: "run.finished",
      runId,
      workflow: run.workflow,
      timestamp: this.now(),
      status: "failed",
      resultSummary: message,
    });
  }

  private handleRuntimeEvent(runId: string, event: DesktopRuntimeServiceEvent): void {
    const currentRun = this.requireRun(runId);
    const workflow = currentRun.workflow;
    const mapped = this.mapServiceEvent(runId, workflow, event);
    if (!mapped) {
      return;
    }

    if (mapped.type === "run.started") {
      this.updateRun(runId, { status: "running", updatedAt: mapped.timestamp });
    } else if (mapped.type === "run.finished") {
      this.updateRun(runId, {
        status: currentRun.status === "interrupted" ? "interrupted" : mapped.status,
        updatedAt: mapped.timestamp,
        artifactPath: currentRun.artifactPath,
      });
    } else if (mapped.type === "run.interrupted") {
      this.updateRun(runId, { status: "interrupted", updatedAt: mapped.timestamp });
    } else {
      this.updateRun(runId, { updatedAt: mapped.timestamp });
    }

    this.events.publish(runId, mapped);
  }

  private mapServiceEvent(
    runId: string,
    workflow: DesktopWorkflow,
    event: DesktopRuntimeServiceEvent,
  ): DesktopRunEvent | null {
    if (event.type === "run.started") {
      return {
        type: "run.started",
        runId,
        workflow,
        timestamp: event.timestamp,
        status: "running",
      };
    }
    if (event.type === "run.log") {
      return {
        type: "run.log",
        runId,
        workflow,
        timestamp: event.timestamp,
        level: event.level,
        message: event.message,
      };
    }
    if (event.type === "run.finished") {
      return {
        type: "run.finished",
        runId,
        workflow,
        timestamp: event.timestamp,
        status: event.status,
        resultSummary: event.resultSummary,
      };
    }
    if (event.type === "run.interrupted") {
      return {
        type: "run.interrupted",
        runId,
        workflow,
        timestamp: event.timestamp,
        status: "interrupted",
        reason: event.reason,
      };
    }
    return null;
  }

  private updateRun(runId: string, patch: Partial<DesktopRunSummary>): void {
    const current = this.requireRun(runId);
    this.runs.set(runId, {
      ...current,
      ...patch,
    });
  }

  private requireRun(runId: string): DesktopRunSummary {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`unknown desktop run: ${runId}`);
    }
    return run;
  }
}

export function createRunsIpcHandlers(runManager: Pick<
  RunManager,
  | "startObserve"
  | "startCompact"
  | "startRefine"
  | "interruptRun"
  | "listRuns"
  | "subscribe"
  | "eventBus"
  | "stopAll"
>, dependencies: {
  forwarder?: RunEventForwarder;
} = {}) {
  const forwarder = dependencies.forwarder ?? new RunEventForwarder(runManager);

  return {
    async startObserve(request: { input: ObserveRunInput }) {
      return runManager.startObserve(request.input);
    },
    async startCompact(request: { input: CompactRunInput }) {
      return runManager.startCompact(request.input);
    },
    async startRefine(request: { input: RefineRunInput }) {
      return runManager.startRefine(request.input);
    },
    async interruptRun(request: { runId: string }) {
      return runManager.interruptRun(request.runId);
    },
    async listRuns() {
      return { runs: runManager.listRuns() };
    },
    async subscribe(request: { runId: string }, context: { sender: RunEventSubscriber }) {
      forwarder.subscribe(request.runId, context.sender);
      return {
        subscribed: true,
        eventChannel: "runs:event" as const,
      };
    },
    async unsubscribe(request: { runId: string }, context: { sender: RunEventSubscriber }) {
      forwarder.unsubscribe(request.runId, context.sender.id);
      return {
        unsubscribed: true,
      };
    },
    async subscribeAll(_request: Record<string, never>, context: { sender: RunEventSubscriber }) {
      forwarder.subscribeAll(context.sender);
      return {
        subscribed: true,
        eventChannel: "runs:event" as const,
      };
    },
    async unsubscribeAll(_request: Record<string, never>, context: { sender: RunEventSubscriber }) {
      forwarder.unsubscribeAll(context.sender.id);
      return {
        unsubscribed: true,
      };
    },
  };
}
