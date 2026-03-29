import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CredentialBundleStore } from "../accounts/credential-bundle-store";
import type { RuntimeProfileManager } from "../accounts/runtime-profile-manager";
import type { SiteAccountStore } from "../accounts/site-account-store";
import type { SiteRegistry } from "../accounts/site-registry";
import type { DesktopWorkflow } from "../../shared/runs";
import type { DesktopRuntimeService } from "./run-manager";
import { loadAgentRuntimeModule, resolveAgentRuntimeDistRoot } from "../agent-runtime-module-loader";

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
    let runtimeProfileLease: Awaited<ReturnType<RuntimeProfileManager["allocate"]>> | null = null;

    const releaseRuntimeProfile = async (): Promise<void> => {
      if (!runtimeProfileLease) {
        return;
      }

      const lease = runtimeProfileLease;
      runtimeProfileLease = null;
      await options.runtimeProfileManager.release(lease);
    };

    try {
      if (context.workflow !== "sop-compact" && context.siteAccountId) {
        const account = await options.siteAccountStore.getById(context.siteAccountId);
        if (!account) {
          throw new Error(`Unknown site account: ${context.siteAccountId}`);
        }

        options.siteRegistry.require(account.site);

        const credentialBundle = await options.credentialStore.getActiveForAccount(context.siteAccountId);
        if (!credentialBundle) {
          throw new Error(`No active credential bundle for ${context.siteAccountId}`);
        }

        runtimeProfileLease = await options.runtimeProfileManager.allocate({
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

      const runtime = await Promise.resolve(
        createRuntimeService(await loadConfig({ cwd: options.rootDir, env: runtimeEnv })),
      );

      const withCleanup = async <T>(operation: () => Promise<T>): Promise<T> => {
        try {
          return await operation();
        } finally {
          await releaseRuntimeProfile();
        }
      };

      return {
        async runObserve(request: { task: string }, hooks?: Parameters<DesktopRuntimeService["runObserve"]>[1]) {
          return withCleanup(() => runtime.runObserve(request, hooks));
        },
        async runCompact(
          request: { runId: string; semanticMode?: "off" | "auto" | "on" },
          hooks?: Parameters<DesktopRuntimeService["runCompact"]>[1],
        ) {
          return withCleanup(() => runtime.runCompact(request, hooks));
        },
        async runRefine(
          request: { task?: string; skillName?: string; resumeRunId?: string },
          hooks?: Parameters<DesktopRuntimeService["runRefine"]>[1],
        ) {
          return withCleanup(() => runtime.runRefine(request, hooks));
        },
        async requestInterrupt(signal: "SIGINT" | "SIGTERM") {
          return runtime.requestInterrupt(signal);
        },
        async stop() {
          try {
            await runtime.stop();
          } finally {
            await releaseRuntimeProfile();
          }
        },
      };
    } catch (error) {
      await releaseRuntimeProfile();
      throw error;
    }
  };
}

async function loadAgentRuntimeConfig(options: RuntimeConfigSourceOptions): Promise<unknown> {
  const distRoot = resolveAgentRuntimeDistRoot(dirname(fileURLToPath(import.meta.url)));
  const runtimeConfigBootstrap = await loadAgentRuntimeModule<{
    loadRuntimeConfig(options: RuntimeConfigSourceOptions): unknown;
  }>(distRoot, "application/shell/runtime-config-bootstrap.js");
  return runtimeConfigBootstrap.loadRuntimeConfig(options);
}

async function loadAgentRuntimeService(config: unknown): Promise<DesktopRuntimeService> {
  const distRoot = resolveAgentRuntimeDistRoot(dirname(fileURLToPath(import.meta.url)));
  const runtimeServiceModule = await loadAgentRuntimeModule<{
    RuntimeService: new (config: unknown) => DesktopRuntimeService;
  }>(distRoot, "application/shell/runtime-service.js");
  return new runtimeServiceModule.RuntimeService(config);
}
