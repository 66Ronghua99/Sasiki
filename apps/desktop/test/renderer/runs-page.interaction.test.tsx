import assert from "node:assert/strict";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, test } from "vitest";
import { RunsPage } from "../../renderer/src/routes/RunsPage";
import { createDesktopApiShape } from "../../shared/ipc/contracts";
import type { DesktopRunEvent, DesktopRunSummary } from "../../shared/runs";
import { findButtonByText, findElementByText, setupRendererHarness } from "./dom-test-harness";

describe("RunsPage client rendering", () => {
  let harness: ReturnType<typeof setupRendererHarness> | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }

    harness?.cleanup();
    harness = null;
  });

  test("keeps live events across rerenders and refreshes terminal run summaries", async () => {
    harness = setupRendererHarness();
    const activeHarness = harness;
    assert.ok(activeHarness);
    root = createRoot(activeHarness.container as unknown as Element);

    let subscriber: ((event: DesktopRunEvent) => void) | null = null;
    let runs: DesktopRunSummary[] = [
      {
        runId: "run-1",
        workflow: "observe",
        status: "queued",
        taskSummary: "review inbox",
        sourceRunId: null,
        createdAt: "2026-03-29T12:00:00.000Z",
        updatedAt: "2026-03-29T12:00:00.000Z",
        artifactPath: null,
      },
    ];

    const client = createDesktopApiShape();
    client.runs.listRuns = async () => runs;
    client.runs.subscribe = (_runId, callback) => {
      subscriber = callback;
      return () => {
        if (subscriber === callback) {
          subscriber = null;
        }
      };
    };
    client.runs.interruptRun = async () => ({ interrupted: true });
    client.artifacts.openRunArtifacts = async () => {};

    const logEvent: DesktopRunEvent = {
      type: "run.log",
      runId: "run-1",
      workflow: "observe",
      level: "info",
      message: "connected",
      timestamp: "2026-03-29T12:01:00.000Z",
    };
    const startedEvent: DesktopRunEvent = {
      type: "run.started",
      runId: "run-1",
      workflow: "observe",
      status: "running",
      timestamp: "2026-03-29T12:00:30.000Z",
    };
    const finishedEvent: DesktopRunEvent = {
      type: "run.finished",
      runId: "run-1",
      workflow: "observe",
      status: "completed",
      resultSummary: "snapshot archived",
      timestamp: "2026-03-29T12:05:00.000Z",
    };

    await act(async () => {
      root?.render(
        <RunsPage
          client={client}
          initialRuns={runs}
          initialEvents={{
            "run-1": [],
          }}
        />,
      );
      await Promise.resolve();
    });

    assert.ok(subscriber, "expected a live subscription");

    await act(async () => {
      subscriber?.(startedEvent);
      subscriber?.(logEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.ok(findButtonByText(activeHarness.container, "review inbox").textContent?.includes("running"));
    assert.ok(findElementByText(activeHarness.container, "connected"));

    await act(async () => {
      root?.render(
        <RunsPage
          client={client}
          initialRuns={runs}
          initialEvents={{
            "run-1": [],
          }}
        />,
      );
      await Promise.resolve();
    });

    assert.ok(findElementByText(activeHarness.container, "connected"));

    await act(async () => {
      runs = [
        {
          ...runs[0],
          status: "completed",
          updatedAt: finishedEvent.timestamp,
          artifactPath: "/tmp/run-1",
        },
      ];
      subscriber?.(finishedEvent);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.ok(findButtonByText(activeHarness.container, "review inbox").textContent?.includes("completed"));
    assert.equal(findButtonByText(activeHarness.container, "Open Artifacts").disabled, false);
    assert.ok(findElementByText(activeHarness.container, "/tmp/run-1"));
  });
});
