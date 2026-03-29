import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RunsPage } from "../../renderer/src/routes/RunsPage";

describe("RunsPage", () => {
  test("renders live run summary and artifact actions", () => {
    const markup = renderToStaticMarkup(
      <RunsPage
        initialRuns={[
          {
            runId: "run-1",
            workflow: "refine",
            status: "running",
            siteAccountId: "acct-1",
            taskSummary: "review inbox",
            sourceRunId: null,
            createdAt: "2026-03-29T12:00:00.000Z",
            updatedAt: "2026-03-29T12:03:00.000Z",
            artifactPath: "/tmp/run-1",
          },
        ]}
        initialEvents={{
          "run-1": [
            {
              type: "run.started",
              runId: "run-1",
              workflow: "refine",
              status: "running",
              timestamp: "2026-03-29T12:00:00.000Z",
            },
            {
              type: "run.log",
              runId: "run-1",
              workflow: "refine",
              level: "info",
              message: "connected",
              timestamp: "2026-03-29T12:01:00.000Z",
            },
          ],
        }}
        />
    );

    assert.match(markup, /running/);
    assert.match(markup, /Open Artifacts/);
    assert.match(markup, /connected/);
  });
});
