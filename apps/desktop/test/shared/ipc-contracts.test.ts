import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { createDesktopApiShape, desktopRunEventKinds } from "../../shared/ipc/contracts";
import { desktopChannels } from "../../shared/ipc/channels";

describe("desktop foundation contracts", () => {
  test("desktop foundation freezes the full api and transport contract surface", () => {
    const api = createDesktopApiShape();

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

    assert.equal(desktopChannels.runs.startObserve, "runs:startObserve");
    assert.equal(desktopChannels.accounts.verifyCredential, "accounts:verifyCredential");
    assert.equal(desktopChannels.artifacts.openRunArtifacts, "artifacts:openRunArtifacts");
    assert.equal(desktopChannels.skills.list, "skills:list");
    assert.equal(desktopRunEventKinds.includes("run.finished"), true);
  });
});
