import { registerAccountsIpc, type AccountsIpcHandlers } from "./ipc/register-accounts-ipc";
import { registerRunsIpc, type RunsIpcHandlers } from "./ipc/register-runs-ipc";
import { desktopChannels } from "../shared/ipc/channels";
import type {
  ListSkillsRequest,
  ListSkillsResponse,
  OpenRunArtifactsRequest,
  OpenRunArtifactsResponse,
} from "../shared/ipc/messages";
import type { DesktopIpcMain } from "./ipc/ipc-main-port";

export interface DesktopIpcRegistrationOptions {
  ipcMain: DesktopIpcMain;
  accountsHandlers: AccountsIpcHandlers;
  runsHandlers: RunsIpcHandlers;
  artifactsHandler: (
    request: OpenRunArtifactsRequest,
  ) => Promise<OpenRunArtifactsResponse>;
  skillsHandler: (request: ListSkillsRequest) => Promise<ListSkillsResponse>;
}

function replaceIpcHandler<TRequest, TResponse>(
  ipcMain: DesktopIpcMain,
  channel: string,
  handler: (request: TRequest) => Promise<TResponse>,
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (_event, request: unknown) =>
    handler((request ?? ({} as TRequest)) as TRequest),
  );
}

export function registerDesktopIpc(options: DesktopIpcRegistrationOptions): void {
  registerAccountsIpc({
    ipcMain: options.ipcMain,
    handlers: options.accountsHandlers,
  });

  registerRunsIpc({
    ipcMain: options.ipcMain,
    handlers: options.runsHandlers,
  });

  replaceIpcHandler(
    options.ipcMain,
    desktopChannels.artifacts.openRunArtifacts,
    (request: OpenRunArtifactsRequest) => options.artifactsHandler(request),
  );
  replaceIpcHandler(
    options.ipcMain,
    desktopChannels.skills.list,
    (request: ListSkillsRequest = {}) => options.skillsHandler(request),
  );
}
