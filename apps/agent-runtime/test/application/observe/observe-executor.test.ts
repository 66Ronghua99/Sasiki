import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ObserveExecutor } from "../../../src/application/observe/observe-executor.js";
import type { DemonstrationRawEvent, SopTrace } from "../../../src/domain/sop-trace.js";
import type { Logger } from "../../../src/contracts/logger.js";
import type { SopAsset } from "../../../src/domain/sop-asset.js";

class TestLogger implements Logger {
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

  toText(): string {
    return this.entries.join("\n");
  }
}

test("application observe executor owns observe artifact orchestration", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-observe-executor-"));
  const logger = new TestLogger();
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
  const assetCalls: SopAsset[] = [];
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
  const observer = new ObserveExecutor({
    logger,
    cdpEndpoint: "http://localhost:9222",
    observeTimeoutMs: 0,
    artifactsDir: path.join(tmpRoot, "artifacts"),
    createRunId: () => "run-1",
    sopRecorder: sopRecorder as never,
    sopAssetStore: {
      upsert: async (asset: SopAsset) => {
        assetCalls.push(asset);
      },
    },
    createRecorder: () => recorder as never,
  });

  const result = await observer.execute("record the homepage");

  assert.equal(result.runId, "run-1");
  assert.equal(result.status, "completed");
  assert.equal(result.finishReason, "observe_timeout_reached");
  assert.equal(result.artifactsDir, path.join(tmpRoot, "artifacts", "run-1"));
  assert.equal(result.tracePath, path.join(tmpRoot, "artifacts", "run-1", "demonstration_trace.json"));
  assert.equal(result.draftPath, path.join(tmpRoot, "artifacts", "run-1", "sop_draft.md"));
  assert.equal(result.assetPath, path.join(tmpRoot, "artifacts", "run-1", "sop_asset.json"));
  assert.equal(assetCalls.length, 1);
  assert.equal(assetCalls[0]?.assetId, "sop_run-1");
  assert.equal(await readFile(result.tracePath ?? "", "utf-8").then((value) => value.includes("run-1")), true);
  assert.equal(await readFile(result.draftPath ?? "", "utf-8"), "# draft\n");
});
