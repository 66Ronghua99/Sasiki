import assert from "node:assert/strict";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, test } from "vitest";
import { AccountsPage } from "../../renderer/src/routes/AccountsPage";
import { createDesktopApiShape } from "../../shared/ipc/contracts";
import type { SiteAccountSummary } from "../../shared/site-accounts";
import { click, findButtonByText, findElementByText, setupRendererHarness } from "./dom-test-harness";

describe("AccountsPage client rendering", () => {
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

  test("refreshes visible account state after a credential action", async () => {
    harness = setupRendererHarness();
    const activeHarness = harness;
    assert.ok(activeHarness);
    root = createRoot(activeHarness.container as unknown as Element);

    let accounts: SiteAccountSummary[] = [
      {
        id: "acct-1",
        site: "tiktok-shop",
        label: "TikTok / Shop A",
        activeCredentialId: "cred-1",
        activeCredentialSource: "embedded-login",
        credentialUpdatedAt: "2026-03-29T12:00:00.000Z",
        verificationStatus: "unknown",
        lastVerifiedAt: null,
        defaultRuntimeProfileId: "profile-1",
      },
    ];

    const client = createDesktopApiShape();
    client.accounts.list = async () => accounts;
    client.accounts.verifyCredential = async ({ siteAccountId }) => {
      accounts = accounts.map((account) =>
        account.id === siteAccountId
          ? {
              ...account,
              verificationStatus: "verified",
              lastVerifiedAt: "2026-03-29T12:10:00.000Z",
            }
          : account,
      );

      return {
        siteAccountId,
        status: "verified",
        checkedAt: "2026-03-29T12:10:00.000Z",
        message: "credential is valid",
      };
    };
    client.accounts.launchEmbeddedLogin = async ({ siteAccountId }) => {
      accounts = accounts.map((account) =>
        account.id === siteAccountId
          ? {
              ...account,
              activeCredentialId: "cred-3",
              activeCredentialSource: "embedded-login",
              credentialUpdatedAt: "2026-03-29T12:11:00.000Z",
            }
          : account,
      );
    };
    client.accounts.importCookieFile = async ({ siteAccountId }) => {
      accounts = accounts.map((account) =>
        account.id === siteAccountId
          ? {
              ...account,
              activeCredentialId: "cred-4",
              activeCredentialSource: "file-import",
              credentialUpdatedAt: "2026-03-29T12:12:00.000Z",
            }
          : account,
      );

      return {
        siteAccountId,
        credentialBundleId: "cred-4",
        credentialSource: "file-import",
        capturedAt: "2026-03-29T12:12:00.000Z",
        provenance: null,
      };
    };

    await act(async () => {
      root?.render(<AccountsPage client={client} />);
      await Promise.resolve();
    });

    assert.ok(findElementByText(activeHarness.container, "TikTok / Shop A"));
    assert.ok(findElementByText(activeHarness.container, "not checked yet"));

    await act(async () => {
      click(findButtonByText(activeHarness.container, "Verify Login State"));
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.ok(findElementByText(activeHarness.container, "verified"));
    assert.ok(findElementByText(activeHarness.container, "2026-03-29T12:10:00.000Z"));

    await act(async () => {
      click(findButtonByText(activeHarness.container, "Login In Sasiki"));
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.ok(findElementByText(activeHarness.container, "2026-03-29T12:11:00.000Z"));
    assert.ok(findElementByText(activeHarness.container, "embedded-login"));

    await act(async () => {
      click(findButtonByText(activeHarness.container, "Import Cookie File"));
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.ok(findElementByText(activeHarness.container, "file-import"));
    assert.ok(findElementByText(activeHarness.container, "2026-03-29T12:12:00.000Z"));
  });
});
