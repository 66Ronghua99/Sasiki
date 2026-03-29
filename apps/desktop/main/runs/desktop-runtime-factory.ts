import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
  loadRuntimeConfig?: (options: RuntimeConfigSourceOptions) => Promise<unknown>;
  createRuntimeService?: (config: unknown) => DesktopRuntimeService;
  processEnv?: NodeJS.ProcessEnv;
}

export interface RuntimeConfigSourceOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export type DesktopRuntimeServiceFactory = (
  context: DesktopRunRuntimeContext,
) => DesktopRuntimeService | Promise<DesktopRuntimeService>;

export function createDesktopRuntimeFactory(
  options: DesktopRuntimeFactoryOptions,
): DesktopRuntimeServiceFactory {
  const loadConfig = options.loadRuntimeConfig ?? loadAgentRuntimeConfig;
  const createRuntimeService = options.createRuntimeService ?? loadAgentRuntimeService;
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

    return Promise.resolve(
      createRuntimeService(await loadConfig({ cwd: options.rootDir, env: runtimeEnv })),
    );
  };
}

async function loadAgentRuntimeConfig(options: RuntimeConfigSourceOptions): Promise<unknown> {
  const runtimeConfigBootstrap = await importAgentRuntimeModule<{
    loadRuntimeConfig(options: RuntimeConfigSourceOptions): unknown;
  }>("application/shell/runtime-config-bootstrap.js");
  return runtimeConfigBootstrap.loadRuntimeConfig(options);
}

async function loadAgentRuntimeService(config: unknown): Promise<DesktopRuntimeService> {
  const runtimeServiceModule = await importAgentRuntimeModule<{
    RuntimeService: new (config: unknown) => DesktopRuntimeService;
  }>("application/shell/runtime-service.js");
  return new runtimeServiceModule.RuntimeService(config);
}

async function importAgentRuntimeModule<T>(modulePath: string): Promise<T> {
  const distRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../agent-runtime/dist",
  );
  const moduleUrl = pathToFileURL(join(distRoot, modulePath)).href;
  const dynamicImport = new Function("specifier", "return import(specifier);") as (
    specifier: string,
  ) => Promise<T>;
  return dynamicImport(moduleUrl);
}
