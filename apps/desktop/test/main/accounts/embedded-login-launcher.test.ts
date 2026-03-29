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
    let latestWindow: ReturnType<typeof createWindowStub> | undefined;

    const launcher = createEmbeddedLoginLauncher({
      siteAccountStore,
      siteRegistry: new SiteRegistry(),
      windowFactory: {
        create(options) {
          createdOptions.push(options);
          latestWindow = createWindowStub();
          return latestWindow;
        },
      },
    });

    const firstLaunch = launcher.launch({ siteAccountId: "acct-1" });
    await waitForWindow(() => latestWindow);
    await waitForWindow(() => (latestWindow?.closedRegistered ? latestWindow : undefined));
    assert.equal(latestWindow?.closeRegistered, true);
    latestWindow?.close();
    await firstLaunch;

    const secondLaunch = launcher.launch({ siteAccountId: "acct-1" });
    await waitForWindow(() => latestWindow);
    await waitForWindow(() => (latestWindow?.closedRegistered ? latestWindow : undefined));
    assert.equal(latestWindow?.closeRegistered, true);
    latestWindow?.close();
    await secondLaunch;

    assert.doesNotMatch(createdOptions[0]?.webPreferences.partition ?? "", /^persist:/);
    assert.doesNotMatch(createdOptions[1]?.webPreferences.partition ?? "", /^persist:/);
    assert.notEqual(createdOptions[0]?.webPreferences.partition, createdOptions[1]?.webPreferences.partition);
  });

  test("captures cookies before the login window is destroyed", async () => {
    const siteAccountStore = {
      async getById(siteAccountId: string) {
        return {
          id: siteAccountId,
          site: "tiktok-shop",
          label: "Account A",
        };
      },
    } as unknown as SiteAccountStore;

    let latestWindow:
      | (ReturnType<typeof createWindowStub> & {
          close(): void;
          closeRegistered: boolean;
          closedRegistered: boolean;
        })
      | undefined;

    const launcher = createEmbeddedLoginLauncher({
      siteAccountStore,
      siteRegistry: new SiteRegistry(),
      windowFactory: {
        create() {
          latestWindow = createWindowStub();
          return latestWindow;
        },
      },
    });

    const launchPromise = launcher.launch({ siteAccountId: "acct-1" });
    await waitForWindow(() => latestWindow);
    await waitForWindow(() => (latestWindow?.closedRegistered ? latestWindow : undefined));
    assert.equal(latestWindow?.closeRegistered, true);
    latestWindow?.close();

    const result = await launchPromise;
    assert.deepEqual(await result.cookies.get({}), [
      { name: "sessionid", value: "cookie", domain: ".tiktok.com" },
    ]);
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

function createWindowStub() {
  let closeListener: (() => void) | undefined;
  let closedListener: (() => void) | undefined;
  let destroyed = false;
  let closeRegistered = false;
  let closedRegistered = false;

  return {
    show() {
      // no-op
    },
    async loadURL() {
      // no-op
    },
    once(event: "close" | "closed", listener: () => void) {
      if (event === "close") {
        closeRegistered = true;
        closeListener = listener;
        return;
      }
      if (event === "closed") {
        closedRegistered = true;
        closedListener = listener;
      }
    },
    close() {
      closeListener?.();
      destroyed = true;
      closedListener?.();
    },
    webContents: {
      session: {
        cookies: {
          async get() {
            assert.equal(destroyed, false);
            return [{ name: "sessionid", value: "cookie", domain: ".tiktok.com" }];
          },
        },
      },
    },
    get closeRegistered() {
      return closeRegistered;
    },
    get closedRegistered() {
      return closedRegistered;
    },
  };
}
