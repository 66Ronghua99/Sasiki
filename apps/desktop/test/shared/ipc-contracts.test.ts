import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  assertDesktopApiContract,
  createDesktopApiShape,
  desktopRunEventKinds,
} from "../../shared/ipc/contracts";
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

    assertDesktopApiContract(api);
    assertDesktopApiContract(liveApi);

    assert.equal(desktopChannels.runs.startObserve, "runs:startObserve");
    assert.equal(desktopChannels.accounts.verifyCredential, "accounts:verifyCredential");
    assert.equal(desktopChannels.artifacts.openRunArtifacts, "artifacts:openRunArtifacts");
    assert.equal(desktopChannels.skills.list, "skills:list");
    assert.equal(desktopRunEventKinds.includes("run.finished"), true);
  });
});
