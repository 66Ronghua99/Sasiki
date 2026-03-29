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
import type { DesktopIpcMain } from "./ipc-main-port";

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

export function registerAccountsIpc(input: {
  ipcMain: DesktopIpcMain;
  handlers: AccountsIpcHandlers;
}): void {
  input.ipcMain.removeHandler(desktopChannels.accounts.list);
  input.ipcMain.handle(desktopChannels.accounts.list, async (_event, request) =>
    input.handlers.list((request ?? ({} as ListSiteAccountsRequest)) as ListSiteAccountsRequest),
  );
  input.ipcMain.removeHandler(desktopChannels.accounts.upsert);
  input.ipcMain.handle(desktopChannels.accounts.upsert, async (_event, request) =>
    input.handlers.upsert(request as UpsertSiteAccountRequest),
  );
  input.ipcMain.removeHandler(desktopChannels.accounts.launchEmbeddedLogin);
  input.ipcMain.handle(desktopChannels.accounts.launchEmbeddedLogin, async (_event, request) =>
    input.handlers.launchEmbeddedLogin(request as LaunchEmbeddedLoginRequest),
  );
  input.ipcMain.removeHandler(desktopChannels.accounts.importCookieFile);
  input.ipcMain.handle(desktopChannels.accounts.importCookieFile, async (_event, request) =>
    input.handlers.importCookieFile(request as ImportCookieFileRequest),
  );
  input.ipcMain.removeHandler(desktopChannels.accounts.verifyCredential);
  input.ipcMain.handle(desktopChannels.accounts.verifyCredential, async (_event, request) =>
    input.handlers.verifyCredential(request as VerifyCredentialRequest),
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
