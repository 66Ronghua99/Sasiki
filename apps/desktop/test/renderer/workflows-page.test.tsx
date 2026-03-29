import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkflowsPage } from "../../renderer/src/routes/WorkflowsPage";

describe("WorkflowsPage", () => {
  test("renders observe, sop-compact, and refine forms with account-aware controls", () => {
    const markup = renderToStaticMarkup(
      <WorkflowsPage
        initialAccounts={[
          {
            id: "acct-1",
            site: "tiktok-shop",
            label: "TikTok / Shop A",
            activeCredentialId: "cred-1",
            activeCredentialSource: "embedded-login",
            credentialUpdatedAt: "2026-03-29T12:00:00.000Z",
            verificationStatus: "verified",
            lastVerifiedAt: "2026-03-29T12:05:00.000Z",
            defaultRuntimeProfileId: "profile-1",
          },
        ]}
        initialRuns={[
          {
            runId: "run-1",
            workflow: "observe",
            status: "completed",
            siteAccountId: "acct-1",
            taskSummary: "search checkout",
            sourceRunId: null,
            createdAt: "2026-03-29T12:00:00.000Z",
            updatedAt: "2026-03-29T12:01:00.000Z",
            artifactPath: null,
          },
          {
            runId: "run-2",
            workflow: "refine",
            status: "completed",
            siteAccountId: "acct-1",
            taskSummary: "backoffice sync",
            sourceRunId: "run-1",
            createdAt: "2026-03-29T12:02:00.000Z",
            updatedAt: "2026-03-29T12:03:00.000Z",
            artifactPath: null,
          },
        ]}
      />,
    );

    assert.match(markup, /Observe Task/);
    assert.match(markup, /Source Observe Run/);
    assert.match(markup, /Refine Task/);
    assert.match(markup, /Semantic Mode/);
    assert.doesNotMatch(markup, /backoffice sync/);
    assert.doesNotMatch(markup, /aria-label="Site"/);
  });
});
