import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ObserveExecutor } from "../../../src/application/observe/observe-executor.js";
import type { DemonstrationRawEvent, SopTrace } from "../../../src/domain/sop-trace.js";
import { ArtifactsWriter } from "../../../src/infrastructure/persistence/artifacts-writer.js";

class TestLogger {
  readonly entries: string[] = [];

  info(event: string, payload?: Record<string, unknown>): void {
    this.entries.push(`info:${event}:${JSON.stringify(payload ?? {})}`);
  }

  warn(event: string, payload?: Record<string, unknown>): void {
    this.entries.push(`warn:${event}:${JSON.stringify(payload ?? {})}`);
  }

  error(event: string, payload?: Record<string, unknown>): void {
    this.entries.push(`error:${event}:${JSON.stringify(payload ?? {})}`);
  }
}

test("application observe executor creates run-scoped telemetry from the real observe run id", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-observe-executor-"));
  const logger = new TestLogger();
  const telemetryScopes: Array<{ workflow: string; runId: string; artifactsDir: string }> = [];
  const emittedEvents: Array<{ eventType: string; runId: string; workflow: string; payload: Record<string, unknown> }> = [];
  const artifactsWriterRuns: string[] = [];
  const upsertedAssets: unknown[] = [];
  const rawEvents: DemonstrationRawEvent[] = [
    {
      eventId: "event-1",
      timestamp: "2026-03-21T00:00:00.000Z",
      type: "navigate",
      url: "https://example.com/",
      tabId: "tab-1",
      payload: {},
    },
  ];
  const trace: SopTrace = {
    traceVersion: "v0",
    traceId: "run-1",
    mode: "observe",
    site: "example.com",
    singleTabOnly: true,
    taskHint: "record the homepage",
    steps: [
      {
        stepIndex: 1,
        timestamp: "2026-03-21T00:00:00.000Z",
        action: "navigate",
        tabId: "tab-1",
        target: { type: "url", value: "https://example.com/" },
        input: {},
        page: { urlBefore: "about:blank", urlAfter: "https://example.com/" },
        rawRef: "event-1",
      },
    ],
  };
  const recorder = {
    start: async (): Promise<void> => {},
    stop: async (): Promise<DemonstrationRawEvent[]> => rawEvents,
  };
  const sopRecorder = {
    buildTrace: (input: { traceId: string; taskHint: string; site: string; rawEvents: DemonstrationRawEvent[] }) => {
      assert.equal(input.traceId, "run-1");
      assert.equal(input.taskHint, "record the homepage");
      assert.equal(input.site, "example.com");
      assert.equal(input.rawEvents, rawEvents);
      return trace;
    },
    buildDraft: (value: SopTrace) => {
      assert.equal(value, trace);
      return "# draft\n";
    },
    buildWebElementHints: (value: SopTrace) => {
      assert.equal(value, trace);
      return [];
    },
      buildTags: (value: SopTrace) => {
        assert.equal(value, trace);
        return ["observe", "navigate"];
      },
    };
  const telemetryRegistry = {
    createRunTelemetry(scope: { workflow: string; runId: string; artifactsDir: string }) {
      telemetryScopes.push(scope);
      return {
        eventBus: {
          emit: async (event: { eventType: string; runId: string; workflow: string; payload: Record<string, unknown> }) => {
            emittedEvents.push(event);
          },
          dispose: async () => undefined,
        },
        dispose: async () => undefined,
      };
    },
  };
  const observer = new ObserveExecutor({
    logger: logger as never,
    cdpEndpoint: "http://localhost:9222",
    observeTimeoutMs: 0,
    createRunId: () => "run-1",
    sopRecorder: sopRecorder as never,
    createArtifactsWriter: (runId: string) => {
      artifactsWriterRuns.push(runId);
      return new ArtifactsWriter(path.join(tmpRoot, "artifacts"), runId);
    },
    sopAssetStore: {
      upsert: async (asset: unknown) => {
        upsertedAssets.push(asset);
      },
    },
    createRecorder: () => recorder as never,
    telemetryRegistry: telemetryRegistry as never,
  });

  const result = await observer.execute("record the homepage");

  assert.equal(result.runId, "run-1");
  assert.equal(result.status, "completed");
  assert.equal(result.finishReason, "observe_timeout_reached");
  assert.equal(result.artifactsDir, path.join(tmpRoot, "artifacts", "run-1"));
  assert.equal(result.tracePath, path.join(tmpRoot, "artifacts", "run-1", "demonstration_trace.json"));
  assert.equal(result.draftPath, path.join(tmpRoot, "artifacts", "run-1", "sop_draft.md"));
  assert.equal(result.assetPath, path.join(tmpRoot, "artifacts", "run-1", "sop_asset.json"));
  assert.equal(await readFile(result.tracePath ?? "", "utf-8").then((value) => value.includes("run-1")), true);
  assert.equal(await readFile(result.draftPath ?? "", "utf-8"), "# draft\n");
  assert.deepEqual(artifactsWriterRuns, ["run-1"]);
  assert.equal(upsertedAssets.length, 1);
  assert.deepEqual(telemetryScopes, [
    {
      workflow: "observe",
      runId: "run-1",
      artifactsDir: path.join(tmpRoot, "artifacts", "run-1"),
    },
  ]);
  assert.deepEqual(emittedEvents.map((event) => event.eventType), ["workflow.lifecycle", "workflow.lifecycle"]);
  assert.equal(
    emittedEvents.every((event) => event.workflow === "observe" && event.runId === "run-1"),
    true
  );
  assert.deepEqual(logger.entries, [
    'info:observe_started:{"runId":"run-1","taskHint":"record the homepage","artifactsDir":"' +
      path.join(tmpRoot, "artifacts", "run-1") +
      '","timeoutMs":0}',
    'info:observe_finished:{"runId":"run-1","status":"completed","finishReason":"observe_timeout_reached","events":1,"tracePath":"' +
      path.join(tmpRoot, "artifacts", "run-1", "demonstration_trace.json") +
      '","assetPath":"' +
      path.join(tmpRoot, "artifacts", "run-1", "sop_asset.json") +
      '"}',
  ]);
});
