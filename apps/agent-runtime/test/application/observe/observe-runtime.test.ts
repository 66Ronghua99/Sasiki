import assert from "node:assert/strict";
import test from "node:test";

import { ObserveWorkflow } from "../../../src/application/observe/observe-workflow.js";
import { ObserveRuntime, createObserveRuntime } from "../../../src/application/observe/observe-runtime.js";
import type { ObserveExecutor } from "../../../src/application/observe/observe-executor.js";
import type { ObserveRunResult } from "../../../src/domain/agent-types.js";

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("application observe workflow prepares browser state before execute", async () => {
  const calls: string[] = [];
  const workflow = new ObserveWorkflow({
    browserLifecycle: {
      start: async () => {
        calls.push("start");
      },
      stop: async () => {
        calls.push("stop");
      },
      prepareObserveSession: async () => {
        calls.push("prepareObserveSession");
      },
    },
    observeExecutor: {
      execute: async (taskHint: string) => {
        calls.push(`execute:${taskHint}`);
        return {
          runId: "run-1",
          mode: "observe",
          taskHint,
          status: "completed",
          finishReason: "observe_timeout_reached",
          artifactsDir: "/tmp/sasiki-observe/run-1",
          tracePath: "/tmp/sasiki-observe/run-1/demonstration_trace.json",
          draftPath: "/tmp/sasiki-observe/run-1/sop_draft.md",
          assetPath: "/tmp/sasiki-observe/run-1/sop_asset.json",
        };
      },
      requestInterrupt: async () => false,
    } as ObserveExecutor,
    taskHint: "record the homepage",
  });

  await workflow.prepare();
  const result = await workflow.execute();
  await workflow.dispose();

  assert.equal(result.taskHint, "record the homepage");
  assert.deepEqual(calls, ["start", "prepareObserveSession", "execute:record the homepage", "stop"]);
});

test("application observe runtime directly drives the workflow lifecycle and forwards interrupts while active", async () => {
  const result: ObserveRunResult = {
    runId: "run-1",
    mode: "observe",
    taskHint: "record the homepage",
    status: "completed",
    finishReason: "observe_timeout_reached",
    artifactsDir: "/tmp/sasiki-observe/run-1",
    tracePath: "/tmp/sasiki-observe/run-1/demonstration_trace.json",
    draftPath: "/tmp/sasiki-observe/run-1/sop_draft.md",
    assetPath: "/tmp/sasiki-observe/run-1/sop_asset.json",
  };

  const calls: string[] = [];
  const ready = createDeferred<void>();
  const release = createDeferred<void>();
  const runtime = new ObserveRuntime({
    createWorkflow: (taskHint: string) => {
      calls.push(`factory:${taskHint}`);
      return new ObserveWorkflow({
        browserLifecycle: {
          start: async () => {
            calls.push("start");
          },
          stop: async () => {
            calls.push("stop");
          },
          prepareObserveSession: async () => {
            calls.push("prepareObserveSession");
            ready.resolve();
            await release.promise;
          },
        },
        observeExecutor: {
          execute: async (value: string) => {
            calls.push(`execute:${value}`);
            return result;
          },
          requestInterrupt: async (signalName: "SIGINT" | "SIGTERM") => {
            calls.push(`interrupt:${signalName}`);
            return true;
          },
        } as Pick<ObserveExecutor, "execute" | "requestInterrupt">,
        taskHint,
      });
    },
  });

  const observePromise = runtime.observe("record the homepage");
  await ready.promise;
  assert.equal(await runtime.requestInterrupt("SIGINT"), true);
  release.resolve();
  assert.equal(await observePromise, result);
  assert.equal(await runtime.requestInterrupt("SIGTERM"), false);
  assert.deepEqual(calls, [
    "factory:record the homepage",
    "start",
    "prepareObserveSession",
    "interrupt:SIGINT",
    "execute:record the homepage",
    "stop",
  ]);
});

test("application observe runtime factory stays lazy until observe is called", async () => {
  const calls: string[] = [];
  const runtime = createObserveRuntime({
    createWorkflow: (taskHint: string) => {
      calls.push(`factory:${taskHint}`);
      return new ObserveWorkflow({
        browserLifecycle: {
          start: async () => {
            calls.push("start");
          },
          stop: async () => {
            calls.push("stop");
          },
          prepareObserveSession: async () => {
            calls.push("prepareObserveSession");
          },
        },
        observeExecutor: {
          execute: async (value: string) => {
            calls.push(`execute:${value}`);
            return {
              runId: "run-1",
              mode: "observe",
              taskHint: value,
              status: "completed",
              finishReason: "observe_timeout_reached",
              artifactsDir: "/tmp/sasiki-observe/run-1",
              tracePath: "/tmp/sasiki-observe/run-1/demonstration_trace.json",
              draftPath: "/tmp/sasiki-observe/run-1/sop_draft.md",
              assetPath: "/tmp/sasiki-observe/run-1/sop_asset.json",
            };
          },
          requestInterrupt: async () => false,
        } as Pick<ObserveExecutor, "execute" | "requestInterrupt">,
        taskHint,
      });
    },
  });

  assert.deepEqual(calls, []);
  const result = await runtime.observe("record the homepage");
  assert.equal(result.taskHint, "record the homepage");
  assert.deepEqual(calls, ["factory:record the homepage", "start", "prepareObserveSession", "execute:record the homepage", "stop"]);
});
