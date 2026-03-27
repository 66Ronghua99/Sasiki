import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function buildRefineRuntimeArgs({ task, skillName, resumeRunId }) {
  const trimmedTask = String(task ?? "").trim();
  const trimmedSkillName = String(skillName ?? "").trim();
  const trimmedResumeRunId = String(resumeRunId ?? "").trim();

  if (!trimmedTask && !trimmedSkillName && !trimmedResumeRunId) {
    throw new Error("refine command requires --task, --skill, or --resume-run-id");
  }

  const args = [];
  if (trimmedSkillName) {
    args.push("--skill", trimmedSkillName);
  }
  if (trimmedResumeRunId) {
    args.push("--resume-run-id", trimmedResumeRunId);
  }
  if (trimmedTask) {
    args.push(trimmedTask);
  }
  return args;
}

export function loadCompactSessionSummary(sessionDir, { skillRootDir = defaultSopSkillRootDir() } = {}) {
  const capabilityOutputPath = path.join(sessionDir, "compact_capability_output.json");
  const sessionStatePath = path.join(sessionDir, "compact_session_state.json");
  const capability = loadJsonIfExists(capabilityOutputPath);
  const sessionState = loadJsonIfExists(sessionStatePath);

  const selectedSkillName =
    typeof capability?.skillName === "string" && capability.skillName.trim()
      ? capability.skillName.trim()
      : undefined;
  const capabilitySkillPath =
    typeof capability?.skillPath === "string" && capability.skillPath.trim()
      ? capability.skillPath.trim()
      : undefined;
  const status =
    typeof sessionState?.convergence?.status === "string" && sessionState.convergence.status.trim()
      ? sessionState.convergence.status.trim()
      : undefined;
  const skillPath = resolveTruthfulSkillPath({
    selectedSkillName,
    capabilitySkillPath,
    skillRootDir,
  });

  return {
    status,
    selectedSkillName,
    skillPath,
  };
}

export function assertCompactSkillHandoff({
  observeRunId,
  compactSessionId,
  compactSessionDir,
  compactSummary,
}) {
  if (
    compactSummary?.status === "ready_to_finalize" &&
    compactSummary?.selectedSkillName &&
    compactSummary?.skillPath
  ) {
    return compactSummary.selectedSkillName;
  }

  const details = [
    `observe run ${observeRunId}`,
    compactSessionId ? `compact session ${compactSessionId}` : null,
    compactSessionDir ? `dir ${compactSessionDir}` : null,
    compactSummary?.status ? `status=${compactSummary.status}` : "status=unknown",
  ].filter(Boolean);

  throw new Error(`compact did not finalize a reusable skill; ${details.join(", ")}`);
}

export async function runObserveAutomationSession({
  child,
  waitForCdpReady,
  runObserveDemoWithRetry,
  wait,
  observeStartedTimeoutMs = 15_000,
  postDemoWaitMs = 1_200,
  stdoutWriter,
  stderrWriter,
}) {
  let stdout = "";
  let stderr = "";
  let runtimeSettled = false;
  let observeStarted = false;
  let resolveObserveStarted;
  const observeStartedPromise = new Promise((resolve) => {
    resolveObserveStarted = resolve;
  });

  const runtimeExit = new Promise((resolve, reject) => {
    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      if (!observeStarted && text.includes("observe_started")) {
        observeStarted = true;
        resolveObserveStarted(true);
      }
      stdoutWriter?.write?.(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      stderrWriter?.write?.(text);
    });
    child.on?.("error", (error) => {
      runtimeSettled = true;
      if (!observeStarted) {
        resolveObserveStarted(false);
      }
      reject(error);
    });
    child.on?.("close", (code) => {
      runtimeSettled = true;
      if (!observeStarted) {
        resolveObserveStarted(false);
      }
      resolve(code ?? 1);
    });
  });

  await Promise.race([observeStartedPromise, wait(observeStartedTimeoutMs)]);

  try {
    if (!runtimeSettled) {
      await waitForCdpReady();
      const demoResult = await runObserveDemoWithRetry();
      if (demoResult.code !== 0) {
        throw new Error(`auto observe demo failed: ${demoResult.stderr || demoResult.stdout}`);
      }
      if (postDemoWaitMs > 0) {
        await wait(postDemoWaitMs);
      }
    }
  } catch (error) {
    await terminateObserveRuntimeChild(child, runtimeExit, runtimeSettled);
    throw error;
  }

  if (!runtimeSettled) {
    await terminateObserveRuntimeChild(child, runtimeExit, runtimeSettled);
  }

  const runtimeCode = await runtimeExit;
  if (runtimeCode !== 0) {
    throw new Error(`observe failed (code ${runtimeCode}): ${stderr || stdout}`);
  }

  return {
    runtimeCode,
    stdout,
    stderr,
    observeStarted,
  };
}

async function terminateObserveRuntimeChild(child, runtimeExit, runtimeSettled) {
  if (!runtimeSettled) {
    try {
      child.kill?.("SIGTERM");
    } catch {
      // best-effort child cleanup
    }
  }
  await runtimeExit.catch(() => undefined);
}

function resolveTruthfulSkillPath({ selectedSkillName, capabilitySkillPath, skillRootDir }) {
  if (capabilitySkillPath && existsSync(capabilitySkillPath)) {
    return capabilitySkillPath;
  }
  if (!selectedSkillName) {
    return undefined;
  }
  const inferredSkillPath = path.join(skillRootDir, selectedSkillName, "SKILL.md");
  return existsSync(inferredSkillPath) ? inferredSkillPath : undefined;
}

function loadJsonIfExists(filePath) {
  if (!existsSync(filePath)) {
    return undefined;
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function defaultSopSkillRootDir() {
  return path.join(os.homedir(), ".sasiki", "skills");
}
