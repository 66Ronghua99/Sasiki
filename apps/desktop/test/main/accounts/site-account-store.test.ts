import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "vitest";
import { CredentialBundleStore } from "../../../main/accounts/credential-bundle-store";
import { RuntimeProfileManager } from "../../../main/accounts/runtime-profile-manager";
import { SiteAccountStore } from "../../../main/accounts/site-account-store";
import { SiteRegistry } from "../../../main/accounts/site-registry";

async function createTempRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe("desktop accounts stores", () => {
  test("site account store persists multiple accounts under one site", async () => {
    const rootDir = await createTempRoot("sasiki-site-account-store-");
    const store = new SiteAccountStore({ rootDir });

    await store.upsert({ id: "acct-1", site: "tiktok-shop", label: "Shop A" });
    await store.upsert({ id: "acct-2", site: "tiktok-shop", label: "Shop B" });

    const accounts = await store.list();

    assert.deepEqual(
      accounts.map((account) => ({
        id: account.id,
        site: account.site,
        label: account.label,
        activeCredentialId: account.activeCredentialId,
        defaultRuntimeProfileId: account.defaultRuntimeProfileId,
      })),
      [
        {
          id: "acct-1",
          site: "tiktok-shop",
          label: "Shop A",
          activeCredentialId: null,
          defaultRuntimeProfileId: null,
        },
        {
          id: "acct-2",
          site: "tiktok-shop",
          label: "Shop B",
          activeCredentialId: null,
          defaultRuntimeProfileId: null,
        },
      ],
    );
  });

  test("credential bundle store replaces the active bundle for an account", async () => {
    const rootDir = await createTempRoot("sasiki-credential-store-");
    const siteAccountStore = new SiteAccountStore({ rootDir });
    await siteAccountStore.upsert({ id: "acct-1", site: "tiktok-shop", label: "Shop A" });
    const store = new CredentialBundleStore({ rootDir, siteAccountStore });

    const capturedAt = "2026-03-29T00:00:00.000Z";
    const first = await store.save({
      siteAccountId: "acct-1",
      source: "embedded-login",
      cookies: [{ name: "sid", value: "old" }],
      capturedAt,
      provenance: "embedded-window",
    });
    const second = await store.save({
      siteAccountId: "acct-1",
      source: "browser-plugin",
      cookies: [{ name: "sid", value: "new" }],
      capturedAt,
      provenance: "extension",
    });

    assert.equal(first.siteAccountId, "acct-1");
    assert.equal(first.credentialSource, "embedded-login");
    assert.equal(second.credentialSource, "browser-plugin");

    const active = await store.getActiveForAccount("acct-1");
    assert.equal(active?.credentialBundleId, second.credentialBundleId);
    assert.equal(active?.credentialSource, "browser-plugin");
    assert.deepEqual(active?.cookies, [{ name: "sid", value: "new" }]);
  });

  test("credential bundle store rejects missing site accounts", async () => {
    const rootDir = await createTempRoot("sasiki-credential-store-missing-");
    const siteAccountStore = new SiteAccountStore({ rootDir });
    const store = new CredentialBundleStore({ rootDir, siteAccountStore });

    await assert.rejects(
      () =>
        store.save({
          siteAccountId: "acct-1",
          source: "embedded-login",
          cookies: [{ name: "sid", value: "value" }],
          capturedAt: "2026-03-29T00:00:00.000Z",
          provenance: "embedded-window",
        }),
      /Unknown site account: acct-1/,
    );
  });

  test("runtime profile manager allocates isolated and reusable leases", async () => {
    const rootDir = await createTempRoot("sasiki-profile-manager-");
    const siteAccountStore = new SiteAccountStore({ rootDir });
    await siteAccountStore.upsert({ id: "acct-1", site: "tiktok-shop", label: "Shop A" });
    const manager = new RuntimeProfileManager({ rootDir, siteAccountStore });

    const reusable = await manager.allocate({
      siteAccountId: "acct-1",
      allowParallel: false,
    });
    const isolated = await manager.allocate({
      siteAccountId: "acct-1",
      allowParallel: true,
    });

    assert.equal(reusable.siteAccountId, "acct-1");
    assert.equal(reusable.isolated, false);
    assert.equal(
      (await siteAccountStore.getById("acct-1"))?.defaultRuntimeProfileId,
      reusable.runtimeProfileId,
    );
    assert.equal(isolated.siteAccountId, "acct-1");
    assert.equal(isolated.isolated, true);
    assert.notEqual(isolated.runtimeProfileId, reusable.runtimeProfileId);
  });

  test("runtime profile manager rejects missing site accounts", async () => {
    const rootDir = await createTempRoot("sasiki-profile-manager-missing-");
    const siteAccountStore = new SiteAccountStore({ rootDir });
    const manager = new RuntimeProfileManager({ rootDir, siteAccountStore });

    await assert.rejects(
      () =>
        manager.allocate({
          siteAccountId: "acct-1",
          allowParallel: true,
        }),
      /Unknown site account: acct-1/,
    );
  });

  test("site registry resolves known sites and rejects unknown sites", () => {
    const registry = new SiteRegistry();

    const site = registry.require("tiktok-shop");
    assert.equal(site.site, "tiktok-shop");
    assert.equal(site.label, "TikTok Shop");
    assert.equal(site.verificationUrl, "https://www.tiktok.com/");
    assert.equal(registry.list().length > 0, true);

    assert.throws(() => registry.require("unknown-site"), /Unknown site/);
  });
});
