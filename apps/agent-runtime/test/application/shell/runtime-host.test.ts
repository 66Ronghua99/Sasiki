import assert from "node:assert/strict";
import test from "node:test";

import { RuntimeHost } from "../../../src/application/shell/runtime-host.js";
import type { HostedWorkflow } from "../../../src/application/shell/workflow-contract.js";

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("runtime host owns workflow lifecycle through one run call", async () => {
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

  const host = new RuntimeHost();
  const result = await host.run(workflow);
  assert.deepEqual(result, { status: "completed" });
  assert.deepEqual(events, ["prepare", "execute", "dispose"]);
  assert.equal(await host.requestInterrupt("SIGINT"), false);
});

test("runtime host keeps the active workflow interruptible while preparation is in flight", async () => {
  const events: string[] = [];
  const prepareGate = createDeferred<void>();
  const workflow: HostedWorkflow<{ status: string }> = {
    prepare: async () => {
      events.push("prepare");
      await prepareGate.promise;
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

  const host = new RuntimeHost();
  const execution = host.run(workflow);

  await Promise.resolve();
  assert.equal(await host.requestInterrupt("SIGINT"), true);
  prepareGate.resolve();

  const result = await execution;
  assert.deepEqual(result, { status: "completed" });
  assert.deepEqual(events, ["prepare", "interrupt:SIGINT", "execute", "dispose"]);
});

test("runtime host keeps the active workflow interruptible until disposal finishes", async () => {
  const events: string[] = [];
  const disposeGate = createDeferred<void>();
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
      events.push("dispose:start");
      await disposeGate.promise;
      events.push("dispose:end");
    },
  };

  const host = new RuntimeHost();
  const execution = host.run(workflow);

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(await host.requestInterrupt("SIGTERM"), true);
  disposeGate.resolve();

  const result = await execution;
  assert.deepEqual(result, { status: "completed" });
  assert.equal(events[0], "prepare");
  assert.equal(events[1], "execute");
  assert.ok(events.includes("interrupt:SIGTERM"));
  assert.ok(events.includes("dispose:start"));
  assert.equal(events.at(-1), "dispose:end");
});
