import type { SasikiDesktopApi } from "../shared/ipc/contracts";
import { desktopChannels } from "../shared/ipc/channels";
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
  SubscribeAllRunRequest,
  SubscribeAllRunResponse,
  SubscribeRunRequest,
  UnsubscribeAllRunRequest,
  UnsubscribeAllRunResponse,
  UpsertSiteAccountRequest,
  UpsertSiteAccountResponse,
  VerifyCredentialRequest,
  VerifyCredentialResponse,
} from "../shared/ipc/messages";

type DesktopRunEventCallback = (event: DesktopRunEventMessage["event"]) => void;

export interface DesktopPreloadIpcRenderer {
  invoke(channel: string, request: unknown): Promise<unknown>;
  on(
    channel: string,
    listener: (event: unknown, payload: DesktopRunEventMessage) => void,
  ): void;
  removeListener(
    channel: string,
    listener: (event: unknown, payload: DesktopRunEventMessage) => void,
  ): void;
}

export interface DesktopContextBridgeLike {
  exposeInMainWorld(name: string, api: unknown): void;
}

export type DesktopPreloadApi = SasikiDesktopApi & {
  runs: SasikiDesktopApi["runs"] & {
    subscribeAll(callback: DesktopRunEventCallback): () => void;
  };
};

async function invoke<TRequest, TResponse>(
  transport: DesktopPreloadIpcRenderer,
  channel: string,
  request: TRequest,
): Promise<TResponse> {
  return transport.invoke(channel, request) as Promise<TResponse>;
}

export function createDesktopPreloadApi(transport: DesktopPreloadIpcRenderer): DesktopPreloadApi {
  const api: DesktopPreloadApi = {
    accounts: {
      async list() {
        const response = await invoke<ListSiteAccountsRequest, ListSiteAccountsResponse>(
          transport,
          desktopChannels.accounts.list,
          {},
        );
        return response.accounts;
      },
      async upsert(input) {
        const response = await invoke<UpsertSiteAccountRequest, UpsertSiteAccountResponse>(
          transport,
          desktopChannels.accounts.upsert,
          { input },
        );
        return response.account;
      },
      async launchEmbeddedLogin(input) {
        await invoke<{ siteAccountId: string }, void>(
          transport,
          desktopChannels.accounts.launchEmbeddedLogin,
          input,
        );
      },
      async importCookieFile(input) {
        const response = await invoke<ImportCookieFileRequest, ImportCookieFileResponse>(
          transport,
          desktopChannels.accounts.importCookieFile,
          { input },
        );
        return response.result;
      },
      async verifyCredential(input) {
        const response = await invoke<VerifyCredentialRequest, VerifyCredentialResponse>(
          transport,
          desktopChannels.accounts.verifyCredential,
          input,
        );
        return response.result;
      },
    },
    runs: {
      async startObserve(input) {
        const response = await invoke<StartObserveRunRequest, StartObserveRunResponse>(
          transport,
          desktopChannels.runs.startObserve,
          { input },
        );
        return { runId: response.runId };
      },
      async startCompact(input) {
        const response = await invoke<StartCompactRunRequest, StartCompactRunResponse>(
          transport,
          desktopChannels.runs.startCompact,
          { input },
        );
        return { runId: response.runId };
      },
      async startRefine(input) {
        const response = await invoke<StartRefineRunRequest, StartRefineRunResponse>(
          transport,
          desktopChannels.runs.startRefine,
          { input },
        );
        return { runId: response.runId };
      },
      async interruptRun(runId) {
        const response = await invoke<InterruptRunRequest, InterruptRunResponse>(
          transport,
          desktopChannels.runs.interruptRun,
          { runId },
        );
        return { interrupted: response.interrupted };
      },
      async listRuns() {
        const response = await invoke<ListRunsRequest, ListRunsResponse>(
          transport,
          desktopChannels.runs.listRuns,
          {},
        );
        return response.runs;
      },
      subscribe(runId, callback) {
        const listener = (_event: unknown, payload: DesktopRunEventMessage) => {
          if (payload.runId === runId) {
            callback(payload.event);
          }
        };

        transport.on(desktopChannels.runs.events, listener);
        void invoke<SubscribeRunRequest, { subscribed: boolean }>(transport, desktopChannels.runs.subscribe, {
          runId,
        });

        return () => {
          transport.removeListener(desktopChannels.runs.events, listener);
        };
      },
      subscribeAll(callback) {
        const listener = (_event: unknown, payload: DesktopRunEventMessage) => {
          callback(payload.event);
        };

        transport.on(desktopChannels.runs.events, listener);
        void invoke<SubscribeAllRunRequest, SubscribeAllRunResponse>(
          transport,
          desktopChannels.runs.subscribeAll,
          {},
        );

        return () => {
          transport.removeListener(desktopChannels.runs.events, listener);
          void invoke<UnsubscribeAllRunRequest, UnsubscribeAllRunResponse>(
            transport,
            desktopChannels.runs.unsubscribeAll,
            {},
          );
        };
      },
    } as DesktopPreloadApi["runs"],
    artifacts: {
      async openRunArtifacts(runId) {
        await invoke<OpenRunArtifactsRequest, OpenRunArtifactsResponse>(
          transport,
          desktopChannels.artifacts.openRunArtifacts,
          { runId },
        );
      },
    },
    skills: {
      async list() {
        const response = await invoke<ListSkillsRequest, ListSkillsResponse>(
          transport,
          desktopChannels.skills.list,
          {},
        );
        return response.skills;
      },
    },
  };

  return api;
}

export function exposeDesktopPreloadApi(
  contextBridge: DesktopContextBridgeLike,
  api: DesktopPreloadApi,
): void {
  contextBridge.exposeInMainWorld("sasiki", api);
}
