import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { registerDesktopQuitHooks } from "../../main/desktop-app-lifecycle";

describe("desktop app lifecycle", () => {
  test("stops the desktop main context when before-quit fires", async () => {
    let stopCalls = 0;
    const listeners = new Map<string, Array<() => void>>();
    const app = {
      on(event: string, listener: () => void) {
        const current = listeners.get(event) ?? [];
        current.push(listener);
        listeners.set(event, current);
      },
      quitCalls: 0,
      quit() {
        this.quitCalls += 1;
      },
      emit(event: string) {
        for (const listener of listeners.get(event) ?? []) {
          listener();
        }
      },
    };

    registerDesktopQuitHooks({
      app,
      platform: "darwin",
      stop: async () => {
        stopCalls += 1;
      },
    });

    app.emit("before-quit");
    app.emit("will-quit");

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(stopCalls, 1);
    assert.equal(app.quitCalls, 0);
  });
});
