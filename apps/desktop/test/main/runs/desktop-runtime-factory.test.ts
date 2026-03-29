import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "vitest";
import { CredentialBundleStore } from "../../../main/accounts/credential-bundle-store";
import { RuntimeProfileManager } from "../../../main/accounts/runtime-profile-manager";
import { SiteAccountStore } from "../../../main/accounts/site-account-store";
import { SiteRegistry } from "../../../main/accounts/site-registry";
import { createDesktopRuntimeFactory } from "../../../main/runs/desktop-runtime-factory";
import type { DesktopRuntimeService } from "../../../main/runs/run-manager";

async function createTempRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe("desktop runtime factory", () => {
  test("materializes the active credential bundle into a run-scoped cookie file", async () => {
    const rootDir = await createTempRoot("sasiki-runtime-factory-");
    const siteAccountStore = new SiteAccountStore({ rootDir });
    const credentialStore = new CredentialBundleStore({ rootDir, siteAccountStore });
    const runtimeProfileManager = new RuntimeProfileManager({ rootDir, siteAccountStore });
    const siteRegistry = new SiteRegistry();

    const account = await siteAccountStore.upsert({
      id: "acct-1",
      site: "tiktok-shop",
      label: "Smoke Account",
    });
    await credentialStore.save({
      siteAccountId: account.id,
      source: "file-import",
      cookies: [
        {
          name: "sessionid",
          value: "cookie-value",
          domain: ".tiktok.com",
          path: "/",
        },
      ],
      capturedAt: new Date().toISOString(),
      provenance: "seed",
    });

    let capturedConfig:
      | {
          cdpUserDataDir: string;
          cdpCookiesDir: string;
        }
      | undefined;
    let capturedBootstrapOptions:
      | {
          cwd?: string;
          env?: NodeJS.ProcessEnv;
        }
      | undefined;
    const runtime = await createDesktopRuntimeFactory({
      rootDir,
      siteAccountStore,
      credentialStore,
      runtimeProfileManager,
      siteRegistry,
      async loadRuntimeConfig(options) {
        capturedBootstrapOptions = options;
        return {
          cdpUserDataDir: options.env?.CDP_USER_DATA_DIR ?? "",
          cdpCookiesDir: options.env?.COOKIES_DIR ?? "",
        };
      },
      createRuntimeService(config): DesktopRuntimeService {
        const runtimeConfig = config as {
          cdpUserDataDir: string;
          cdpCookiesDir: string;
        };
        capturedConfig = {
          cdpUserDataDir: runtimeConfig.cdpUserDataDir,
          cdpCookiesDir: runtimeConfig.cdpCookiesDir,
        };
        return {
          async runObserve() {
            throw new Error("not used");
          },
          async runCompact() {
            throw new Error("not used");
          },
          async runRefine() {
            throw new Error("not used");
          },
          async requestInterrupt() {
            return true;
          },
          async stop() {
            // no-op
          },
        };
      },
    })({
      workflow: "observe",
      siteAccountId: account.id,
      sourceRunId: null,
      taskSummary: "check inbox",
    });

    assert.equal(capturedBootstrapOptions?.cwd, rootDir);
    assert.ok(capturedConfig);
    assert.match(capturedConfig!.cdpUserDataDir, new RegExp(`^${join(rootDir, "profiles", "runtime-profile-acct-1-")}`));
    assert.equal(capturedConfig!.cdpCookiesDir, join(capturedConfig!.cdpUserDataDir, "cookies"));

    const cookieFile = join(capturedConfig!.cdpCookiesDir, "credential-bundle.json");
    const cookieFileContent = await readFile(cookieFile, "utf8");
    assert.match(cookieFileContent, /cookie-value/);

    await runtime.stop();
  });
});
