import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { createDesktopMainContext } from "../../main/desktop-main-context";

describe("desktop main context", () => {
  test("stops active runtimes before shutting down the capture server", async () => {
    let stopAllCalls = 0;
    let captureServerStops = 0;

    const options = {
      ipcMain: {
        handle() {
          // no-op
        },
        removeHandler() {
          // no-op
        },
      },
      shell: {
        async openPath() {
          return "";
        },
      },
      siteAccountStore: {
        async list() {
          return [];
        },
        async upsert() {
          throw new Error("not used");
        },
        async getById() {
          return undefined;
        },
        async setDefaultRuntimeProfileId() {
          // no-op
        },
        rootDir: "/tmp",
      },
      embeddedLoginService: {
        async completeLogin() {
          throw new Error("not used");
        },
      },
      embeddedLoginLauncher: {
        async launch() {
          throw new Error("not used");
        },
      },
      cookieImportService: {
        async importFromFile() {
          throw new Error("not used");
        },
      },
      loginVerifier: {
        async verify() {
          throw new Error("not used");
        },
      },
      extensionCaptureServer: {
        async listen() {
          // no-op
        },
        async stop() {
          captureServerStops += 1;
        },
      },
      runManager: {
        async stopAll() {
          stopAllCalls += 1;
        },
        getRun() {
          return undefined;
        },
      } as never,
      skillStore: {
        async listMetadata() {
          return [];
        },
      },
      skillRootDir: "/tmp/skills",
    } as unknown as Parameters<typeof createDesktopMainContext>[0];

    const context = createDesktopMainContext(options);

    await context.start();
    await context.stop();

    assert.equal(stopAllCalls, 1);
    assert.equal(captureServerStops, 1);
  });
});
