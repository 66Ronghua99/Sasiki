import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeConfig } from "../../../src/application/config/runtime-config.js";
import { RuntimeService, type RuntimeServiceEvent } from "../../../src/application/shell/runtime-service.js";
import type {
  RuntimeServiceCommandRequest,
  RuntimeServiceLike,
} from "../../../src/application/shell/runtime-service.js";
import { runCliMain } from "../../../src/index.js";

function buildRuntimeConfig(): RuntimeConfig {
  return {} as RuntimeConfig;
}

function createRuntimeServiceStub(
  implementation: (request: RuntimeServiceCommandRequest) => Promise<unknown>,
): RuntimeServiceLike {
  return {
    runCommand: implementation,
    async requestInterrupt(): Promise<boolean> {
      return false;
    },
    async stop(): Promise<void> {
      // no-op
    },
  };
}

test("runtime service executes observe and emits lifecycle events", async () => {
  const events: RuntimeServiceEvent[] = [];
  const service = new RuntimeService(buildRuntimeConfig(), {
    createRuntimeServiceRuntime: () =>
      createRuntimeServiceStub(async (request) => {
        assert.deepEqual(request, {
          command: "observe",
          task: "record a baidu search",
        });

        return {
          mode: "observe",
          runId: "observe-run",
          taskHint: "record a baidu search",
          status: "completed",
          finishReason: "observe_timeout_reached",
          artifactsDir: "/tmp/observe-run",
        };
      }),
  });

  const result = await service.runObserve(
    { task: "record a baidu search" },
    {
      onEvent(event) {
        events.push(event);
      },
    },
  );

  assert.equal(result.mode, "observe");
  assert.equal(events[0]?.type, "run.started");
  assert.equal(events.at(-1)?.type, "run.finished");
  assert.equal(events.at(-1)?.status, "completed");
});

test("runtime service emits a failed finish event when workflow execution throws", async () => {
  const events: RuntimeServiceEvent[] = [];
  const service = new RuntimeService(buildRuntimeConfig(), {
    createRuntimeServiceRuntime: () =>
      createRuntimeServiceStub(async () => {
        throw new Error("observe exploded");
      }),
  });

  await assert.rejects(
    service.runObserve(
      { task: "record a baidu search" },
      {
        onEvent(event) {
          events.push(event);
        },
      },
    ),
    /observe exploded/,
  );

  assert.equal(events[0]?.type, "run.started");
  assert.equal(events.at(-1)?.type, "run.finished");
  assert.equal(events.at(-1)?.status, "failed");
});

test("cli main prints the final workflow result json through runtime service", async () => {
  const stdoutWrites: string[] = [];
  const stderrWrites: string[] = [];
  const parsedArgs = {
    command: "observe" as const,
    task: "demo task",
    configPath: undefined,
  };

  await runCliMain(["observe", "demo task"], {
    parseCliArguments: () => parsedArgs,
    loadRuntimeConfig: () => buildRuntimeConfig(),
    createRuntimeService: () =>
      new RuntimeService(buildRuntimeConfig(), {
        createRuntimeServiceRuntime: () =>
          createRuntimeServiceStub(async (request) => {
            assert.deepEqual(request, parsedArgs);
            return {
              mode: "observe",
              runId: "observe-run",
              taskHint: "demo task",
              status: "completed",
              finishReason: "observe_timeout_reached",
              artifactsDir: "/tmp/observe-run",
            };
          }),
      }),
    processObject: {
      stdout: {
        write(chunk: string) {
          stdoutWrites.push(chunk);
          return true;
        },
      },
      stderr: {
        write(chunk: string) {
          stderrWrites.push(chunk);
          return true;
        },
      },
      on() {
        return undefined;
      },
      off() {
        return undefined;
      },
      exit(code?: number) {
        throw new Error(`unexpected exit ${code}`);
      },
    },
  });

  assert.match(stdoutWrites.join(""), /"mode": "observe"/);
  assert.deepEqual(stderrWrites, []);
});
