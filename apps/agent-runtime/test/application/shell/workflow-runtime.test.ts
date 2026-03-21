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

function createObserveWorkflowFactory(
  events: string[],
  options: {
    taskHintSuffix?: string;
    prepareGate?: ReturnType<typeof createDeferred<void>>;
    disposeGate?: ReturnType<typeof createDeferred<void>>;
  } = {}
): (taskHint: string) => HostedWorkflow<{ mode: "observe"; taskHint: string; runId: string; status: string; finishReason: string; artifactsDir: string }> {
  return (taskHint: string) => ({
    prepare: async () => {
      events.push("browser.start");
      events.push("browser.prepareObserveSession");
      if (options.prepareGate) {
        await options.prepareGate.promise;
      }
    },
    execute: async () => {
      events.push(`observe.execute:${taskHint}`);
      return {
        runId: "observe-run",
        mode: "observe",
        taskHint,
        status: "completed",
        finishReason: "observe_timeout_reached",
        artifactsDir: "/tmp/observe",
      };
    },
    requestInterrupt: async (signal: "SIGINT" | "SIGTERM") => {
      events.push(`observe.requestInterrupt:${signal}`);
      return true;
    },
    dispose: async () => {
      events.push("browser.stop");
      if (options.disposeGate) {
        await options.disposeGate.promise;
      }
    },
  });
}

function createRefineWorkflowFactory(
  events: string[]
): (request: { task: string; resumeRunId?: string }) => HostedWorkflow<{ task: string; status: string; finishReason: string; steps: []; mcpCalls: []; assistantTurns: [] }> {
  return (request) => ({
    prepare: async () => {
      events.push("browser.start");
      events.push("agent.start");
    },
    execute: async () => {
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
    requestInterrupt: async (signal: "SIGINT" | "SIGTERM") => {
      events.push(`refine.requestInterrupt:${signal}`);
      return true;
    },
    dispose: async () => {
      events.push("agent.stop");
      events.push("browser.stop");
    },
  });
}

function createCompactWorkflowFactory(
  events: string[]
): (request: { runId: string; semanticMode?: "off" | "auto" | "on" }) => HostedWorkflow<{
  runId: string;
  sessionId: string;
  sessionDir: string;
  runDir: string;
  sourceTracePath: string;
  sessionStatePath: string;
  humanLoopPath: string;
  capabilityOutputPath: string;
  status: "ready_to_finalize";
  roundsCompleted: number;
  remainingOpenDecisions: string[];
}> {
  return (request) => ({
    prepare: async () => {
      events.push(`compact.prepare:${request.runId}`);
    },
    execute: async () => {
      events.push(`compact.execute:${request.runId}`);
      return {
        runId: request.runId,
        sessionId: `${request.runId}_compact_session`,
        sessionDir: `/tmp/${request.runId}/compact_sessions/${request.runId}_compact_session`,
        runDir: `/tmp/${request.runId}`,
        sourceTracePath: `/tmp/${request.runId}/demonstration_trace.json`,
        sessionStatePath: `/tmp/${request.runId}/compact_sessions/${request.runId}_compact_session/compact_session_state.json`,
        humanLoopPath: `/tmp/${request.runId}/compact_sessions/${request.runId}_compact_session/compact_human_loop.jsonl`,
        capabilityOutputPath: `/tmp/${request.runId}/compact_sessions/${request.runId}_compact_session/compact_capability_output.json`,
        status: "ready_to_finalize",
        roundsCompleted: 2,
        remainingOpenDecisions: ["confirm reuse boundary"],
      };
    },
    requestInterrupt: async (signal: "SIGINT" | "SIGTERM") => {
      events.push(`compact.requestInterrupt:${signal}`);
      return false;
    },
    dispose: async () => {
      events.push(`compact.dispose:${request.runId}`);
    },
  });
}

function createAgentRuntime(events: string[]) {
  return {
    start: async () => {
      events.push("agentRuntime.start");
    },
    run: async () => {
      events.push("agentRuntime.run");
      return {
        task: "unused",
        status: "completed",
        finishReason: "unused",
        steps: [],
        mcpCalls: [],
        assistantTurns: [],
      };
    },
    requestInterrupt: async (signal: "SIGINT" | "SIGTERM") => {
      events.push(`agentRuntime.requestInterrupt:${signal}`);
      return false;
    },
    stop: async () => {
      events.push("agentRuntime.stop");
    },
  };
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
        agentRuntime: createAgentRuntime(events),
        observeRuntime: {
          observe: async () => {
            throw new Error("observe should use the shared shell host path");
          },
          requestInterrupt: async () => false,
        },
        observeWorkflowFactory: createObserveWorkflowFactory(events),
        refineWorkflowFactory: createRefineWorkflowFactory(events),
      }) as never,
    createWorkflowRegistry: (factories) => {
      registryFactoryKeys = Object.keys(factories).sort();
      return {
        resolve(command: "observe" | "refine" | "sop-compact") {
          if (command === "sop-compact") {
            return () =>
              createCompactWorkflowFactory(events)({
                runId: "compact-run",
                semanticMode: "on",
              });
          }
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

  assert.deepEqual(registryFactoryKeys, ["observe", "refine", "sop-compact"]);
  assert.equal(result.mode, "observe");
  assert.equal(result.taskHint, "observe me");
  assert.deepEqual(events, [
    "host.start",
    "browser.start",
    "browser.prepareObserveSession",
    "host.execute",
    "observe.execute:observe me",
    "host.dispose",
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
        agentRuntime: createAgentRuntime(events),
        observeRuntime: {
          observe: async () => {
            throw new Error("observe should use the shared shell host path");
          },
          requestInterrupt: async () => false,
        },
        observeWorkflowFactory: createObserveWorkflowFactory(events),
        refineWorkflowFactory: createRefineWorkflowFactory(events),
      }) as never,
    createWorkflowRegistry: (factories) => {
      registryFactoryKeys = Object.keys(factories).sort();
      return {
        resolve(command: "observe" | "refine" | "sop-compact") {
          if (command === "sop-compact") {
            return () =>
              createCompactWorkflowFactory(events)({
                runId: "compact-run",
                semanticMode: "on",
              });
          }
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

  assert.deepEqual(registryFactoryKeys, ["observe", "refine", "sop-compact"]);
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

test("workflow runtime dispatches sop-compact through the shared registry and host path", async () => {
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
        agentRuntime: createAgentRuntime(events),
        observeRuntime: {
          observe: async () => {
            throw new Error("observe should use the shared shell host path");
          },
          requestInterrupt: async () => false,
        },
        observeWorkflowFactory: createObserveWorkflowFactory(events),
        refineWorkflowFactory: createRefineWorkflowFactory(events),
      }) as never,
    createWorkflowRegistry: (factories) => {
      registryFactoryKeys = Object.keys(factories).sort();
      return {
        resolve(command: "observe" | "refine" | "sop-compact") {
          if (command === "sop-compact") {
            return () =>
              createCompactWorkflowFactory(events)({
                runId: "compact-run",
                semanticMode: "on",
              });
          }
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
    command: "sop-compact",
    runId: "compact-run",
    semanticMode: "on",
  });

  assert.deepEqual(registryFactoryKeys, ["observe", "refine", "sop-compact"]);
  assert.equal(result.runId, "compact-run");
  assert.deepEqual(events, ["host.start", "compact.prepare:compact-run", "host.execute", "compact.execute:compact-run", "host.dispose", "compact.dispose:compact-run"]);
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
        agentRuntime: createAgentRuntime(events),
        observeRuntime: {
          observe: async () => {
            throw new Error("observe should use the shared shell host path");
          },
          requestInterrupt: async (signal) => {
            interruptCalls += 1;
            events.push(`observeRuntime.requestInterrupt:${signal}`);
            return true;
          },
        },
        observeWorkflowFactory: createObserveWorkflowFactory(events, { prepareGate }),
        refineWorkflowFactory: createRefineWorkflowFactory(events),
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

  assert.equal(interruptCalls, 0);
  assert.ok(events.includes("observe.requestInterrupt:SIGINT"));
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
        agentRuntime: createAgentRuntime(events),
        observeRuntime: {
          observe: async () => {
            throw new Error("observe should use the shared shell host path");
          },
          requestInterrupt: async (signal) => {
            interruptCalls += 1;
            events.push(`observeRuntime.requestInterrupt:${signal}`);
            return true;
          },
        },
        observeWorkflowFactory: createObserveWorkflowFactory(events, { disposeGate }),
        refineWorkflowFactory: createRefineWorkflowFactory(events),
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

  assert.equal(interruptCalls, 0);
  assert.ok(events.includes("observe.requestInterrupt:SIGINT"));
});
