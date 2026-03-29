import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountsPage } from "../../renderer/src/routes/AccountsPage";

describe("AccountsPage", () => {
  test("renders site account controls and hides raw site-only selectors", () => {
    const markup = renderToStaticMarkup(
      <AccountsPage
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
      />,
    );

    assert.match(markup, /Accounts/);
    assert.match(markup, /TikTok \/ Shop A/);
    assert.match(markup, /Login In Sasiki/);
    assert.match(markup, /Import Cookie File/);
    assert.match(markup, /Verify Login State/);
    assert.doesNotMatch(markup, /aria-label="Site"/);
  });
});
