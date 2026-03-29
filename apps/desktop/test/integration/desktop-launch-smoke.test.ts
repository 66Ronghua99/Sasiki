import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "vitest";
import { CookieImportService } from "../../main/accounts/cookie-import-service";
import { CredentialBundleStore } from "../../main/accounts/credential-bundle-store";
import { EmbeddedLoginService } from "../../main/accounts/embedded-login-service";
import { LoginVerifier } from "../../main/accounts/login-verifier";
import { SiteAccountStore } from "../../main/accounts/site-account-store";
import { SiteRegistry } from "../../main/accounts/site-registry";
import { ExtensionCaptureServer } from "../../main/browser/extension-capture-server";
import { createDesktopMainContext } from "../../main/desktop-main-context";
import {
  RunManager,
  type DesktopRuntimeService,
  type ObserveRuntimeResult,
} from "../../main/runs/run-manager";
import { RunEventBus } from "../../main/runs/run-event-bus";
import { desktopChannels } from "../../shared/ipc/channels";
import { SopSkillStore } from "../../../agent-runtime/src/infrastructure/persistence/sop-skill-store";

async function createTempRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

class FakeIpcMain {
  private readonly handlers = new Map<
    string,
    (event: { sender: unknown }, request: unknown) => Promise<unknown>
  >();

  handle(
    channel: string,
    handler: (event: { sender: unknown }, request: unknown) => Promise<unknown>,
  ): void {
    this.handlers.set(channel, handler);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }

  async invoke(channel: string, request: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) {
      throw new Error(`No handler registered for ${channel}`);
    }

    return handler({ sender: {} }, request);
  }
}

describe("desktop launch smoke", () => {
  test("desktop main wires real ipc handlers, skill listing, account persistence, and run summaries", async () => {
    const rootDir = await createTempRoot("sasiki-desktop-main-");
    const skillRootDir = join(rootDir, "skills");
    const skillDir = join(skillRootDir, "smoke-skill");
    const skillPath = join(skillDir, "SKILL.md");

    await mkdir(skillDir, { recursive: true });
    await writeFile(
      skillPath,
      [
        "---",
        "name: smoke-skill",
        "description: smoke test skill",
        "---",
        "",
        "Smoke test skill body.",
        "",
      ].join("\n"),
      "utf8",
    );

    const siteAccountStore = new SiteAccountStore({ rootDir });
    const credentialStore = new CredentialBundleStore({ rootDir, siteAccountStore });
    const embeddedLoginService = new EmbeddedLoginService({ credentialStore });
    const cookieImportService = new CookieImportService({ credentialStore });
    const loginVerifier = new LoginVerifier({
      siteAccountStore,
      credentialStore,
      siteRegistry: new SiteRegistry(),
    });
    const extensionCaptureServer = new ExtensionCaptureServer({
      credentialStore,
      siteAccountStore,
      siteRegistry: new SiteRegistry(),
      rootDir,
      port: 0,
    });
    const skillStore = new SopSkillStore(skillRootDir);
    const ipcMain = new FakeIpcMain();
    const shell = {
      openedPaths: [] as string[],
      async openPath(filePath: string): Promise<string> {
        this.openedPaths.push(filePath);
        return "";
      },
    };
    const runManager = new RunManager({
      createRuntime: () => createRuntimeStub(rootDir),
      events: new RunEventBus(),
    });
    const context = createDesktopMainContext({
      ipcMain,
      shell,
      siteAccountStore,
      embeddedLoginService,
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
      cookieImportService,
      loginVerifier,
      extensionCaptureServer,
      runManager,
      skillStore,
      skillRootDir,
    });

    await context.start();

    const skillsResponse = (await ipcMain.invoke(desktopChannels.skills.list, {})) as {
      skills: Array<{ name: string; description: string; path: string | null; updatedAt: string | null }>;
    };
    assert.equal(skillsResponse.skills.length, 1);
    assert.equal(skillsResponse.skills[0]?.name, "smoke-skill");
    assert.equal(skillsResponse.skills[0]?.path, skillPath);

    const upsertResponse = (await ipcMain.invoke(desktopChannels.accounts.upsert, {
      input: { id: "acct-1", site: "tiktok-shop", label: "Smoke Account" },
    })) as {
      account: { id: string; label: string };
    };
    assert.equal(upsertResponse.account.id, "acct-1");

    const accountsResponse = (await ipcMain.invoke(desktopChannels.accounts.list, {})) as {
      accounts: Array<{ id: string; label: string }>;
    };
    assert.deepEqual(accountsResponse.accounts.map((account) => account.label), ["Smoke Account"]);

    const observeResponse = (await ipcMain.invoke(desktopChannels.runs.startObserve, {
      input: { task: "check the inbox", siteAccountId: "acct-1" },
    })) as {
      runId: string;
    };
    assert.match(observeResponse.runId, /^desktop-observe-/);

    const runSummary = await waitForRunSummary(ipcMain, observeResponse.runId, "completed");
    assert.equal(runSummary.workflow, "observe");
    assert.equal(runSummary.status, "completed");
    assert.match(runSummary.artifactPath ?? "", /observe-smoke/);

    const artifactsResponse = (await ipcMain.invoke(desktopChannels.artifacts.openRunArtifacts, {
      runId: observeResponse.runId,
    })) as {
      opened: boolean;
    };
    assert.equal(artifactsResponse.opened, true);
    assert.deepEqual(shell.openedPaths, [runSummary.artifactPath]);

    await context.stop();
  });
});

function createRuntimeStub(rootDir: string): DesktopRuntimeService {
  return {
    async runObserve(request, hooks = {}) {
      hooks.onEvent?.({
        type: "run.started",
        workflow: "observe",
        status: "running",
        timestamp: new Date().toISOString(),
      });
      hooks.onEvent?.({
        type: "run.log",
        workflow: "observe",
        level: "info",
        message: `observe:${request.task}`,
        timestamp: new Date().toISOString(),
      });
      const result: ObserveRuntimeResult = {
        mode: "observe",
        runId: "observe-smoke",
        taskHint: request.task,
        status: "completed",
        finishReason: "smoke complete",
        artifactsDir: join(rootDir, "artifacts", "observe-smoke"),
      };
      hooks.onEvent?.({
        type: "run.finished",
        workflow: "observe",
        status: "completed",
        timestamp: new Date().toISOString(),
        resultSummary: `${result.status}:${result.finishReason}`,
      });
      return result;
    },
    async runCompact() {
      throw new Error("not used in smoke test");
    },
    async runRefine() {
      throw new Error("not used in smoke test");
    },
    async requestInterrupt() {
      return true;
    },
    async stop() {
      // no-op
    },
  };
}

async function waitForRunSummary(
  ipcMain: FakeIpcMain,
  runId: string,
  expectedStatus: string,
): Promise<{
  runId: string;
  workflow: string;
  status: string;
  artifactPath: string | null;
}> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = (await ipcMain.invoke(desktopChannels.runs.listRuns, {})) as {
      runs: Array<{
        runId: string;
        workflow: string;
        status: string;
        artifactPath: string | null;
      }>;
    };
    const summary = response.runs.find((candidate) => candidate.runId === runId);
    if (summary && summary.status === expectedStatus) {
      return summary;
    }

    await new Promise((resolve) => setImmediate(resolve));
  }

  throw new Error(`Run summary never appeared for ${runId}`);
}
