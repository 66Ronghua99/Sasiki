import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "vitest";
import { CookieImportService } from "../../../main/accounts/cookie-import-service";
import { CredentialBundleStore } from "../../../main/accounts/credential-bundle-store";
import { EmbeddedLoginService } from "../../../main/accounts/embedded-login-service";
import { LoginVerifier } from "../../../main/accounts/login-verifier";
import { createAccountsIpcHandlers } from "../../../main/ipc/register-accounts-ipc";
import { SiteAccountStore } from "../../../main/accounts/site-account-store";
import { SiteRegistry } from "../../../main/accounts/site-registry";

async function createTempRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe("desktop account capture services", () => {
  test("embedded login saves cookies back into the selected site account", async () => {
    const rootDir = await createTempRoot("sasiki-embedded-login-");
    const siteAccountStore = new SiteAccountStore({ rootDir });
    await siteAccountStore.upsert({ id: "acct-1", site: "tiktok-shop", label: "Shop A" });
    const credentialStore = new CredentialBundleStore({ rootDir, siteAccountStore });
    const service = new EmbeddedLoginService({ credentialStore });

    const result = await service.completeLogin(
      { siteAccountId: "acct-1" },
      {
        cookies: {
          async get() {
            return [{ name: "sessionid", value: "abc", domain: ".tiktok.com" }];
          },
        },
      },
    );

    assert.equal(result.siteAccountId, "acct-1");
    assert.equal(result.credentialSource, "embedded-login");
    assert.equal(
      (await credentialStore.getActiveForAccount("acct-1"))?.credentialSource,
      "embedded-login",
    );
  });

  test("cookie import normalizes a cookie file into the active credential bundle", async () => {
    const rootDir = await createTempRoot("sasiki-cookie-import-");
    const siteAccountStore = new SiteAccountStore({ rootDir });
    await siteAccountStore.upsert({ id: "acct-1", site: "tiktok-shop", label: "Shop A" });
    const credentialStore = new CredentialBundleStore({ rootDir, siteAccountStore });
    const importFilePath = join(rootDir, "cookies.json");
    await writeFile(
      importFilePath,
      JSON.stringify({
        cookies: [{ name: "sessionid", value: "from-file", domain: ".tiktok.com" }],
      }),
      "utf8",
    );
    const service = new CookieImportService({ credentialStore });

    const result = await service.importFromFile({
      siteAccountId: "acct-1",
      filePath: importFilePath,
    });

    assert.equal(result.siteAccountId, "acct-1");
    assert.equal(result.credentialSource, "file-import");
    assert.equal(
      (await credentialStore.getActiveForAccount("acct-1"))?.cookies[0]?.value,
      "from-file",
    );
  });

  test("login verifier marks credentials verified when cookies match the site registry", async () => {
    const rootDir = await createTempRoot("sasiki-login-verifier-");
    const siteAccountStore = new SiteAccountStore({ rootDir });
    await siteAccountStore.upsert({ id: "acct-1", site: "tiktok-shop", label: "Shop A" });
    const credentialStore = new CredentialBundleStore({ rootDir, siteAccountStore });
    await credentialStore.save({
      siteAccountId: "acct-1",
      source: "browser-plugin",
      cookies: [{ name: "sessionid", value: "abc", domain: ".tiktok.com" }],
      capturedAt: "2026-03-29T00:00:00.000Z",
      provenance: "extension",
    });
    const verifier = new LoginVerifier({
      siteAccountStore,
      credentialStore,
      siteRegistry: new SiteRegistry(),
    });

    const result = await verifier.verify({ siteAccountId: "acct-1" });

    assert.equal(result.siteAccountId, "acct-1");
    assert.equal(result.status, "verified");
    assert.match(result.message ?? "", /https:\/\/www\.tiktok\.com\//);
    assert.equal((await siteAccountStore.getById("acct-1"))?.verificationStatus, "verified");
  });

  test("accounts ipc handlers route imports and verification through the service layer", async () => {
    const rootDir = await createTempRoot("sasiki-accounts-ipc-");
    const siteAccountStore = new SiteAccountStore({ rootDir });
    await siteAccountStore.upsert({ id: "acct-1", site: "tiktok-shop", label: "Shop A" });
    const credentialStore = new CredentialBundleStore({ rootDir, siteAccountStore });
    const importFilePath = join(rootDir, "cookies.json");
    await writeFile(
      importFilePath,
      JSON.stringify([{ name: "sessionid", value: "from-ipc", domain: ".tiktok.com" }]),
      "utf8",
    );
    const handlers = createAccountsIpcHandlers({
      siteAccountStore,
      embeddedLoginService: new EmbeddedLoginService({ credentialStore }),
      embeddedLoginLauncher: {
        async launch() {
          return {
            cookies: {
              async get() {
                return [{ name: "sessionid", value: "embedded", domain: ".tiktok.com" }];
              },
            },
          };
        },
      },
      cookieImportService: new CookieImportService({ credentialStore }),
      loginVerifier: new LoginVerifier({
        siteAccountStore,
        credentialStore,
        siteRegistry: new SiteRegistry(),
      }),
    });

    const imported = await handlers.importCookieFile({
      input: { siteAccountId: "acct-1", filePath: importFilePath },
    });
    const verified = await handlers.verifyCredential({ siteAccountId: "acct-1" });
    await handlers.launchEmbeddedLogin({ siteAccountId: "acct-1" });

    assert.equal(imported.result.credentialSource, "file-import");
    assert.equal(verified.result.status, "verified");
    assert.equal(
      (await credentialStore.getActiveForAccount("acct-1"))?.credentialSource,
      "embedded-login",
    );
  });
});
