import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";

import {
  assertCompactSkillHandoff,
  buildRefineRuntimeArgs,
  loadCompactSessionSummary,
  runObserveAutomationSession,
} from "./sandbox-workflow-support.mjs";

test("buildRefineRuntimeArgs allows manual SOP handoff with --skill only", () => {
  assert.deepEqual(
    buildRefineRuntimeArgs({
      skillName: "homepage-capture",
      task: "",
    }),
    ["--skill", "homepage-capture"]
  );
});

test("buildRefineRuntimeArgs keeps skill, resume, and task in refine order", () => {
  assert.deepEqual(
    buildRefineRuntimeArgs({
      skillName: "homepage-capture",
      resumeRunId: "resume-123",
      task: "check the inbox",
    }),
    ["--skill", "homepage-capture", "--resume-run-id", "resume-123", "check the inbox"]
  );
});

test("buildRefineRuntimeArgs fails explicitly when no refine handoff input is provided", () => {
  assert.throws(
    () =>
      buildRefineRuntimeArgs({
        task: "   ",
      }),
    /refine command requires --task, --skill, or --resume-run-id/
  );
});

test("loadCompactSessionSummary reports a truthful skillPath when the persisted skill exists", async () => {
  const tmpRoot = await mkdir(path.join(os.tmpdir(), `sasiki-sandbox-summary-${Date.now()}`), { recursive: true });
  const sessionDir = path.join(tmpRoot, "artifacts", "run-1", "compact_sessions", "run-1_compact_1");
  const skillRootDir = path.join(tmpRoot, "skills");
  const skillPath = path.join(skillRootDir, "homepage-capture", "SKILL.md");

  await mkdir(path.dirname(skillPath), { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    path.join(sessionDir, "compact_capability_output.json"),
    JSON.stringify({
      skillName: "homepage-capture",
      description: "Capture the homepage.",
      body: "# Homepage Capture",
    }),
    "utf8"
  );
  await writeFile(
    path.join(sessionDir, "compact_session_state.json"),
    JSON.stringify({
      convergence: {
        status: "ready_to_finalize",
      },
    }),
    "utf8"
  );
  await writeFile(skillPath, "---\nname: homepage-capture\ndescription: Capture the homepage.\n---\n\n# Homepage Capture\n", "utf8");

  const summary = loadCompactSessionSummary(sessionDir, { skillRootDir });

  assert.equal(summary.status, "ready_to_finalize");
  assert.equal(summary.selectedSkillName, "homepage-capture");
  assert.equal(summary.skillPath, skillPath);
});

test("assertCompactSkillHandoff fails explicitly when compact did not finalize a skill", () => {
  assert.throws(
    () =>
      assertCompactSkillHandoff({
        observeRunId: "run-1",
        compactSessionId: "run-1_compact_1",
        compactSessionDir: "/tmp/run-1/compact_sessions/run-1_compact_1",
        compactSummary: {
          status: "max_round_reached",
          selectedSkillName: undefined,
          skillPath: undefined,
        },
      }),
    /compact did not finalize a reusable skill/
  );
});

test("assertCompactSkillHandoff fails when compact named a skill but did not persist a truthful skill path", () => {
  assert.throws(
    () =>
      assertCompactSkillHandoff({
        observeRunId: "run-1",
        compactSessionId: "run-1_compact_1",
        compactSessionDir: "/tmp/run-1/compact_sessions/run-1_compact_1",
        compactSummary: {
          status: "ready_to_finalize",
          selectedSkillName: "homepage-capture",
          skillPath: undefined,
        },
      }),
    /compact did not finalize a reusable skill/
  );
});

test("runObserveAutomationSession terminates the spawned observe runtime when CDP readiness fails", async () => {
  const child = createFakeChild();
  const runtimePromise = runObserveAutomationSession({
    child,
    waitForCdpReady: async () => {
      throw new Error("CDP endpoint not ready");
    },
    runObserveDemoWithRetry: async () => ({ code: 0, stdout: "", stderr: "" }),
    wait: async () => undefined,
    observeStartedTimeoutMs: 0,
    postDemoWaitMs: 0,
    stdoutWriter: { write() {} },
    stderrWriter: { write() {} },
  });

  await assert.rejects(runtimePromise, /CDP endpoint not ready/);
  assert.deepEqual(child.killSignals, ["SIGTERM"]);
});

function createFakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killSignals = [];
  child.kill = (signal) => {
    child.killSignals.push(signal);
    queueMicrotask(() => {
      child.emit("close", 0);
    });
    return true;
  };
  return child;
}
