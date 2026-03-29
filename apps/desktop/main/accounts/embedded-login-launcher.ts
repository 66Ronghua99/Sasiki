import { randomUUID } from "node:crypto";
import type { CredentialCookieRecord } from "./credential-bundle-store";
import type { EmbeddedLoginLauncher } from "../ipc/register-accounts-ipc";
import type { SiteAccountStore } from "./site-account-store";
import type { SiteRegistry } from "./site-registry";

export interface EmbeddedLoginWindowLike {
  show(): void;
  loadURL(url: string): Promise<void>;
  once(event: "closed", listener: () => void): void;
  webContents: {
    session: {
      cookies: {
        get(filter: unknown): Promise<CredentialCookieRecord[]>;
      };
    };
  };
}

export interface EmbeddedLoginWindowOptions {
  width: number;
  height: number;
  show: boolean;
  autoHideMenuBar: boolean;
  webPreferences: {
    contextIsolation: boolean;
    nodeIntegration: boolean;
    partition?: string;
  };
}

export interface EmbeddedLoginWindowFactory {
  create(options: EmbeddedLoginWindowOptions): EmbeddedLoginWindowLike;
}

export interface CreateEmbeddedLoginLauncherOptions {
  siteAccountStore: SiteAccountStore;
  siteRegistry: SiteRegistry;
  windowFactory: EmbeddedLoginWindowFactory;
}

export function createEmbeddedLoginLauncher(
  options: CreateEmbeddedLoginLauncherOptions,
): EmbeddedLoginLauncher {
  return {
    async launch(input) {
      const account = await options.siteAccountStore.getById(input.siteAccountId);
      if (!account) {
        throw new Error(`Unknown site account: ${input.siteAccountId}`);
      }

      const site = options.siteRegistry.require(account.site);
      const window = options.windowFactory.create({
        width: 1280,
        height: 900,
        show: true,
        autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: createEmbeddedLoginPartition(input.siteAccountId),
      },
    });

      window.show();
      void window.loadURL(site.loginUrl).catch(() => undefined);

      await new Promise<void>((resolve) => {
        window.once("closed", resolve);
      });

      const cookies = await window.webContents.session.cookies.get({});
      if (cookies.length === 0) {
        throw new Error(`No cookies captured for ${site.loginUrl}`);
      }

      return {
        cookies: {
          async get() {
            return cookies.map((cookie) => ({ ...cookie }));
          },
        },
      };
    },
  };
}

export function createEmbeddedLoginPartition(siteAccountId: string): string {
  const encoded = Buffer.from(siteAccountId, "utf8").toString("base64url");
  return `persist:sasiki-embedded-login-${encoded}-${randomUUID()}`;
}
