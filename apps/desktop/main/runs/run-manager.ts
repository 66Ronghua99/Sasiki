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
  createRuntime: () => DesktopRuntimeService;
  events?: RunEventBus;
  now?: () => string;
  createRunId?: (workflow: DesktopWorkflow) => string;
}

export class RunManager {
  private readonly createRuntime: () => DesktopRuntimeService;
  private readonly events: RunEventBus;
  private readonly runs = new Map<string, DesktopRunSummary>();
  private readonly runtimes = new Map<string, DesktopRuntimeService>();
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
    const runId = this.createSummary("observe", input.siteAccountId, input.task, null);
    const runtime = this.createRuntime();
    this.runtimes.set(runId, runtime);
    const hooks = this.createHooks(runId);
    void runtime
      .runObserve(mapObserveInput(input), hooks)
      .then((result) => {
        this.updateRun(runId, {
          artifactPath: result.artifactsDir,
          updatedAt: this.now(),
        });
      })
      .catch(() => undefined)
      .finally(() => {
        this.runtimes.delete(runId);
      });
    return { runId };
  }

  async startCompact(input: CompactRunInput): Promise<{ runId: string }> {
    const runId = this.createSummary("sop-compact", undefined, null, input.sourceRunId);
    const runtime = this.createRuntime();
    this.runtimes.set(runId, runtime);
    const hooks = this.createHooks(runId);
    void runtime
      .runCompact(mapCompactInput(input), hooks)
      .then((result) => {
        this.updateRun(runId, {
          artifactPath: result.runDir,
          updatedAt: this.now(),
        });
      })
      .catch(() => undefined)
      .finally(() => {
        this.runtimes.delete(runId);
      });
    return { runId };
  }

  async startRefine(input: RefineRunInput): Promise<{ runId: string }> {
    const runId = this.createSummary(
      "refine",
      input.siteAccountId,
      input.task ?? null,
      input.resumeRunId ?? null,
    );
    const runtime = this.createRuntime();
    this.runtimes.set(runId, runtime);
    const hooks = this.createHooks(runId);
    void runtime
      .runRefine(mapRefineInput(input), hooks)
      .then((result) => {
        this.updateRun(runId, {
          artifactPath: result.artifactsDir ?? null,
          updatedAt: this.now(),
        });
      })
      .catch(() => undefined)
      .finally(() => {
        this.runtimes.delete(runId);
      });
    return { runId };
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

  private handleRuntimeEvent(runId: string, event: DesktopRuntimeServiceEvent): void {
    const workflow = this.requireRun(runId).workflow;
    const mapped = this.mapServiceEvent(runId, workflow, event);
    if (!mapped) {
      return;
    }

    if (mapped.type === "run.started") {
      this.updateRun(runId, { status: "running", updatedAt: mapped.timestamp });
    } else if (mapped.type === "run.finished") {
      this.updateRun(runId, {
        status: mapped.status,
        updatedAt: mapped.timestamp,
        artifactPath: this.requireRun(runId).artifactPath,
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
  "startObserve" | "startCompact" | "startRefine" | "interruptRun" | "listRuns" | "subscribe"
>) {
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
    async subscribe(request: { runId: string }) {
      runManager.subscribe(request.runId, () => undefined);
      return {
        subscribed: true,
        eventChannel: "runs:event" as const,
      };
    },
  };
}
