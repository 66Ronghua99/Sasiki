import type { App, IpcMain } from "electron";
import { registerAccountsIpc, type AccountsIpcHandlers } from "./ipc/register-accounts-ipc";
import { registerRunsIpc, type RunsIpcHandlers } from "./ipc/register-runs-ipc";
import { desktopChannels } from "../shared/ipc/channels";
import type {
  ListSkillsRequest,
  ListSkillsResponse,
  OpenRunArtifactsRequest,
  OpenRunArtifactsResponse,
} from "../shared/ipc/messages";
import type { SiteAccountSummary } from "../shared/site-accounts";

export interface DesktopIpcRegistrationOptions {
  ipcMain: IpcMain;
  app: App;
  accountsHandlers?: AccountsIpcHandlers;
  runsHandlers?: RunsIpcHandlers;
  artifactsHandler?: (
    request: OpenRunArtifactsRequest,
  ) => Promise<OpenRunArtifactsResponse>;
  skillsHandler?: (request: ListSkillsRequest) => Promise<ListSkillsResponse>;
}

const placeholderTimestamp = new Date(0).toISOString();

function createPlaceholderAccountSummary(input: {
  id: string;
  site: string;
  label: string;
}): SiteAccountSummary {
  return {
    id: input.id,
    site: input.site,
    label: input.label,
    activeCredentialId: null,
    activeCredentialSource: null,
    credentialUpdatedAt: null,
    verificationStatus: "unknown",
    lastVerifiedAt: null,
    defaultRuntimeProfileId: null,
  };
}

function createPlaceholderAccountsHandlers(): AccountsIpcHandlers {
  return {
    async list() {
      return { accounts: [] };
    },
    async upsert(request) {
      const account = createPlaceholderAccountSummary({
        id: request.input.id ?? "placeholder-account",
        site: request.input.site,
        label: request.input.label,
      });
      return { account };
    },
    async launchEmbeddedLogin() {
      return {};
    },
    async importCookieFile(request) {
      return {
        result: {
          siteAccountId: request.input.siteAccountId,
          credentialBundleId: "placeholder-credential",
          credentialSource: "file-import",
          capturedAt: placeholderTimestamp,
          provenance: "placeholder",
        },
      };
    },
    async verifyCredential(request) {
      return {
        result: {
          siteAccountId: request.siteAccountId,
          status: "unknown",
          checkedAt: placeholderTimestamp,
          message: "Not implemented in Lane A",
        },
      };
    },
  };
}

function createPlaceholderRunsHandlers(): RunsIpcHandlers {
  return {
    async startObserve() {
      return { runId: "placeholder-observe-run" };
    },
    async startCompact() {
      return { runId: "placeholder-compact-run" };
    },
    async startRefine() {
      return { runId: "placeholder-refine-run" };
    },
    async interruptRun() {
      return { interrupted: false };
    },
    async listRuns() {
      return { runs: [] };
    },
    async subscribe() {
      return {
        subscribed: true,
        eventChannel: desktopChannels.runs.events,
      };
    },
  };
}

async function defaultArtifactsHandler(): Promise<OpenRunArtifactsResponse> {
  return { opened: false };
}

async function defaultSkillsHandler(): Promise<ListSkillsResponse> {
  return { skills: [] };
}

function replaceIpcHandler<TRequest, TResponse>(
  ipcMain: IpcMain,
  channel: string,
  handler: (request: TRequest) => Promise<TResponse>,
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (_event, request: TRequest) => handler(request));
}

export function registerDesktopIpc(options: DesktopIpcRegistrationOptions): void {
  registerAccountsIpc({
    ipcMain: options.ipcMain,
    handlers: options.accountsHandlers ?? createPlaceholderAccountsHandlers(),
  });

  registerRunsIpc({
    ipcMain: options.ipcMain,
    handlers: options.runsHandlers ?? createPlaceholderRunsHandlers(),
  });

  replaceIpcHandler(
    options.ipcMain,
    desktopChannels.artifacts.openRunArtifacts,
    (request) => (options.artifactsHandler ?? defaultArtifactsHandler)(request),
  );
  replaceIpcHandler(options.ipcMain, desktopChannels.skills.list, (request = {}) =>
    (options.skillsHandler ?? defaultSkillsHandler)(request),
  );
}
