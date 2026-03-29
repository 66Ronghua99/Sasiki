import type { IpcMain } from "electron";
import { desktopChannels } from "../../shared/ipc/channels";
import type {
  InterruptRunRequest,
  InterruptRunResponse,
  ListRunsRequest,
  ListRunsResponse,
  StartCompactRunRequest,
  StartCompactRunResponse,
  StartObserveRunRequest,
  StartObserveRunResponse,
  StartRefineRunRequest,
  StartRefineRunResponse,
  SubscribeRunRequest,
  SubscribeRunResponse,
} from "../../shared/ipc/messages";

export interface RunsIpcHandlers {
  startObserve(request: StartObserveRunRequest): Promise<StartObserveRunResponse>;
  startCompact(request: StartCompactRunRequest): Promise<StartCompactRunResponse>;
  startRefine(request: StartRefineRunRequest): Promise<StartRefineRunResponse>;
  interruptRun(request: InterruptRunRequest): Promise<InterruptRunResponse>;
  listRuns(request: ListRunsRequest): Promise<ListRunsResponse>;
  subscribe(request: SubscribeRunRequest): Promise<SubscribeRunResponse>;
}

function replaceIpcHandler<TRequest, TResponse>(
  ipcMain: IpcMain,
  channel: string,
  handler: (request: TRequest) => Promise<TResponse>,
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (_event, request: TRequest | undefined) =>
    handler((request ?? ({} as TRequest)) as TRequest),
  );
}

export function registerRunsIpc(input: {
  ipcMain: IpcMain;
  handlers: RunsIpcHandlers;
}): void {
  replaceIpcHandler(
    input.ipcMain,
    desktopChannels.runs.startObserve,
    (request: StartObserveRunRequest) => input.handlers.startObserve(request),
  );
  replaceIpcHandler(
    input.ipcMain,
    desktopChannels.runs.startCompact,
    (request: StartCompactRunRequest) => input.handlers.startCompact(request),
  );
  replaceIpcHandler(
    input.ipcMain,
    desktopChannels.runs.startRefine,
    (request: StartRefineRunRequest) => input.handlers.startRefine(request),
  );
  replaceIpcHandler(
    input.ipcMain,
    desktopChannels.runs.interruptRun,
    (request: InterruptRunRequest) => input.handlers.interruptRun(request),
  );
  replaceIpcHandler(
    input.ipcMain,
    desktopChannels.runs.listRuns,
    (request: ListRunsRequest = {}) => input.handlers.listRuns(request),
  );
  replaceIpcHandler(
    input.ipcMain,
    desktopChannels.runs.subscribe,
    (request: SubscribeRunRequest) => input.handlers.subscribe(request),
  );
}
