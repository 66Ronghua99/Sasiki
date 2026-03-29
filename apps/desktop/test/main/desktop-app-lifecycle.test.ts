import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { registerDesktopQuitHooks, type DesktopAppQuitHooksLike } from "../../main/desktop-app-lifecycle";

describe("desktop app lifecycle", () => {
  test("prevents quit until async stop completes", async () => {
    let stopCalls = 0;
    const listeners = new Map<string, Array<(event?: { preventDefault(): void }) => void>>();
    const app = {
      on(event: string, listener: (event?: { preventDefault(): void }) => void) {
        const current = listeners.get(event) ?? [];
        current.push(listener);
        listeners.set(event, current);
      },
      quitCalls: 0,
      quit() {
        this.quitCalls += 1;
      },
      emit(event: string, eventObject?: { preventDefault(): void }) {
        for (const listener of listeners.get(event) ?? []) {
          listener(eventObject);
        }
      },
    } as DesktopAppQuitHooksLike & {
      quitCalls: number;
      emit(event: string, eventObject?: { preventDefault(): void }): void;
    };

    let preventDefaultCalls = 0;
    let stopResolved = false;
    let resolveStop!: () => void;
    const stopPromise = new Promise<void>((resolve) => {
      resolveStop = () => {
        stopResolved = true;
        resolve();
      };
    });

    registerDesktopQuitHooks({
      app,
      platform: "darwin",
      stop: async () => {
        stopCalls += 1;
        await stopPromise;
      },
    });

    app.emit("before-quit", {
      preventDefault() {
        preventDefaultCalls += 1;
      },
    });

    assert.equal(preventDefaultCalls, 1);
    assert.equal(stopCalls, 1);
    assert.equal(app.quitCalls, 0);

    resolveStop();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(stopResolved, true);
    assert.equal(app.quitCalls, 1);
  });
});
