import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
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
  test("lets sop-compact start without an active credential bundle even when the source run carries site metadata", async () => {
    const rootDir = await createTempRoot("sasiki-runtime-factory-compact-");
    const siteAccountStore = new SiteAccountStore({ rootDir });
    const credentialStore = new CredentialBundleStore({ rootDir, siteAccountStore });
    const runtimeProfileManager = new RuntimeProfileManager({ rootDir, siteAccountStore });
    const siteRegistry = new SiteRegistry();

    const account = await siteAccountStore.upsert({
      id: "acct-1",
      site: "tiktok-shop",
      label: "Historical Observe Account",
    });

    let credentialLookups = 0;
    let profileAllocations = 0;
    let capturedConfig:
      | {
          cdpUserDataDir: string;
          cdpCookiesDir: string;
        }
      | undefined;

    credentialStore.getActiveForAccount = async () => {
      credentialLookups += 1;
      throw new Error("should not look up credentials for sop-compact");
    };
    runtimeProfileManager.allocate = async () => {
      profileAllocations += 1;
      throw new Error("should not allocate a runtime profile for sop-compact");
    };

    const runtime = await createDesktopRuntimeFactory({
      rootDir,
      siteAccountStore,
      credentialStore,
      runtimeProfileManager,
      siteRegistry,
      processEnv: {},
      async loadRuntimeConfig(options) {
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
            return {
              mode: "compact",
              runId: "compact-run",
              sourceObserveRunId: "source-run-1",
              sessionId: "session-1",
              sessionDir: "/tmp/session",
              runDir: "/tmp/run",
              sourceTracePath: "/tmp/source-trace",
              sessionStatePath: "/tmp/session-state",
              humanLoopPath: "/tmp/human-loop",
              selectedSkillName: null,
              skillPath: null,
              capabilityOutputPath: null,
              status: "completed",
              roundsCompleted: 0,
              remainingOpenDecisions: [],
            };
          },
          async runRefine() {
            throw new Error("not used");
          },
          async requestInterrupt() {
            return true;
          },
          async stop() {},
        };
      },
    })({
      workflow: "sop-compact",
      siteAccountId: account.id,
      sourceRunId: "source-run-1",
      taskSummary: "compact historical observe",
    });

    const result = await runtime.runCompact({ runId: "source-run-1" });

    assert.equal(result.status, "completed");
    assert.equal(credentialLookups, 0);
    assert.equal(profileAllocations, 0);
    assert.deepEqual(capturedConfig, {
      cdpUserDataDir: "",
      cdpCookiesDir: "",
    });
  });

  test("releases the isolated runtime profile even when runtime stop rejects", async () => {
    const rootDir = await createTempRoot("sasiki-runtime-factory-stop-reject-");
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
    const runtime = await createDesktopRuntimeFactory({
      rootDir,
      siteAccountStore,
      credentialStore,
      runtimeProfileManager,
      siteRegistry,
      async loadRuntimeConfig(options) {
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
            await stat(join(runtimeConfig.cdpCookiesDir, "credential-bundle.json"));
            return {
              mode: "observe",
              runId: "observe-run",
              taskHint: "check inbox",
              status: "completed",
              finishReason: "observe_timeout_reached",
              artifactsDir: "/tmp/observe-run",
            };
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
            throw new Error("stop failed");
          },
        };
      },
    })({
      workflow: "observe",
      siteAccountId: account.id,
      sourceRunId: null,
      taskSummary: "check inbox",
    });

    assert.ok(capturedConfig);
    const cookieFile = join(capturedConfig!.cdpCookiesDir, "credential-bundle.json");
    await stat(cookieFile);

    await assert.rejects(() => runtime.stop(), /stop failed/);

    await assert.rejects(() => stat(capturedConfig!.cdpCookiesDir), /ENOENT/);
    await assert.rejects(() => stat(capturedConfig!.cdpUserDataDir), /ENOENT/);
  });

  test("materializes the active credential bundle into a run-scoped cookie file and cleans it up after the run fails", async () => {
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
            await stat(join(runtimeConfig.cdpCookiesDir, "credential-bundle.json"));
            throw new Error("run failed");
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

    await assert.rejects(
      () =>
        runtime.runObserve({
          task: "check inbox",
        }),
      /run failed/,
    );

    await assert.rejects(() => stat(capturedConfig!.cdpCookiesDir), /ENOENT/);
    await assert.rejects(() => stat(capturedConfig!.cdpUserDataDir), /ENOENT/);
  });
});
