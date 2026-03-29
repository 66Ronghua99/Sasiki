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
import type { CookieImportService } from "../accounts/cookie-import-service";
import type {
  EmbeddedLoginService,
  EmbeddedLoginCookiesSession,
} from "../accounts/embedded-login-service";
import type { LoginVerifier } from "../accounts/login-verifier";
import type { SiteAccountStore } from "../accounts/site-account-store";

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

export interface EmbeddedLoginLauncher {
  launch(input: { siteAccountId: string }): Promise<EmbeddedLoginCookiesSession>;
}

export interface CreateAccountsIpcHandlersOptions {
  siteAccountStore: SiteAccountStore;
  embeddedLoginService: EmbeddedLoginService;
  embeddedLoginLauncher: EmbeddedLoginLauncher;
  cookieImportService: CookieImportService;
  loginVerifier: LoginVerifier;
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

export function createAccountsIpcHandlers(
  options: CreateAccountsIpcHandlersOptions,
): AccountsIpcHandlers {
  return {
    async list() {
      return { accounts: await options.siteAccountStore.list() };
    },
    async upsert(request) {
      return { account: await options.siteAccountStore.upsert(request.input) };
    },
    async launchEmbeddedLogin(request) {
      const session = await options.embeddedLoginLauncher.launch({
        siteAccountId: request.siteAccountId,
      });
      await options.embeddedLoginService.completeLogin(
        { siteAccountId: request.siteAccountId },
        session,
      );
      return {};
    },
    async importCookieFile(request) {
      return {
        result: await options.cookieImportService.importFromFile(request.input),
      };
    },
    async verifyCredential(request) {
      return {
        result: await options.loginVerifier.verify({
          siteAccountId: request.siteAccountId,
        }),
      };
    },
  };
}
