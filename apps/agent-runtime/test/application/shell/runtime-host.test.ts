import assert from "node:assert/strict";
import test from "node:test";

import { RuntimeHost } from "../../../src/application/shell/runtime-host.js";
import type { HostedWorkflow } from "../../../src/application/shell/workflow-contract.js";

test("runtime host prepares, executes, interrupts, and disposes the selected workflow", async () => {
  const events: string[] = [];
  const workflow: HostedWorkflow<{ status: string }> = {
    prepare: async () => {
      events.push("prepare");
    },
    execute: async () => {
      events.push("execute");
      return { status: "completed" };
    },
    requestInterrupt: async (signal) => {
      events.push(`interrupt:${signal}`);
      return true;
    },
    dispose: async () => {
      events.push("dispose");
    },
  };

  const host = new RuntimeHost({ workflow });

  await host.start();
  assert.deepEqual(events, ["prepare"]);

  const result = await host.execute();
  assert.deepEqual(result, { status: "completed" });
  assert.deepEqual(events, ["prepare", "execute"]);
  assert.equal(await host.requestInterrupt("SIGINT"), true);
  assert.deepEqual(events, ["prepare", "execute", "interrupt:SIGINT"]);

  await host.dispose();
  assert.deepEqual(events, ["prepare", "execute", "interrupt:SIGINT", "dispose"]);
});
