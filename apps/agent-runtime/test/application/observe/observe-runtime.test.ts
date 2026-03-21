import assert from "node:assert/strict";
import test from "node:test";

import { ObserveWorkflow } from "../../../src/application/observe/observe-workflow.js";
import { ObserveRuntime } from "../../../src/application/observe/observe-runtime.js";
import type { ObserveExecutor } from "../../../src/application/observe/observe-executor.js";
import type { ObserveRunResult } from "../../../src/domain/agent-types.js";

test("application observe workflow prepares browser state before execute", async () => {
  const calls: string[] = [];
  const workflow = new ObserveWorkflow({
    browserLifecycle: {
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

  assert.equal(result.taskHint, "record the homepage");
  assert.deepEqual(calls, ["prepareObserveSession", "execute:record the homepage"]);
});

test("application observe runtime delegates to its executor", async () => {
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
  const runtime = new ObserveRuntime({
    createWorkflow: (taskHint: string) => {
      calls.push(`factory:${taskHint}`);
      return new ObserveWorkflow({
        browserLifecycle: {
          prepareObserveSession: async () => {
            calls.push("prepareObserveSession");
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

  assert.equal(await runtime.observe("record the homepage"), result);
  assert.equal(await runtime.requestInterrupt("SIGINT"), false);
  assert.deepEqual(calls, ["factory:record the homepage", "execute:record the homepage"]);
});
