import assert from "node:assert/strict";
import test from "node:test";

import { ObserveWorkflow } from "../../../src/application/observe/observe-workflow.js";
import type { ObserveExecutor } from "../../../src/application/observe/observe-executor.js";

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
