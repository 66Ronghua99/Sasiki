import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { createEmbeddedLoginLauncher } from "../../../main/accounts/embedded-login-launcher";
import { createEmbeddedLoginPartition } from "../../../main/accounts/embedded-login-launcher";
import type { SiteAccountStore } from "../../../main/accounts/site-account-store";
import { SiteRegistry } from "../../../main/accounts/site-registry";

describe("embedded login launcher", () => {
  test("derives distinct partitions for distinct raw site account ids", () => {
    assert.notEqual(createEmbeddedLoginPartition("acct@1"), createEmbeddedLoginPartition("acct#1"));
    assert.notEqual(createEmbeddedLoginPartition("acct@1"), createEmbeddedLoginPartition("acct@1"));
  });

  test("uses a fresh partition for repeated launches of the same site account", async () => {
    const siteAccountStore = {
      async getById(siteAccountId: string) {
        return {
          id: siteAccountId,
          site: "tiktok-shop",
          label: siteAccountId === "acct-1" ? "Account A" : "Account B",
        };
      },
    } as unknown as SiteAccountStore;

    const createdOptions: Array<{ webPreferences: { partition?: string } }> = [];
    let latestWindow:
      | {
          show(): void;
          loadURL(url: string): Promise<void>;
          once(event: "closed", listener: () => void): void;
          close(): void;
          closedRegistered: boolean;
          webContents: { session: { cookies: { get(filter: unknown): Promise<Array<{ name: string; value: string; domain: string }>> } } };
        }
      | undefined;

    const launcher = createEmbeddedLoginLauncher({
      siteAccountStore,
      siteRegistry: new SiteRegistry(),
      windowFactory: {
        create(options) {
          createdOptions.push(options);
          let closedListener: (() => void) | undefined;
          let closedRegistered = false;
          const window = {
            show() {
              // no-op
            },
            async loadURL() {
              // no-op
            },
            once(event: "closed", listener: () => void) {
              if (event === "closed") {
                closedRegistered = true;
                closedListener = listener;
              }
            },
            close() {
              closedListener?.();
            },
            webContents: {
              session: {
                cookies: {
                  async get() {
                    return [{ name: "sessionid", value: "cookie", domain: ".tiktok.com" }];
                  },
                },
              },
            },
            get closedRegistered() {
              return closedRegistered;
            },
          };
          latestWindow = window;
          return window;
        },
      },
    });

    const firstLaunch = launcher.launch({ siteAccountId: "acct-1" });
    await waitForWindow(() => latestWindow?.closedRegistered === true);
    latestWindow?.close();
    await firstLaunch;

    const secondLaunch = launcher.launch({ siteAccountId: "acct-1" });
    await waitForWindow(() => latestWindow?.closedRegistered === true);
    latestWindow?.close();
    await secondLaunch;

    assert.match(createdOptions[0]?.webPreferences.partition ?? "", /^persist:/);
    assert.match(createdOptions[1]?.webPreferences.partition ?? "", /^persist:/);
    assert.notEqual(createdOptions[0]?.webPreferences.partition, createdOptions[1]?.webPreferences.partition);
  });
});

async function waitForWindow<T>(getValue: () => T | undefined): Promise<T> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const value = getValue();
    if (value) {
      return value;
    }

    await new Promise((resolve) => setImmediate(resolve));
  }

  throw new Error("window was never created");
}
