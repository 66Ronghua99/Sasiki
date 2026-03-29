import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { CookieImportService } from "./accounts/cookie-import-service";
import type { EmbeddedLoginService } from "./accounts/embedded-login-service";
import type { LoginVerifier } from "./accounts/login-verifier";
import type { SiteAccountStore } from "./accounts/site-account-store";
import type { ExtensionCaptureServer } from "./browser/extension-capture-server";
import { createAccountsIpcHandlers } from "./ipc/register-accounts-ipc";
import type { DesktopIpcMain } from "./ipc/ipc-main-port";
import { registerDesktopIpc } from "./register-ipc";
import { RunEventForwarder } from "./runs/run-event-forwarder";
import { createRunsIpcHandlers, type RunManager } from "./runs/run-manager";
import type { EmbeddedLoginLauncher } from "./ipc/register-accounts-ipc";
import type { ListSkillsResponse, OpenRunArtifactsResponse } from "../shared/ipc/messages";

type SkillMetadata = {
  name: string;
  description: string;
};

type SkillStoreLike = {
  listMetadata(): Promise<SkillMetadata[]>;
};

interface DesktopShellLike {
  openPath(path: string): Promise<string>;
}

export interface DesktopMainContextOptions {
  ipcMain: DesktopIpcMain;
  shell: DesktopShellLike;
  siteAccountStore: SiteAccountStore;
  embeddedLoginService: EmbeddedLoginService;
  embeddedLoginLauncher: EmbeddedLoginLauncher;
  cookieImportService: CookieImportService;
  loginVerifier: LoginVerifier;
  extensionCaptureServer: ExtensionCaptureServer;
  runManager: RunManager;
  skillStore: SkillStoreLike;
  skillRootDir: string;
}

export interface DesktopMainContext {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createDesktopMainContext(options: DesktopMainContextOptions): DesktopMainContext {
  const runEventForwarder = new RunEventForwarder(options.runManager);
  const accountsHandlers = createAccountsIpcHandlers({
    siteAccountStore: options.siteAccountStore,
    embeddedLoginService: options.embeddedLoginService,
    embeddedLoginLauncher: options.embeddedLoginLauncher,
    cookieImportService: options.cookieImportService,
    loginVerifier: options.loginVerifier,
  });
  const runsHandlers = createRunsIpcHandlers(options.runManager, { forwarder: runEventForwarder });
  const skillsHandler = createSkillsListHandler(options.skillStore, options.skillRootDir);
  const artifactsHandler = createOpenRunArtifactsHandler(options.runManager, options.shell);

  let started = false;

  return {
    async start() {
      if (started) {
        return;
      }

      registerDesktopIpc({
        ipcMain: options.ipcMain,
        accountsHandlers,
        runsHandlers,
        artifactsHandler,
        skillsHandler,
      });
      await options.extensionCaptureServer.listen();
      started = true;
    },
    async stop() {
      if (!started) {
        return;
      }

      await options.runManager.stopAll();
      await options.extensionCaptureServer.stop();
      started = false;
    },
  };
}

function createSkillsListHandler(
  skillStore: SkillStoreLike,
  skillRootDir: string,
): (request: unknown) => Promise<ListSkillsResponse> {
  return async () => {
    const metadata = await skillStore.listMetadata();
    return {
      skills: await Promise.all(
        metadata.map(async (skill) => {
          const path = join(skillRootDir, skill.name, "SKILL.md");
          const fileStat = await stat(path);
          return {
            name: skill.name,
            description: skill.description,
            path,
            updatedAt: fileStat.mtime.toISOString(),
          };
        }),
      ),
    };
  };
}

function createOpenRunArtifactsHandler(
  runManager: Pick<RunManager, "getRun">,
  shell: DesktopShellLike,
): (request: { runId: string }) => Promise<OpenRunArtifactsResponse> {
  return async (request) => {
    const run = runManager.getRun(request.runId);
    if (!run) {
      throw new Error(`Unknown run: ${request.runId}`);
    }
    if (!run.artifactPath) {
      return { opened: false };
    }

    const result = await shell.openPath(run.artifactPath);
    if (result) {
      throw new Error(`Failed to open run artifacts at ${run.artifactPath}: ${result}`);
    }

    return { opened: true };
  };
}
