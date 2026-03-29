import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "vitest";
import { CredentialBundleStore } from "../../../main/accounts/credential-bundle-store";
import { ExtensionCaptureServer } from "../../../main/browser/extension-capture-server";
import { SiteAccountStore } from "../../../main/accounts/site-account-store";
import { SiteRegistry } from "../../../main/accounts/site-registry";

async function createTempRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe("desktop extension capture server", () => {
  test("extension capture server persists a browser-plugin credential bundle", async () => {
    const rootDir = await createTempRoot("sasiki-extension-capture-");
    const siteAccountStore = new SiteAccountStore({ rootDir });
    await siteAccountStore.upsert({ id: "acct-1", site: "tiktok-shop", label: "Shop A" });
    const credentialStore = new CredentialBundleStore({ rootDir, siteAccountStore });
    const server = new ExtensionCaptureServer({
      credentialStore,
      siteAccountStore,
      siteRegistry: new SiteRegistry(),
    });

    const result = await server.handleCapture({
      site: "tiktok-shop",
      cookies: [{ name: "sessionid", value: "abc", domain: ".tiktok.com" }],
      accountId: "acct-1",
    });

    if (!("siteAccountId" in result)) {
      throw new Error("expected a saved credential result");
    }
    assert.equal(result.siteAccountId, "acct-1");
    assert.equal(result.credentialSource, "browser-plugin");
    assert.equal(
      (await credentialStore.getActiveForAccount("acct-1"))?.credentialSource,
      "browser-plugin",
    );
  });

  test("extension capture server stores pending captures when no account is selected", async () => {
    const rootDir = await createTempRoot("sasiki-extension-capture-pending-");
    const siteAccountStore = new SiteAccountStore({ rootDir });
    const credentialStore = new CredentialBundleStore({ rootDir, siteAccountStore });
    const server = new ExtensionCaptureServer({
      credentialStore,
      siteAccountStore,
      siteRegistry: new SiteRegistry(),
      rootDir,
    });

    const result = await server.handleCapture({
      site: "tiktok-shop",
      cookies: [{ name: "sessionid", value: "abc", domain: ".tiktok.com" }],
    });

    if (!("site" in result)) {
      throw new Error("expected a pending capture result");
    }
    assert.equal(result.site, "tiktok-shop");
    assert.equal("credentialSource" in result, false);
    assert.equal((await server.listPendingCaptures()).length, 1);
    assert.equal((await server.listPendingCaptures())[0]?.site, "tiktok-shop");
  });

  test("extension capture server rejects unsupported sites before storing pending captures", async () => {
    const rootDir = await createTempRoot("sasiki-extension-capture-unknown-site-");
    const siteAccountStore = new SiteAccountStore({ rootDir });
    const credentialStore = new CredentialBundleStore({ rootDir, siteAccountStore });
    const server = new ExtensionCaptureServer({
      credentialStore,
      siteAccountStore,
      siteRegistry: new SiteRegistry(),
      rootDir,
    });

    await assert.rejects(
      () =>
        server.handleCapture({
          site: "unknown-site",
          cookies: [{ name: "sessionid", value: "abc", domain: ".tiktok.com" }],
        }),
      /Unknown site: unknown-site/,
    );
    assert.equal((await server.listPendingCaptures()).length, 0);
  });
});
