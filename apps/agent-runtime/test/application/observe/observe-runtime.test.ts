import assert from "node:assert/strict";
import test from "node:test";

import { ObserveRuntime } from "../../../src/application/observe/observe-runtime.js";
import type { ObserveExecutor } from "../../../src/application/observe/observe-executor.js";
import type { ObserveRunResult } from "../../../src/domain/agent-types.js";

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

  const calls: Array<["execute" | "interrupt", string]> = [];
  const executor = {
    execute: async (taskHint: string) => {
      calls.push(["execute", taskHint]);
      return result;
    },
    requestInterrupt: async (signalName: "SIGINT" | "SIGTERM") => {
      calls.push(["interrupt", signalName]);
      return true;
    },
  } satisfies Pick<ObserveExecutor, "execute" | "requestInterrupt">;

  const runtime = new ObserveRuntime({ observeExecutor: executor as ObserveExecutor });

  assert.equal(await runtime.observe("record the homepage"), result);
  assert.equal(await runtime.requestInterrupt("SIGINT"), true);
  assert.deepEqual(calls, [
    ["execute", "record the homepage"],
    ["interrupt", "SIGINT"],
  ]);
});
