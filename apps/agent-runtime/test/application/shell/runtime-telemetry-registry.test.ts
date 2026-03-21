import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeTelemetryRegistry } from "../../../src/application/shell/runtime-telemetry-registry.js";
import type {
  AgentCheckpointWriter,
  RuntimeEvent,
  RuntimeTelemetrySink,
} from "../../../src/contracts/runtime-telemetry.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function createNoopCheckpoints(): AgentCheckpointWriter {
  return {
    async append(): Promise<void> {},
    async dispose(): Promise<void> {},
  };
}

test("runtime telemetry registry serializes sink dispatch in emit order", async () => {
  const releaseFirst = deferred();
  const seen: string[] = [];
  const sink: RuntimeTelemetrySink = {
    async emit(event: RuntimeEvent): Promise<void> {
      seen.push(`start:${event.eventType}`);
      if (event.eventType === "first") {
        await releaseFirst.promise;
      }
      seen.push(`end:${event.eventType}`);
    },
  };

  const registry = createRuntimeTelemetryRegistry({
    createSinks(scope) {
      assert.deepEqual(scope, {
        workflow: "refine",
        runId: "run-1",
        artifactsDir: "/tmp/run-1",
      });
      return [sink];
    },
    createArtifacts(scope) {
      assert.deepEqual(scope, {
        workflow: "refine",
        runId: "run-1",
        artifactsDir: "/tmp/run-1",
      });
      return {
        scope,
        artifactsDir: scope.artifactsDir,
        checkpointMode: "key_turns",
        checkpoints: createNoopCheckpoints(),
        async dispose(): Promise<void> {},
      };
    },
  });
  const telemetry = registry.createRunTelemetry({
    workflow: "refine",
    runId: "run-1",
    artifactsDir: "/tmp/run-1",
  });

  const first = telemetry.eventBus.emit({
    timestamp: "2026-03-21T00:00:00.000Z",
    workflow: "refine",
    runId: "run-1",
    eventType: "first",
    payload: { seq: 1 },
  });
  const second = telemetry.eventBus.emit({
    timestamp: "2026-03-21T00:00:01.000Z",
    workflow: "refine",
    runId: "run-1",
    eventType: "second",
    payload: { seq: 2 },
  });

  await Promise.resolve();
  assert.deepEqual(seen, ["start:first"]);

  releaseFirst.resolve();
  await Promise.all([first, second]);

  assert.deepEqual(seen, ["start:first", "end:first", "start:second", "end:second"]);
});

test("runtime telemetry registry disposes after queued emits finish", async () => {
  const releaseFirst = deferred();
  const order: string[] = [];
  const sink: RuntimeTelemetrySink = {
    async emit(event: RuntimeEvent): Promise<void> {
      order.push(`emit:${event.eventType}`);
      if (event.eventType === "first") {
        await releaseFirst.promise;
      }
    },
    async dispose(): Promise<void> {
      order.push("sink:dispose");
    },
  };

  const registry = createRuntimeTelemetryRegistry({
    createSinks: () => [sink],
    createArtifacts(scope) {
      return {
        scope,
        artifactsDir: scope.artifactsDir,
        checkpointMode: "key_turns",
        checkpoints: createNoopCheckpoints(),
        async dispose(): Promise<void> {
          order.push("artifacts:dispose");
        },
      };
    },
  });
  const telemetry = registry.createRunTelemetry({
    workflow: "refine",
    runId: "run-2",
    artifactsDir: "/tmp/run-2",
  });

  const pending = telemetry.eventBus.emit({
    timestamp: "2026-03-21T00:00:00.000Z",
    workflow: "refine",
    runId: "run-2",
    eventType: "first",
    payload: { seq: 1 },
  });

  await Promise.resolve();
  const disposing = telemetry.dispose();
  await Promise.resolve();
  assert.deepEqual(order, ["emit:first"]);

  releaseFirst.resolve();
  await Promise.all([pending, disposing]);

  assert.deepEqual(order, ["emit:first", "sink:dispose", "artifacts:dispose"]);
});

test("runtime telemetry registry rejects scope mismatches", async () => {
  const registry = createRuntimeTelemetryRegistry({
    createSinks: () => [],
  });
  const telemetry = registry.createRunTelemetry({
    workflow: "refine",
    runId: "run-3",
    artifactsDir: "/tmp/run-3",
  });

  await assert.rejects(
    telemetry.eventBus.emit({
      timestamp: "2026-03-21T00:00:00.000Z",
      workflow: "observe",
      runId: "run-3",
      eventType: "wrong-workflow",
      payload: {},
    }),
    /runtime telemetry event scope mismatch/i
  );

  await assert.rejects(
    telemetry.eventBus.emit({
      timestamp: "2026-03-21T00:00:00.000Z",
      workflow: "refine",
      runId: "run-4",
      eventType: "wrong-run",
      payload: {},
    }),
    /runtime telemetry event scope mismatch/i
  );
});
