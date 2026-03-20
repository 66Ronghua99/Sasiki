import assert from "node:assert/strict";
import test from "node:test";

import { shouldClosePageDuringReset } from "../../src/infrastructure/browser/cdp-browser-launcher.js";

test("browser reset skips the fresh blank page and Chrome internal popup pages", () => {
  assert.equal(shouldClosePageDuringReset("about:blank", "about:blank"), false);
  assert.equal(shouldClosePageDuringReset("chrome://omnibox-popup.top-chrome/", "about:blank"), false);
  assert.equal(shouldClosePageDuringReset("chrome://newtab/", "about:blank"), false);
  assert.equal(shouldClosePageDuringReset("https://creator.xiaohongshu.com/publish", "about:blank"), true);
  assert.equal(shouldClosePageDuringReset("about:blank#stale", "about:blank"), true);
});
