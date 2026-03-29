import type { IpcMain } from "electron";
import { desktopChannels } from "../../shared/ipc/channels";
import type {
  ImportCookieFileRequest,
  ImportCookieFileResponse,
  LaunchEmbeddedLoginRequest,
  LaunchEmbeddedLoginResponse,
  ListSiteAccountsRequest,
  ListSiteAccountsResponse,
  UpsertSiteAccountRequest,
  UpsertSiteAccountResponse,
  VerifyCredentialRequest,
  VerifyCredentialResponse,
} from "../../shared/ipc/messages";

export interface AccountsIpcHandlers {
  list(request: ListSiteAccountsRequest): Promise<ListSiteAccountsResponse>;
  upsert(request: UpsertSiteAccountRequest): Promise<UpsertSiteAccountResponse>;
  launchEmbeddedLogin(
    request: LaunchEmbeddedLoginRequest,
  ): Promise<LaunchEmbeddedLoginResponse>;
  importCookieFile(
    request: ImportCookieFileRequest,
  ): Promise<ImportCookieFileResponse>;
  verifyCredential(
    request: VerifyCredentialRequest,
  ): Promise<VerifyCredentialResponse>;
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

export function registerAccountsIpc(input: {
  ipcMain: IpcMain;
  handlers: AccountsIpcHandlers;
}): void {
  replaceIpcHandler(
    input.ipcMain,
    desktopChannels.accounts.list,
    (request: ListSiteAccountsRequest = {}) => input.handlers.list(request),
  );
  replaceIpcHandler(
    input.ipcMain,
    desktopChannels.accounts.upsert,
    (request: UpsertSiteAccountRequest) => input.handlers.upsert(request),
  );
  replaceIpcHandler(
    input.ipcMain,
    desktopChannels.accounts.launchEmbeddedLogin,
    (request: LaunchEmbeddedLoginRequest) => input.handlers.launchEmbeddedLogin(request),
  );
  replaceIpcHandler(
    input.ipcMain,
    desktopChannels.accounts.importCookieFile,
    (request: ImportCookieFileRequest) => input.handlers.importCookieFile(request),
  );
  replaceIpcHandler(
    input.ipcMain,
    desktopChannels.accounts.verifyCredential,
    (request: VerifyCredentialRequest) => input.handlers.verifyCredential(request),
  );
}
