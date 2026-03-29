import assert from "node:assert/strict";
import { afterEach, describe, test } from "vitest";
import { createDesktopApiShape } from "../../shared/ipc/contracts";
import { createDesktopClient } from "../../renderer/src/lib/desktop-client";

describe("desktop client", () => {
  afterEach(() => {
    if ("window" in globalThis) {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  test("returns the explicit api when one is provided", () => {
    const api = createDesktopApiShape();

    assert.equal(createDesktopClient(api), api);
  });

  test("returns window sasiki when no explicit api is provided", () => {
    const api = createDesktopApiShape();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sasiki: api },
    });

    assert.equal(createDesktopClient(), api);
  });
});
