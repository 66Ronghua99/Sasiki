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
  ipcMain.handle(channel, async (_event, request: TRequest) => handler(request));
}

export function registerRunsIpc(input: {
  ipcMain: IpcMain;
  handlers: RunsIpcHandlers;
}): void {
  replaceIpcHandler(input.ipcMain, desktopChannels.runs.startObserve, (request) =>
    input.handlers.startObserve(request),
  );
  replaceIpcHandler(input.ipcMain, desktopChannels.runs.startCompact, (request) =>
    input.handlers.startCompact(request),
  );
  replaceIpcHandler(input.ipcMain, desktopChannels.runs.startRefine, (request) =>
    input.handlers.startRefine(request),
  );
  replaceIpcHandler(input.ipcMain, desktopChannels.runs.interruptRun, (request) =>
    input.handlers.interruptRun(request),
  );
  replaceIpcHandler(input.ipcMain, desktopChannels.runs.listRuns, (request = {}) =>
    input.handlers.listRuns(request),
  );
  replaceIpcHandler(input.ipcMain, desktopChannels.runs.subscribe, (request) =>
    input.handlers.subscribe(request),
  );
}
