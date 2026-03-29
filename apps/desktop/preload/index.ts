import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { desktopChannels } from "../shared/ipc/channels";
import type { SasikiDesktopApi } from "../shared/ipc/contracts";
import type {
  DesktopRunEventMessage,
  ImportCookieFileRequest,
  ImportCookieFileResponse,
  InterruptRunRequest,
  InterruptRunResponse,
  ListRunsRequest,
  ListRunsResponse,
  ListSiteAccountsRequest,
  ListSiteAccountsResponse,
  ListSkillsRequest,
  ListSkillsResponse,
  OpenRunArtifactsRequest,
  OpenRunArtifactsResponse,
  StartCompactRunRequest,
  StartCompactRunResponse,
  StartObserveRunRequest,
  StartObserveRunResponse,
  StartRefineRunRequest,
  StartRefineRunResponse,
  SubscribeRunRequest,
  UpsertSiteAccountRequest,
  UpsertSiteAccountResponse,
  VerifyCredentialRequest,
  VerifyCredentialResponse,
} from "../shared/ipc/messages";

async function invoke<TRequest, TResponse>(
  channel: string,
  request: TRequest,
): Promise<TResponse> {
  return ipcRenderer.invoke(channel, request) as Promise<TResponse>;
}

const desktopApi: SasikiDesktopApi = {
  accounts: {
    async list() {
      const response = await invoke<ListSiteAccountsRequest, ListSiteAccountsResponse>(
        desktopChannels.accounts.list,
        {},
      );
      return response.accounts;
    },
    async upsert(input) {
      const response = await invoke<UpsertSiteAccountRequest, UpsertSiteAccountResponse>(
        desktopChannels.accounts.upsert,
        { input },
      );
      return response.account;
    },
    async launchEmbeddedLogin(input) {
      await invoke<{ siteAccountId: string }, void>(
        desktopChannels.accounts.launchEmbeddedLogin,
        input,
      );
    },
    async importCookieFile(input) {
      const response = await invoke<ImportCookieFileRequest, ImportCookieFileResponse>(
        desktopChannels.accounts.importCookieFile,
        { input },
      );
      return response.result;
    },
    async verifyCredential(input) {
      const response = await invoke<VerifyCredentialRequest, VerifyCredentialResponse>(
        desktopChannels.accounts.verifyCredential,
        input,
      );
      return response.result;
    },
  },
  runs: {
    async startObserve(input) {
      const response = await invoke<StartObserveRunRequest, StartObserveRunResponse>(
        desktopChannels.runs.startObserve,
        { input },
      );
      return { runId: response.runId };
    },
    async startCompact(input) {
      const response = await invoke<StartCompactRunRequest, StartCompactRunResponse>(
        desktopChannels.runs.startCompact,
        { input },
      );
      return { runId: response.runId };
    },
    async startRefine(input) {
      const response = await invoke<StartRefineRunRequest, StartRefineRunResponse>(
        desktopChannels.runs.startRefine,
        { input },
      );
      return { runId: response.runId };
    },
    async interruptRun(runId) {
      const response = await invoke<InterruptRunRequest, InterruptRunResponse>(
        desktopChannels.runs.interruptRun,
        { runId },
      );
      return { interrupted: response.interrupted };
    },
    async listRuns() {
      const response = await invoke<ListRunsRequest, ListRunsResponse>(
        desktopChannels.runs.listRuns,
        {},
      );
      return response.runs;
    },
    subscribe(runId, callback) {
      const listener = (_event: IpcRendererEvent, payload: DesktopRunEventMessage) => {
        if (payload.runId === runId) {
          callback(payload.event);
        }
      };

      ipcRenderer.on(desktopChannels.runs.events, listener);
      void invoke<SubscribeRunRequest, { subscribed: boolean }>(
        desktopChannels.runs.subscribe,
        { runId },
      );

      return () => {
        ipcRenderer.removeListener(desktopChannels.runs.events, listener);
      };
    },
  },
  artifacts: {
    async openRunArtifacts(runId) {
      await invoke<OpenRunArtifactsRequest, OpenRunArtifactsResponse>(
        desktopChannels.artifacts.openRunArtifacts,
        { runId },
      );
    },
  },
  skills: {
    async list() {
      const response = await invoke<ListSkillsRequest, ListSkillsResponse>(
        desktopChannels.skills.list,
        {},
      );
      return response.skills;
    },
  },
};

contextBridge.exposeInMainWorld("sasiki", desktopApi);

declare global {
  interface Window {
    sasiki: SasikiDesktopApi;
  }
}
