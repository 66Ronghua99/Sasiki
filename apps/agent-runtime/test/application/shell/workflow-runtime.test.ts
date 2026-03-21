import assert from "node:assert/strict";
import test from "node:test";

import { WorkflowRuntime } from "../../../src/application/shell/workflow-runtime.js";
import type { RuntimeConfig } from "../../../src/application/config/runtime-config.js";
import type { HostedWorkflow } from "../../../src/application/shell/workflow-contract.js";

function buildRuntimeConfig(): RuntimeConfig {
  return {} as RuntimeConfig;
}

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("workflow runtime dispatches observe through the shared registry and host path", async () => {
  const events: string[] = [];
  let registryFactoryKeys: string[] = [];

  const runtime = new WorkflowRuntime(buildRuntimeConfig(), {
    createRuntimeComposition: () =>
      ({
        browserLifecycle: {
          start: async () => {
            events.push("browser.start");
          },
          stop: async () => {
            events.push("browser.stop");
          },
          prepareObserveSession: async () => {
            events.push("browser.prepareObserveSession");
          },
        },
        agentRuntime: {
          start: async () => {
            events.push("agent.start");
          },
          run: async () => {
            events.push("agent.run");
            return {
              task: "observe me",
              status: "completed",
              finishReason: "goal achieved",
              steps: [],
              mcpCalls: [],
              assistantTurns: [],
            };
          },
          requestInterrupt: async () => false,
          stop: async () => {
            events.push("agent.stop");
          },
        },
        observeRuntime: {
          observe: async (taskHint: string) => {
            events.push(`observeRuntime.observe:${taskHint}`);
            return {
              runId: "observe-run",
              mode: "observe",
              taskHint,
              status: "completed",
              finishReason: "observe_timeout_reached",
              artifactsDir: "/tmp/observe",
            };
          },
          requestInterrupt: async () => false,
        },
      }) as never,
    createWorkflowRegistry: (factories) => {
      registryFactoryKeys = Object.keys(factories).sort();
      return {
        resolve(command: "observe" | "refine") {
          return factories[command];
        },
      };
    },
    createRuntimeHost: <T>(workflow: HostedWorkflow<T>) => {
      return {
        start: async () => {
          events.push("host.start");
          await workflow.prepare();
        },
        execute: async () => {
          events.push("host.execute");
          return workflow.execute();
        },
        requestInterrupt: async (signal: "SIGINT" | "SIGTERM") => workflow.requestInterrupt(signal),
        dispose: async () => {
          events.push("host.dispose");
          await workflow.dispose();
        },
      };
    },
  });

  const result = await runtime.execute({
    command: "observe",
    task: "observe me",
  });

  assert.deepEqual(registryFactoryKeys, ["observe", "refine"]);
  assert.equal(result.mode, "observe");
  assert.equal(result.taskHint, "observe me");
  assert.deepEqual(events, [
    "host.start",
    "browser.start",
    "browser.prepareObserveSession",
    "host.execute",
    "observeRuntime.observe:observe me",
    "host.dispose",
    "agent.stop",
    "browser.stop",
  ]);
});

test("workflow runtime dispatches refine through the shared registry and host path", async () => {
  const events: string[] = [];
  let registryFactoryKeys: string[] = [];

  const runtime = new WorkflowRuntime(buildRuntimeConfig(), {
    createRuntimeComposition: () =>
      ({
        browserLifecycle: {
          start: async () => {
            events.push("browser.start");
          },
          stop: async () => {
            events.push("browser.stop");
          },
          prepareObserveSession: async () => {
            events.push("browser.prepareObserveSession");
          },
        },
        agentRuntime: {
          start: async () => {
            events.push("agent.start");
          },
          run: async (request) => {
            events.push(`agent.run:${request.task}`);
            return {
              task: request.task,
              status: "completed",
              finishReason: "goal achieved",
              steps: [],
              mcpCalls: [],
              assistantTurns: [],
            };
          },
          requestInterrupt: async () => false,
          stop: async () => {
            events.push("agent.stop");
          },
        },
        observeRuntime: {
          observe: async (taskHint: string) => {
            events.push(`observeRuntime.observe:${taskHint}`);
            return {
              runId: "observe-run",
              mode: "observe",
              taskHint,
              status: "completed",
              finishReason: "observe_timeout_reached",
              artifactsDir: "/tmp/observe",
            };
          },
          requestInterrupt: async () => false,
        },
      }) as never,
    createWorkflowRegistry: (factories) => {
      registryFactoryKeys = Object.keys(factories).sort();
      return {
        resolve(command: "observe" | "refine") {
          return factories[command];
        },
      };
    },
    createRuntimeHost: <T>(workflow: HostedWorkflow<T>) => {
      return {
        start: async () => {
          events.push("host.start");
          await workflow.prepare();
        },
        execute: async () => {
          events.push("host.execute");
          return workflow.execute();
        },
        requestInterrupt: async (signal: "SIGINT" | "SIGTERM") => workflow.requestInterrupt(signal),
        dispose: async () => {
          events.push("host.dispose");
          await workflow.dispose();
        },
      };
    },
  });

  const result = await runtime.execute({
    command: "refine",
    task: "refine me",
  });

  assert.deepEqual(registryFactoryKeys, ["observe", "refine"]);
  assert.equal(result.task, "refine me");
  assert.deepEqual(events, [
    "host.start",
    "browser.start",
    "agent.start",
    "host.execute",
    "agent.run:refine me",
    "host.dispose",
    "agent.stop",
    "browser.stop",
  ]);
});

test("workflow runtime falls through to underlying interrupt handlers while observe is still preparing", async () => {
  const events: string[] = [];
  const prepareGate = createDeferred<void>();
  let interruptCalls = 0;

  const runtime = new WorkflowRuntime(buildRuntimeConfig(), {
    createRuntimeComposition: () =>
      ({
        browserLifecycle: {
          start: async () => {
            events.push("browser.start");
          },
          stop: async () => {
            events.push("browser.stop");
          },
          prepareObserveSession: async () => {
            events.push("browser.prepareObserveSession");
          },
        },
        agentRuntime: {
          start: async () => {
            events.push("agent.start");
          },
          run: async () => {
            events.push("agent.run");
            return {
              task: "observe me",
              status: "completed",
              finishReason: "goal achieved",
              steps: [],
              mcpCalls: [],
              assistantTurns: [],
            };
          },
          requestInterrupt: async () => false,
          stop: async () => {
            events.push("agent.stop");
          },
        },
        observeRuntime: {
          observe: async (taskHint: string) => {
            events.push(`observeRuntime.observe:${taskHint}`);
            return {
              runId: "observe-run",
              mode: "observe",
              taskHint,
              status: "completed",
              finishReason: "observe_timeout_reached",
              artifactsDir: "/tmp/observe",
            };
          },
          requestInterrupt: async (signal) => {
            interruptCalls += 1;
            events.push(`observeRuntime.requestInterrupt:${signal}`);
            return true;
          },
        },
      }) as never,
    createRuntimeHost: <T>(workflow: HostedWorkflow<T>) => {
      return {
        start: async () => {
          events.push("host.start");
          await workflow.prepare();
          await prepareGate.promise;
        },
        execute: async () => {
          events.push("host.execute");
          return workflow.execute();
        },
        requestInterrupt: async () => false,
        dispose: async () => {
          events.push("host.dispose");
          await workflow.dispose();
        },
      };
    },
  });

  const execution = runtime.execute({
    command: "observe",
    task: "observe me",
  });

  await Promise.resolve();
  await runtime.requestInterrupt("SIGINT");
  prepareGate.resolve();

  await execution;

  assert.equal(interruptCalls, 1);
  assert.ok(events.includes("observeRuntime.requestInterrupt:SIGINT"));
});

test("workflow runtime falls through to underlying interrupt handlers while observe is still disposing", async () => {
  const events: string[] = [];
  const disposeGate = createDeferred<void>();
  let interruptCalls = 0;

  const runtime = new WorkflowRuntime(buildRuntimeConfig(), {
    createRuntimeComposition: () =>
      ({
        browserLifecycle: {
          start: async () => {
            events.push("browser.start");
          },
          stop: async () => {
            events.push("browser.stop");
          },
          prepareObserveSession: async () => {
            events.push("browser.prepareObserveSession");
          },
        },
        agentRuntime: {
          start: async () => {
            events.push("agent.start");
          },
          run: async () => {
            events.push("agent.run");
            return {
              task: "observe me",
              status: "completed",
              finishReason: "goal achieved",
              steps: [],
              mcpCalls: [],
              assistantTurns: [],
            };
          },
          requestInterrupt: async () => false,
          stop: async () => {
            events.push("agent.stop");
          },
        },
        observeRuntime: {
          observe: async (taskHint: string) => {
            events.push(`observeRuntime.observe:${taskHint}`);
            return {
              runId: "observe-run",
              mode: "observe",
              taskHint,
              status: "completed",
              finishReason: "observe_timeout_reached",
              artifactsDir: "/tmp/observe",
            };
          },
          requestInterrupt: async (signal) => {
            interruptCalls += 1;
            events.push(`observeRuntime.requestInterrupt:${signal}`);
            return true;
          },
        },
      }) as never,
    createRuntimeHost: <T>(workflow: HostedWorkflow<T>) => {
      return {
        start: async () => {
          events.push("host.start");
          await workflow.prepare();
        },
        execute: async () => {
          events.push("host.execute");
          return workflow.execute();
        },
        requestInterrupt: async () => false,
        dispose: async () => {
          events.push("host.dispose");
          await workflow.dispose();
          await disposeGate.promise;
        },
      };
    },
  });

  const execution = runtime.execute({
    command: "observe",
    task: "observe me",
  });

  await Promise.resolve();
  await Promise.resolve();
  await runtime.requestInterrupt("SIGINT");
  disposeGate.resolve();

  await execution;

  assert.equal(interruptCalls, 1);
  assert.ok(events.includes("observeRuntime.requestInterrupt:SIGINT"));
});
