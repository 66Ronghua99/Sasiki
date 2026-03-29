import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeConfig } from "../../../agent-runtime/src/application/config/runtime-config";
import { loadRuntimeConfig } from "../../../agent-runtime/src/application/shell/runtime-config-bootstrap";
import { RuntimeService } from "../../../agent-runtime/src/application/shell/runtime-service";
import type { CredentialBundleStore } from "../accounts/credential-bundle-store";
import type { RuntimeProfileManager } from "../accounts/runtime-profile-manager";
import type { SiteAccountStore } from "../accounts/site-account-store";
import type { SiteRegistry } from "../accounts/site-registry";
import type { DesktopWorkflow } from "../../shared/runs";
import type { DesktopRuntimeService } from "./run-manager";

export interface DesktopRunRuntimeContext {
  workflow: DesktopWorkflow;
  siteAccountId?: string;
  sourceRunId?: string | null;
  taskSummary?: string | null;
}

export interface DesktopRuntimeFactoryOptions {
  rootDir: string;
  siteAccountStore: SiteAccountStore;
  credentialStore: CredentialBundleStore;
  runtimeProfileManager: RuntimeProfileManager;
  siteRegistry: SiteRegistry;
  loadRuntimeConfig?: typeof loadRuntimeConfig;
  createRuntimeService?: (config: RuntimeConfig) => DesktopRuntimeService;
  processEnv?: NodeJS.ProcessEnv;
}

export type DesktopRuntimeServiceFactory = (
  context: DesktopRunRuntimeContext,
) => DesktopRuntimeService | Promise<DesktopRuntimeService>;

export function createDesktopRuntimeFactory(
  options: DesktopRuntimeFactoryOptions,
): DesktopRuntimeServiceFactory {
  const loadConfig = options.loadRuntimeConfig ?? loadRuntimeConfig;
  const createRuntimeService =
    options.createRuntimeService ?? ((config: RuntimeConfig) => new RuntimeService(config));
  const processEnv = options.processEnv ?? process.env;

  return async (context: DesktopRunRuntimeContext) => {
    const runtimeEnv = { ...processEnv };

    if (context.siteAccountId) {
      const account = await options.siteAccountStore.getById(context.siteAccountId);
      if (!account) {
        throw new Error(`Unknown site account: ${context.siteAccountId}`);
      }

      options.siteRegistry.require(account.site);

      const credentialBundle = await options.credentialStore.getActiveForAccount(context.siteAccountId);
      if (!credentialBundle) {
        throw new Error(`No active credential bundle for ${context.siteAccountId}`);
      }

      const runtimeProfileLease = await options.runtimeProfileManager.allocate({
        siteAccountId: context.siteAccountId,
        allowParallel: true,
      });
      const cookiesDir = join(runtimeProfileLease.profilePath, "cookies");

      await mkdir(cookiesDir, { recursive: true });
      await writeFile(
        join(cookiesDir, "credential-bundle.json"),
        `${JSON.stringify({ cookies: credentialBundle.cookies }, null, 2)}\n`,
        "utf8",
      );

      runtimeEnv.CDP_USER_DATA_DIR = runtimeProfileLease.profilePath;
      runtimeEnv.COOKIES_DIR = cookiesDir;
    }

    return Promise.resolve(createRuntimeService(loadConfig({ cwd: options.rootDir, env: runtimeEnv })));
  };
}
