import assert from "node:assert/strict";
import { mock } from "node:test";
import test from "node:test";

import { ObserveExecutor } from "../../../src/application/observe/observe-executor.js";
import { createObserveWorkflowFactory } from "../../../src/application/observe/observe-workflow-factory.js";

test("createObserveWorkflowFactory keeps observe assembly inside application/observe", async () => {
  const calls: string[] = [];
  const telemetryScopes: Array<{ workflow: string; runId: string; artifactsDir: string }> = [];
  try {
    mock.method(ObserveExecutor.prototype, "execute", async (taskHint: string) => {
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
    });
    mock.method(ObserveExecutor.prototype, "requestInterrupt", async () => false);

    const workflowFactory = createObserveWorkflowFactory({
      browserLifecycle: {
        start: async () => {
          calls.push("browser.start");
        },
        stop: async () => {
          calls.push("browser.stop");
        },
        prepareObserveSession: async () => {
          calls.push("browser.prepareObserveSession");
        },
      },
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      } as never,
      createRecorder: () => {
        calls.push("createRecorder");
        return {
          start: async () => undefined,
          stop: async () => [],
        };
      },
      createArtifactsWriter: (runId: string) => ({
        runId,
        runDir: `/tmp/sasiki-observe/${runId}`,
        ensureDir: async () => undefined,
        writeDemonstrationRaw: async () => undefined,
        writeDemonstrationTrace: async () => undefined,
        writeSopDraft: async () => undefined,
        writeSopAsset: async () => undefined,
        demonstrationTracePath: () => `/tmp/sasiki-observe/${runId}/demonstration_trace.json`,
        sopDraftPath: () => `/tmp/sasiki-observe/${runId}/sop_draft.md`,
        sopAssetPath: () => `/tmp/sasiki-observe/${runId}/sop_asset.json`,
      }),
      sopAssetStore: {
        upsert: async () => undefined,
      },
      cdpEndpoint: "http://localhost:9222",
      observeTimeoutMs: 1234,
      createRunId: () => "run-1",
      telemetryRegistry: {
        createRunTelemetry(scope: { workflow: string; runId: string; artifactsDir: string }) {
          telemetryScopes.push(scope);
          return {
            eventBus: {
              emit: async () => undefined,
              dispose: async () => undefined,
            },
            dispose: async () => undefined,
          };
        },
      } as never,
    } as never);

    assert.deepEqual(calls, []);
    assert.deepEqual(telemetryScopes, []);

    const workflow = workflowFactory("record the homepage");
    assert.deepEqual(calls, []);
    assert.deepEqual(telemetryScopes, []);

    await workflow.prepare();
    const result = await workflow.execute();
    await workflow.dispose();

    assert.equal(result.taskHint, "record the homepage");
    assert.deepEqual(calls, [
      "browser.start",
      "browser.prepareObserveSession",
      "execute:record the homepage",
      "browser.stop",
    ]);
  } finally {
    mock.restoreAll();
  }
});
