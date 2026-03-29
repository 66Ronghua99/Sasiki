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
  SubscribeAllRunRequest,
  SubscribeAllRunResponse,
  SubscribeRunRequest,
  SubscribeRunResponse,
  UnsubscribeAllRunRequest,
  UnsubscribeAllRunResponse,
} from "../../shared/ipc/messages";
import { createRunsIpcHandlers } from "../runs/run-manager";
import type { RunEventSubscriber } from "../runs/run-event-forwarder";
import type { DesktopIpcInvokeEvent, DesktopIpcMain } from "./ipc-main-port";

export interface RunsIpcHandlers {
  startObserve(request: StartObserveRunRequest): Promise<StartObserveRunResponse>;
  startCompact(request: StartCompactRunRequest): Promise<StartCompactRunResponse>;
  startRefine(request: StartRefineRunRequest): Promise<StartRefineRunResponse>;
  interruptRun(request: InterruptRunRequest): Promise<InterruptRunResponse>;
  listRuns(request: ListRunsRequest): Promise<ListRunsResponse>;
  subscribe(
    request: SubscribeRunRequest,
    context: { sender: RunEventSubscriber },
  ): Promise<SubscribeRunResponse>;
  subscribeAll(
    request: SubscribeAllRunRequest,
    context: { sender: RunEventSubscriber },
  ): Promise<SubscribeAllRunResponse>;
  unsubscribeAll(
    request: UnsubscribeAllRunRequest,
    context: { sender: RunEventSubscriber },
  ): Promise<UnsubscribeAllRunResponse>;
}

function replaceIpcHandler<TRequest, TResponse>(
  ipcMain: DesktopIpcMain,
  channel: string,
  handler: (request: TRequest, event: DesktopIpcInvokeEvent) => Promise<TResponse>,
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (_event, request: unknown) =>
    handler((request ?? ({} as TRequest)) as TRequest, _event),
  );
}

export function registerRunsIpc(input: {
  ipcMain: DesktopIpcMain;
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
    (request: SubscribeRunRequest, event) =>
      input.handlers.subscribe(request, { sender: event.sender as unknown as RunEventSubscriber }),
  );
  replaceIpcHandler(
    input.ipcMain,
    desktopChannels.runs.subscribeAll,
    (request: SubscribeAllRunRequest = {}, event) =>
      input.handlers.subscribeAll(request, { sender: event.sender as unknown as RunEventSubscriber }),
  );
  replaceIpcHandler(
    input.ipcMain,
    desktopChannels.runs.unsubscribeAll,
    (request: UnsubscribeAllRunRequest = {}, event) =>
      input.handlers.unsubscribeAll(request, { sender: event.sender as unknown as RunEventSubscriber }),
  );
}

export { createRunsIpcHandlers };
