import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { mergeRunSummaries, updateRunSummary } from "../../renderer/src/lib/run-summary-updater";
import type { DesktopRunSummary } from "../../shared/runs";

function createRunSummary(overrides: Partial<DesktopRunSummary> = {}): DesktopRunSummary {
  return {
    runId: "desktop-observe-1",
    workflow: "observe",
    status: "running",
    siteAccountId: "acct-1",
    taskSummary: "record a baidu search",
    sourceRunId: null,
    createdAt: "2026-03-30T00:00:00.000Z",
    updatedAt: "2026-03-30T00:00:00.000Z",
    artifactPath: null,
    ...overrides,
  };
}

describe("run summary updater", () => {
  test("keeps an interrupted run interrupted when a later finish event arrives", () => {
    const interrupted = updateRunSummary(createRunSummary({ status: "interrupted" }), {
      type: "run.finished",
      runId: "desktop-observe-1",
      workflow: "observe",
      timestamp: "2026-03-30T00:01:00.000Z",
      status: "completed",
    });

    assert.equal(interrupted.status, "interrupted");
    assert.equal(interrupted.updatedAt, "2026-03-30T00:01:00.000Z");
  });

  test("keeps an interrupted run interrupted when a later start event arrives", () => {
    const interrupted = updateRunSummary(createRunSummary({ status: "interrupted" }), {
      type: "run.started",
      runId: "desktop-observe-1",
      workflow: "observe",
      timestamp: "2026-03-30T00:01:00.000Z",
      status: "running",
    });

    assert.equal(interrupted.status, "interrupted");
    assert.equal(interrupted.updatedAt, "2026-03-30T00:01:00.000Z");
  });

  test("mergeRunSummaries keeps interrupted runs interrupted when later finish events are merged", () => {
    const merged = mergeRunSummaries(
      [createRunSummary({ status: "interrupted" })],
      [
        {
          type: "run.finished",
          runId: "desktop-observe-1",
          workflow: "observe",
          timestamp: "2026-03-30T00:01:00.000Z",
          status: "failed",
        },
      ],
    );

    assert.equal(merged[0]?.status, "interrupted");
    assert.equal(merged[0]?.updatedAt, "2026-03-30T00:01:00.000Z");
  });
});
