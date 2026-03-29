import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { createDesktopApiShape, desktopRunEventKinds } from "../../shared/ipc/contracts";
import { desktopChannels } from "../../shared/ipc/channels";
import { createDesktopPreloadApi } from "../../preload/desktop-api";

describe("desktop foundation contracts", () => {
  test("desktop foundation freezes the full api and transport contract surface", () => {
    const api = createDesktopApiShape();
    const liveApi = createDesktopPreloadApi({
      async invoke(channel: string) {
        if (channel === desktopChannels.accounts.list) {
          return { accounts: [] };
        }
        if (channel === desktopChannels.runs.listRuns) {
          return { runs: [] };
        }
        if (channel === desktopChannels.skills.list) {
          return { skills: [] };
        }
        if (channel === desktopChannels.artifacts.openRunArtifacts) {
          return { opened: false };
        }
        return {};
      },
      on() {
        // no-op
      },
      removeListener() {
        // no-op
      },
    });

    assert.deepEqual(Object.keys(api.accounts), [
      "list",
      "upsert",
      "launchEmbeddedLogin",
      "importCookieFile",
      "verifyCredential",
    ]);

    assert.deepEqual(Object.keys(api.runs), [
      "startObserve",
      "startCompact",
      "startRefine",
      "interruptRun",
      "listRuns",
      "subscribe",
    ]);

    assert.deepEqual(Object.keys(api.artifacts), ["openRunArtifacts"]);
    assert.deepEqual(Object.keys(api.skills), ["list"]);
    assert.deepEqual(Object.keys(liveApi.accounts), Object.keys(api.accounts));
    assert.deepEqual(Object.keys(liveApi.runs), Object.keys(api.runs));
    assert.deepEqual(Object.keys(liveApi.artifacts), Object.keys(api.artifacts));
    assert.deepEqual(Object.keys(liveApi.skills), Object.keys(api.skills));

    assert.equal(desktopChannels.runs.startObserve, "runs:startObserve");
    assert.equal(desktopChannels.accounts.verifyCredential, "accounts:verifyCredential");
    assert.equal(desktopChannels.artifacts.openRunArtifacts, "artifacts:openRunArtifacts");
    assert.equal(desktopChannels.skills.list, "skills:list");
    assert.equal(desktopRunEventKinds.includes("run.finished"), true);
  });
});
