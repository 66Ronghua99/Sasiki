import assert from "node:assert/strict";
import test from "node:test";

import {
  CdpBrowserLauncher,
  closePageDuringReset,
  shouldClosePageDuringReset,
} from "../../src/infrastructure/browser/cdp-browser-launcher.js";

test("browser reset skips the fresh blank page and Chrome internal popup pages", () => {
  assert.equal(shouldClosePageDuringReset("chrome://newtab/"), false);
  assert.equal(shouldClosePageDuringReset("https://creator.xiaohongshu.com/publish"), true);
  assert.equal(shouldClosePageDuringReset("about:blank#stale"), true);
});

test("browser reset closes stale about blank pages so the visible page stays aligned", () => {
  assert.equal(shouldClosePageDuringReset("about:blank"), true);
});

test("browser reset closes omnibox popup targets so navigation stays on a visible browser tab", () => {
  assert.equal(shouldClosePageDuringReset("chrome://omnibox-popup.top-chrome/"), false);
  assert.equal(shouldClosePageDuringReset("chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html"), false);
});

test("browser start still resets pages when the CDP endpoint is already ready", async () => {
  const launcher = new CdpBrowserLauncher(
    {
      cdpEndpoint: "http://127.0.0.1:9222",
      launchCdp: true,
      userDataDir: "~/.sasiki/chrome_profile",
      resetPagesOnLaunch: true,
      headless: false,
      startupTimeoutMs: 30_000,
      injectCookies: true,
      cookiesDir: "~/.sasiki/cookies",
      preferSystemBrowser: true,
    },
    {
      info() {},
      warn() {},
      error() {},
    }
  );

  let resetCalls = 0;
  (launcher as any).isEndpointReady = async () => true;
  (launcher as any).injectCookiesIfNeeded = async () => ({ filesLoaded: 2, cookiesInjected: 36 });
  (launcher as any).resetPagesOnLaunchIfNeeded = async () => {
    resetCalls += 1;
  };

  const result = await launcher.start();

  assert.equal(result.launched, false);
  assert.equal(result.endpoint, "http://127.0.0.1:9222");
  assert.equal(result.cookieFilesLoaded, 2);
  assert.equal(result.cookiesInjected, 36);
  assert.equal(resetCalls, 1);
});

test("browser reset does not hang forever when closing a stale page stalls", async () => {
  let closeCalls = 0;
  const result = await closePageDuringReset(
    {
      url: () => "chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html",
      close: async () => {
        closeCalls += 1;
        await new Promise(() => {});
      },
    },
    20
  );

  assert.equal(closeCalls, 1);
  assert.equal(result, "timed_out");
});
