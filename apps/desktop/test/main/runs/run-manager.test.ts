import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { RunEventBus } from "../../../main/runs/run-event-bus";
import { RunManager } from "../../../main/runs/run-manager";
import type {
  DesktopRuntimeService,
  DesktopRuntimeServiceHooks,
} from "../../../main/runs/run-manager";

function createRuntimeStub(): DesktopRuntimeService {
  return {
    async runObserve(request, hooks = {}) {
      hooks.onEvent?.({
        type: "run.started",
        workflow: "observe",
        status: "running",
        timestamp: new Date().toISOString(),
      });
      hooks.onEvent?.({
        type: "run.log",
        workflow: "observe",
        level: "info",
        message: `observe:${request.task}`,
        timestamp: new Date().toISOString(),
      });
      const result = {
        mode: "observe",
        runId: "observe-run",
        taskHint: request.task,
        status: "completed",
        finishReason: "observe_timeout_reached",
        artifactsDir: "/tmp/observe-run",
      } as const;
      hooks.onEvent?.({
        type: "run.finished",
        workflow: "observe",
        status: "completed",
        timestamp: new Date().toISOString(),
        resultSummary: `${result.status}:${result.finishReason}`,
      });
      return result;
    },
    async runCompact(request, hooks = {}) {
      hooks.onEvent?.({
        type: "run.started",
        workflow: "sop-compact",
        status: "running",
        timestamp: new Date().toISOString(),
      });
      hooks.onEvent?.({
        type: "run.log",
        workflow: "sop-compact",
        level: "info",
        message: `compact:${request.runId}`,
        timestamp: new Date().toISOString(),
      });
      const result = {
        runId: request.runId,
        sourceObserveRunId: request.runId,
        sessionId: `${request.runId}_session`,
        sessionDir: `/tmp/${request.runId}/session`,
        runDir: `/tmp/${request.runId}`,
        sourceTracePath: `/tmp/${request.runId}/trace.json`,
        sessionStatePath: `/tmp/${request.runId}/state.json`,
        humanLoopPath: `/tmp/${request.runId}/human.jsonl`,
        selectedSkillName: null,
        skillPath: null,
        capabilityOutputPath: null,
        status: "ready_to_finalize",
        roundsCompleted: 1,
        remainingOpenDecisions: [],
      } as const;
      hooks.onEvent?.({
        type: "run.finished",
        workflow: "sop-compact",
        status: "completed",
        timestamp: new Date().toISOString(),
        resultSummary: `${result.status}:${result.sourceObserveRunId}`,
      });
      return result;
    },
    async runRefine(request, hooks = {}) {
      hooks.onEvent?.({
        type: "run.started",
        workflow: "refine",
        status: "running",
        timestamp: new Date().toISOString(),
      });
      hooks.onEvent?.({
        type: "run.log",
        workflow: "refine",
        level: "info",
        message: `refine:${request.task ?? request.resumeRunId ?? ""}`,
        timestamp: new Date().toISOString(),
      });
      const result = {
        task: request.task ?? "",
        status: "completed",
        finishReason: "goal achieved",
        steps: [],
        mcpCalls: [],
        assistantTurns: [],
      } as const;
      hooks.onEvent?.({
        type: "run.finished",
        workflow: "refine",
        status: "completed",
        timestamp: new Date().toISOString(),
        resultSummary: `${result.status}:${result.finishReason}`,
      });
      return result;
    },
    async requestInterrupt() {
      return true;
    },
    async stop() {
      // no-op
    },
  };
}

describe("RunManager", () => {
  test("passes run context into the runtime factory", async () => {
    let receivedContext: {
      workflow: string;
      siteAccountId?: string;
      sourceRunId?: string | null;
      taskSummary?: string | null;
    } | undefined;
    const events = new RunEventBus();
    const runManager = new RunManager({
      createRuntime: ((context: typeof receivedContext) => {
        receivedContext = context;
        return createRuntimeStub();
      }) as never,
      events,
      createRunId: () => "desktop-refine-1",
    });

    await runManager.startRefine({
      task: "check inbox",
      siteAccountId: "acct-1",
      skillName: "smoke-skill",
    });

    assert.deepEqual(receivedContext, {
      workflow: "refine",
      siteAccountId: "acct-1",
      sourceRunId: null,
      taskSummary: "check inbox",
    });
  });

  test("run manager starts refine, stores status, and relays streamed events", async () => {
    const events = new RunEventBus();
    const runManager = new RunManager({ createRuntime: createRuntimeStub, events });

    const handle = await runManager.startRefine({
      task: "check inbox",
      siteAccountId: "acct-1",
    });

    assert.equal(handle.runId.startsWith("desktop-refine-"), true);
    assert.equal(runManager.getRun(handle.runId)?.workflow, "refine");
    assert.equal(runManager.getRun(handle.runId)?.status, "completed");

    const streamedEvents = events.list(handle.runId);
    assert.equal(streamedEvents[0]?.type, "run.queued");
    assert.equal(streamedEvents[1]?.type, "run.started");
    assert.equal(streamedEvents[2]?.type, "run.log");
    assert.equal(streamedEvents.at(-1)?.type, "run.finished");
  });

  test("run manager marks interrupted runs when the runtime accepts interrupt requests", async () => {
    const events = new RunEventBus();
    const runtimeGate = createDeferred<void>();
    const runManager = new RunManager({
      createRuntime: (() => ({
        async runObserve(request: { task: string }, hooks: DesktopRuntimeServiceHooks = {}) {
          hooks.onEvent?.({
            type: "run.started",
            workflow: "observe",
            status: "running",
            timestamp: new Date().toISOString(),
          });
          hooks.onEvent?.({
            type: "run.log",
            workflow: "observe",
            level: "info",
            message: `observe:${request.task}`,
            timestamp: new Date().toISOString(),
          });
          await runtimeGate.promise;
          return {
            mode: "observe",
            runId: "observe-run",
            taskHint: request.task,
            status: "completed",
            finishReason: "observe_timeout_reached",
            artifactsDir: "/tmp/observe-run",
          } as const;
        },
        async runCompact() {
          throw new Error("not implemented");
        },
        async runRefine() {
          throw new Error("not implemented");
        },
        async requestInterrupt() {
          runtimeGate.resolve();
          return true;
        },
        async stop() {
          // no-op
        },
      })) as never,
      events,
    });

    const handle = await runManager.startObserve({
      task: "record a baidu search",
      siteAccountId: "acct-1",
    });

    const interruptResult = await runManager.interruptRun(handle.runId);

    assert.equal(interruptResult.interrupted, true);
    assert.equal(runManager.getRun(handle.runId)?.status, "interrupted");
    assert.equal(events.list(handle.runId).at(-1)?.type, "run.interrupted");
  });

  test("run manager marks a run as failed when runtime startup rejects", async () => {
    const events = new RunEventBus();
    const runManager = new RunManager({
      createRuntime: async () => ({
        async runObserve() {
          throw new Error("runtime startup failed");
        },
        async runCompact() {
          throw new Error("not implemented");
        },
        async runRefine() {
          throw new Error("not implemented");
        },
        async requestInterrupt() {
          return true;
        },
        async stop() {
          // no-op
        },
      }),
      events,
      createRunId: () => "desktop-observe-1",
    });

    const handle = await runManager.startObserve({
      task: "record a baidu search",
      siteAccountId: "acct-1",
    });

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(handle.runId, "desktop-observe-1");
    assert.equal(runManager.getRun(handle.runId)?.status, "failed");
    const lastEvent = events.list(handle.runId).at(-1);
    assert.equal(lastEvent?.type, "run.finished");
    assert.equal(lastEvent && "status" in lastEvent ? lastEvent.status : undefined, "failed");
  });

  test("run manager marks a run as failed when runtime creation rejects", async () => {
    const events = new RunEventBus();
    const runManager = new RunManager({
      createRuntime: async () => {
        throw new Error("runtime creation failed");
      },
      events,
      createRunId: () => "desktop-observe-1",
    });

    await assert.rejects(
      runManager.startObserve({
        task: "record a baidu search",
        siteAccountId: "acct-1",
      }),
      /runtime creation failed/,
    );

    assert.equal(runManager.getRun("desktop-observe-1")?.status, "failed");
    const lastEvent = events.list("desktop-observe-1").at(-1);
    assert.equal(lastEvent?.type, "run.finished");
    assert.equal(lastEvent && "status" in lastEvent ? lastEvent.status : undefined, "failed");
  });

  test("run manager stops every active runtime and clears tracked handles", async () => {
    let stopCalls = 0;
    const events = new RunEventBus();
    const runManager = new RunManager({
      createRuntime: (() => ({
        async runObserve(
          request: { task: string },
          hooks: DesktopRuntimeServiceHooks = {},
        ) {
          hooks.onEvent?.({
            type: "run.started",
            workflow: "observe",
            status: "running",
            timestamp: new Date().toISOString(),
          });
          return new Promise<{
            mode: "observe";
            runId: string;
            taskHint: string;
            status: "completed";
            finishReason: string;
            artifactsDir: string;
          }>(() => undefined);
        },
        async runCompact() {
          throw new Error("not implemented");
        },
        async runRefine() {
          throw new Error("not implemented");
        },
        async requestInterrupt() {
          return true;
        },
        async stop() {
          stopCalls += 1;
        },
      })) as never,
      events,
      createRunId: () => "desktop-observe-1",
    });

    const handle = await runManager.startObserve({
      task: "record a baidu search",
      siteAccountId: "acct-1",
    });

    await runManager.stopAll();

    assert.equal(stopCalls, 1);
    assert.equal((await runManager.interruptRun(handle.runId)).interrupted, false);
  });

  test("run manager does not launch a pending runtime after stopAll begins", async () => {
    const events = new RunEventBus();
    const runtimeDeferred = createDeferred<DesktopRuntimeService>();
    let runObserveCalls = 0;
    let stopCalls = 0;
    const runManager = new RunManager({
      createRuntime: async () => runtimeDeferred.promise,
      events,
      createRunId: () => "desktop-observe-1",
    });

    const startPromise = runManager.startObserve({
      task: "record a baidu search",
      siteAccountId: "acct-1",
    });

    const stopAllPromise = runManager.stopAll();
    let stopAllSettled = false;
    stopAllPromise.finally(() => {
      stopAllSettled = true;
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stopAllSettled, false);

    runtimeDeferred.resolve({
      async runObserve() {
        runObserveCalls += 1;
        return {
          mode: "observe",
          runId: "observe-run",
          taskHint: "record a baidu search",
          status: "completed",
          finishReason: "observe_timeout_reached",
          artifactsDir: "/tmp/observe-run",
        };
      },
      async runCompact() {
        throw new Error("not implemented");
      },
      async runRefine() {
        throw new Error("not implemented");
      },
      async requestInterrupt() {
        return true;
      },
      async stop() {
        stopCalls += 1;
      },
    });

    await assert.rejects(startPromise, /shutting down/i);
    await stopAllPromise;
    assert.equal(runObserveCalls, 0);
    assert.equal(stopCalls, 1);
    assert.equal(runManager.getRun("desktop-observe-1")?.status, "failed");
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}
