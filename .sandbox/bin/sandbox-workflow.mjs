#!/usr/bin/env node
/**
 * Sasiki sandbox flow runner.
 * Provides:
 * - bootstrap .sandbox state in current worktree
 * - run observe -> sop-compact -> refine pipeline
 * - snapshot/observe current CDP state through playwright-cdp.mjs
 */
import { existsSync, cpSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sandboxRoot = path.join(projectRoot, ".sandbox");
const templatePath = path.join(sandboxRoot, "templates", "runtime.config.json");
const runtimeConfigPath = path.join(sandboxRoot, "runtime.config.json");
const runtimeStatePath = path.join(sandboxRoot, "state.json");
const profilePath = path.join(sandboxRoot, "chrome_profile");
const cookiesPath = path.join(sandboxRoot, "cookies");
const inspectScript = path.join(sandboxRoot, "bin", "playwright-cdp.mjs");
const inspectRoot = path.join(sandboxRoot, "inspect");
const runtimeEntry = path.join(projectRoot, "apps/agent-runtime", "dist", "index.js");

const command = process.argv[2] ?? "";
const args = process.argv.slice(3);

const HELP_TEXT = `Sasiki sandbox flow runner

Usage:
  node .sandbox/bin/sandbox-workflow.mjs bootstrap [--source <worktree-path>] [--copy-profile|--no-copy-profile] [--copy-cookies|--no-copy-cookies] [--force]
  node .sandbox/bin/sandbox-workflow.mjs observe [--config <path>] [--task "<observe task>"] [--auto-observe] [--observe-preset <preset>] [--inspect]
  node .sandbox/bin/sandbox-workflow.mjs compact [--config <path>] --run-id <run_id> [--semantic off|auto|on] [--inspect]
  node .sandbox/bin/sandbox-workflow.mjs refine [--config <path>] [--task "<refine task>"] [--resume-run-id <run_id>] [--inspect]
  node .sandbox/bin/sandbox-workflow.mjs flow --observe-task "<observe task>" [--refine-task "<refine task>"] [--config <path>] [--compact|--skip-compact] [--semantic off|auto|on] [--auto-observe] [--observe-preset <preset>] [--inspect] [--resume-run-id <run_id>]
  node .sandbox/bin/sandbox-workflow.mjs inspect [status|watch] [--config <path>] [--out <screenshot-path>] [--title <label>] [--interval <ms>] [--max-steps <n>]

Notes:
  - Recommended route for e2e: bootstrap -> flow (or selfcheck wrapper) -> inspect
  - Commands default to .sandbox/runtime.config.json
  - bootstrap will copy .sandbox/chrome_profile and .sandbox/cookies from source when provided
  - source can come from --source or SASIKI_SANDBOX_SOURCE, and falls back to previous state source path
  - run commands can pass --inspect to snapshot live CDP state around each stage
`;

if (!command || command === "--help" || command === "-h") {
  process.stdout.write(HELP_TEXT);
  process.exit(command ? 0 : 1);
}

const RUN_ID_PATTERN = /^\d{8}_\d{6}_\d{3}$/;
const COMPACT_SESSION_PATTERN = /^.+_compact_/;
const DEFAULT_OBSERVE_PRESET = "tiktok-shop-customer-service";

await main();

async function main() {
  switch (command) {
    case "bootstrap":
    case "init":
      await runBootstrap(parseArgs(args));
      return;
    case "observe":
      await runObserve(parseArgs(args));
      return;
    case "compact":
      await runCompact(parseArgs(args));
      return;
    case "refine":
      await runRefine(parseArgs(args));
      return;
    case "flow":
      await runFlow(parseArgs(args));
      return;
    case "inspect":
    case "cdp":
      const parsed = parseArgs(args);
      const first = parsed.positionals[0];
      const inspectArgs = first === "watch"
        ? { ...parsed, positionals: [], options: { ...parsed.options, watch: "true" } }
        : parsed.positionals[0] === "status"
          ? { ...parsed, positionals: parsed.positionals.slice(1) }
          : parsed;
      if (first === "watch") {
        inspectArgs.positionals = [];
      }
      await runInspect(inspectArgs);
      return;
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

async function runBootstrap({ options }) {
  const source = resolveSourcePath(resolveBootstrapSourceCandidate(options), projectRoot);
  const force = toBoolean(options.force, false);
  let copyProfile = toBoolean(options["copy-profile"], true);
  let copyCookies = toBoolean(options["copy-cookies"], true);
  if (toBoolean(options["no-copy-profile"], false)) {
    copyProfile = false;
  }
  if (toBoolean(options["no-copy-cookies"], false)) {
    copyCookies = false;
  }
  mkdirSync(sandboxRoot, { recursive: true });
  mkdirSync(profilePath, { recursive: true });
  mkdirSync(cookiesPath, { recursive: true });
  mkdirSync(path.join(sandboxRoot, "artifacts"), { recursive: true });
  mkdirSync(inspectRoot, { recursive: true });

  const state = {
    bootstrapAt: new Date().toISOString(),
    source: source ?? "",
    copiedProfile: false,
    copiedCookies: false,
  };

  const sourceConfig = source ? path.join(source, ".sandbox", "runtime.config.json") : "";
  if (sourceConfig && existsSync(sourceConfig) && (force || !existsSync(runtimeConfigPath))) {
    cpSync(sourceConfig, runtimeConfigPath, { force: true });
  }
  if (!existsSync(runtimeConfigPath)) {
    cpSync(templatePath, runtimeConfigPath, { force: true });
  }

  if (source && copyProfile && existsSync(path.join(source, ".sandbox", "chrome_profile"))) {
    const canCopy = shouldCopyDir(profilePath, path.join(source, ".sandbox", "chrome_profile"), force);
    if (canCopy) {
      cpSync(path.join(source, ".sandbox", "chrome_profile"), profilePath, { recursive: true, force: true });
      state.copiedProfile = true;
    }
  }
  if (source && copyCookies && existsSync(path.join(source, ".sandbox", "cookies"))) {
    const canCopy = shouldCopyDir(cookiesPath, path.join(source, ".sandbox", "cookies"), force);
    if (canCopy) {
      cpSync(path.join(source, ".sandbox", "cookies"), cookiesPath, { recursive: true, force: true });
      state.copiedCookies = true;
    }
  }

  await ensureSandboxDefaults(runtimeConfigPath);
  await writeFile(runtimeStatePath, `${JSON.stringify(state, null, 2)}\n`);
  stdoutJSON({ command: "bootstrap", ...state, configPath: runtimeConfigPath });
}

function runtimeStatePathSource() {
  if (!existsSync(runtimeStatePath)) return "";
  try {
    const raw = readFileSync(runtimeStatePath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.source;
  } catch {
    return "";
  }
}

async function runObserve({ options, positionals }) {
  const task = resolveTaskArg(options.task, positionals);
  if (!task) {
    throw new Error("observe command requires --task or positional task text");
  }
  const configPath = resolveConfigPath(options.config ?? options.c);
  const autoObserve = toBoolean(options["auto-observe"], false);
  const observePreset = normalizeObservePreset(options["observe-preset"]);
  ensureRuntimeReady(configPath);
  const doInspect = toBoolean(options.inspect, false);
  if (doInspect) {
    runStatusInspect(configPath, "before-observe");
  }
  const runId = await runObserveAndResolveRunId({
    task,
    configPath,
    autoObserve,
    observePreset,
  });
  if (doInspect) {
    runStatusInspect(configPath, `after-observe ${runId}`);
  }
  stdoutJSON({
    command: "observe",
    runId,
    configPath,
    autoObserve,
    observePreset: autoObserve ? observePreset : undefined,
    artifactsRoot: getArtifactsRoot(configPath),
  });
}

async function runCompact({ options, positionals }) {
  const configPath = resolveConfigPath(options.config ?? options.c);
  const runId = (options["run-id"] ?? options.runId ?? options.run_id ?? options.r ?? positionals[0] ?? "").trim();
  if (!runId) {
    throw new Error("compact command requires --run-id");
  }
  ensureRuntimeReady(configPath);
  const semantic = normalizeSemantic(options.semantic);
  const doInspect = toBoolean(options.inspect, false);
  const compactSessionRoot = path.join(getArtifactsRoot(configPath), runId, "compact_sessions");
  const beforeSessions = listDirectories(compactSessionRoot, COMPACT_SESSION_PATTERN);
  if (doInspect) {
    runStatusInspect(configPath, `before-compact ${runId}`);
  }
  runRuntime({
    configPath,
    args: ["sop-compact", "--run-id", runId, ...(semantic ? ["--semantic", semantic] : [])],
    label: "compact",
  });
  const afterSessions = listDirectories(compactSessionRoot, COMPACT_SESSION_PATTERN);
  const sessionId = pickNew(beforeSessions, afterSessions);
  const summary = {
    command: "sop-compact",
    runId,
    configPath,
    semantic: semantic ?? "auto",
    compactSessionId: sessionId,
    compactSessionDir: sessionId ? path.join(compactSessionRoot, sessionId) : undefined,
  };
  stdoutJSON(summary);
}

async function runRefine({ options, positionals }) {
  const task = resolveTaskArg(options.task, positionals);
  if (!task) {
    throw new Error("refine command requires --task or positional task text");
  }
  const configPath = resolveConfigPath(options.config ?? options.c);
  const resumeRunId = options["resume-run-id"] ?? options.resumeRunId;
  const trailing = resumeRunId ? ["--resume-run-id", String(resumeRunId)] : [];
  ensureRuntimeReady(configPath);
  const doInspect = toBoolean(options.inspect, false);
  if (doInspect) {
    runStatusInspect(configPath, "before-refine");
  }
  const runId = runCommandAndResolveRunId({
    command: "refine",
    args: [task, ...trailing],
    configPath,
  });
  if (doInspect) {
    runStatusInspect(configPath, `after-refine ${runId}`);
  }
  stdoutJSON({
    command: "refine",
    runId,
    resumeRunId,
    configPath,
    artifactsRoot: getArtifactsRoot(configPath),
  });
}

async function runFlow({ options }) {
  const observeTask = (options["observe-task"] ?? options.observeTask ?? "").trim();
  const refineTask = (options["refine-task"] ?? options.refineTask ?? observeTask).trim();
  const configPath = resolveConfigPath(options.config ?? options.c);
  const compactSemantic = normalizeSemantic(options.semantic);
  const doInspect = toBoolean(options.inspect, false);
  const doCompact = toBoolean(options.compact, true);
  const skipCompact = toBoolean(options["skip-compact"], false);
  const resumeRunId = options["resume-run-id"] ?? options.resumeRunId;
  const autoObserve = toBoolean(options["auto-observe"], false);
  const observePreset = normalizeObservePreset(options["observe-preset"]);
  const refineArgs = resumeRunId ? ["--resume-run-id", String(resumeRunId)] : [];
  const compactEnabled = doCompact && !skipCompact;
  const inspectWarnings = [];

  if (!observeTask) {
    throw new Error("flow command requires --observe-task");
  }
  if (!refineTask) {
    throw new Error("flow command requires --refine-task when observe-task is empty");
  }

  ensureRuntimeReady(configPath);
  const observeRunId = await runObserveAndResolveRunId({
    task: observeTask,
    configPath,
    autoObserve,
    observePreset,
  });
  if (doInspect) {
    runStatusInspectSafe(configPath, "after-observe", observeRunId, inspectWarnings);
  }

  let compactSessionId;
  let compactSessionDir;
  const compactSessionRoot = path.join(getArtifactsRoot(configPath), observeRunId, "compact_sessions");
  if (compactEnabled) {
    const beforeSessions = listDirectories(compactSessionRoot, COMPACT_SESSION_PATTERN);
    if (doInspect) {
      runStatusInspectSafe(configPath, `before-compact ${observeRunId}`, observeRunId, inspectWarnings);
    }
    runRuntime({
      configPath,
      args: ["sop-compact", "--run-id", observeRunId, ...(compactSemantic ? ["--semantic", compactSemantic] : [])],
      label: "compact",
    });
    const afterSessions = listDirectories(compactSessionRoot, COMPACT_SESSION_PATTERN);
    compactSessionId = pickNew(beforeSessions, afterSessions);
    compactSessionDir = compactSessionId ? path.join(compactSessionRoot, compactSessionId) : undefined;
    if (doInspect) {
      runStatusInspectSafe(configPath, "after-compact", observeRunId, inspectWarnings);
    }
  }

  const refineRunId = runCommandAndResolveRunId({
    command: "refine",
    args: [refineTask, ...refineArgs],
    configPath,
  });
  if (doInspect) {
    runStatusInspectSafe(configPath, "after-refine", refineRunId, inspectWarnings);
  }

  stdoutJSON({
    command: "flow",
    configPath,
    observeRunId,
    autoObserve,
    observePreset: autoObserve ? observePreset : undefined,
    compactSessionId,
    compactSessionDir,
    refineRunId,
    artifactsRoot: getArtifactsRoot(configPath),
    compactSemantic: compactSemantic ?? "auto",
    inspectWarnings,
  });
}

async function runObserveAndResolveRunId({ task, configPath, autoObserve, observePreset }) {
  const artifactRoot = getArtifactsRoot(configPath);
  const beforeRuns = listRunIds(artifactRoot);
  if (autoObserve) {
    await runObserveRuntimeWithAutomation({ task, configPath, observePreset });
  } else {
    runRuntime({ configPath, args: ["observe", task], label: "observe" });
  }
  const afterRuns = listRunIds(artifactRoot);
  const runId = pickNew(beforeRuns, afterRuns);
  if (!runId) {
    throw new Error(`unable to infer runId from artifacts root ${artifactRoot}`);
  }
  return runId;
}

async function runObserveRuntimeWithAutomation({ task, configPath, observePreset }) {
  const runtimeEnv = buildRuntimeEnv(configPath);
  const child = spawn(process.execPath, [runtimeEntry, "observe", task, "--config", configPath], {
    cwd: projectRoot,
    env: runtimeEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let runtimeExited = false;
  let observeStarted = false;
  let resolveObserveStarted;
  const observeStartedPromise = new Promise((resolve) => {
    resolveObserveStarted = resolve;
  });
  const runtimeExit = new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      if (!observeStarted && text.includes("observe_started")) {
        observeStarted = true;
        resolveObserveStarted(true);
      }
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      runtimeExited = true;
      if (!observeStarted) {
        resolveObserveStarted(false);
      }
      resolve(code ?? 1);
    });
  });

  await Promise.race([observeStartedPromise, wait(15000)]);
  if (!runtimeExited) {
    const demoResult = await runObserveDemoWithRetry(configPath, observePreset);
    if (demoResult.code !== 0) {
      child.kill("SIGTERM");
      await runtimeExit;
      throw new Error(`auto observe demo failed: ${demoResult.stderr || demoResult.stdout}`);
    }
    await wait(1200);
    if (!runtimeExited) {
      child.kill("SIGTERM");
    }
  }

  const runtimeCode = await runtimeExit;
  if (runtimeCode !== 0) {
    throw new Error(`observe failed (code ${runtimeCode}): ${stderr || stdout}`);
  }
}

async function runObserveDemoWithRetry(configPath, observePreset) {
  const maxAttempts = 3;
  let lastResult = { code: 1, stdout: "", stderr: "demo did not run" };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runCommand(process.execPath, [
      inspectScript,
      "demo",
      "--config",
      configPath,
      "--preset",
      observePreset,
    ], {
      env: buildProxySafeEnv({ ...process.env }),
      cwd: projectRoot,
    });
    if (result.code === 0) {
      return result;
    }
    lastResult = result;
    if (attempt < maxAttempts) {
      process.stderr.write(`auto observe demo retry ${attempt}/${maxAttempts} after failure\n`);
      await wait(1200);
    }
  }
  return lastResult;
}

function runInspect({ options }) {
  const configPath = resolveConfigPath(options.config ?? options.c);
  const out = options.out || options.o ? resolveSnapshotPath(options.out || options.o) : "";
  const title = options.title ?? "manual";
  if (options.watch || options.mode === "watch") {
    const interval = parseInt(options.interval ?? options.i ?? "2000", 10);
    const maxSteps = parseInt(options["max-steps"] ?? options.max ?? "0", 10);
    runWatchInspect(configPath, interval, maxSteps, title, out);
    return;
  }
  runStatusInspect(configPath, title, out);
}

function runStatusInspectSafe(configPath, title, runId = "", warnings) {
  try {
    runStatusInspect(configPath, title);
  } catch (error) {
    warnings.push({
      phase: title,
      runId: runId || undefined,
      error: error instanceof Error ? error.message : String(error),
    });
    const latest = warnings.at(-1);
    process.stderr.write(`cdp inspect warning (${title}): ${latest.error}\n`);
  }
}

function runWatchInspect(configPath, interval, maxSteps, title, out) {
  const inspectArgs = [inspectScript, "watch", "--config", configPath];
  if (Number.isFinite(interval) && interval > 0) {
    inspectArgs.push("--interval", String(interval));
  }
  if (Number.isFinite(maxSteps) && maxSteps > 0) {
    inspectArgs.push("--max-steps", String(maxSteps));
  }
  if (out) {
    inspectArgs.push("--out", out);
  }
  if (title) {
    inspectArgs.push("--title", title);
  }
  const result = runCommand(process.execPath, inspectArgs, {
    env: { ...process.env },
    cwd: projectRoot,
  });
  if (result.code !== 0) {
    throw new Error(`cdp watch failed: ${result.stderr || result.stdout}`);
  }
}

function runStatusInspect(configPath, title, out) {
  const inspectArgs = [inspectScript, "status", "--config", configPath];
  if (out) {
    inspectArgs.push("--out", out);
  }
  if (title) {
    inspectArgs.push("--title", title);
  }
  const result = runCommand(process.execPath, inspectArgs, {
    env: { ...process.env },
    cwd: projectRoot,
  });
  if (result.code !== 0) {
    throw new Error(`cdp inspect failed: ${result.stderr || result.stdout}`);
  }
}

function runCommandAndResolveRunId({ command, args, configPath }) {
  const artifactRoot = getArtifactsRoot(configPath);
  const beforeRuns = listRunIds(artifactRoot);
  runRuntime({ configPath, args: [command, ...args], label: command });
  const afterRuns = listRunIds(artifactRoot);
  const runId = pickNew(beforeRuns, afterRuns);
  if (!runId) {
    throw new Error(`unable to infer runId from artifacts root ${artifactRoot}`);
  }
  return runId;
}

function runRuntime({ configPath, args, label }) {
  if (!existsSync(runtimeEntry)) {
    throw new Error(
      `runtime dist not found: ${runtimeEntry}. run: npm --prefix apps/agent-runtime run build`
    );
  }
  const runtimeEnv = buildRuntimeEnv(configPath);
  const result = runCommand(process.execPath, [runtimeEntry, ...args, "--config", configPath], {
    env: runtimeEnv,
    cwd: projectRoot,
  });
  if (result.code !== 0) {
    throw new Error(`${label || "runtime"} failed (code ${result.code}): ${result.stderr || result.stdout}`);
  }
}

function buildRuntimeEnv(configPath) {
  const runtimeEnv = buildProxySafeEnv({
    ...process.env,
    RUNTIME_CONFIG_PATH: configPath,
    RUNTIME_ARTIFACTS_DIR: getArtifactsRoot(configPath),
  });
  return runtimeEnv;
}

function buildProxySafeEnv(env) {
  const next = { ...env };
  delete next.http_proxy;
  delete next.https_proxy;
  delete next.HTTP_PROXY;
  delete next.HTTPS_PROXY;
  if (!next.NO_PROXY && !next.no_proxy) {
    next.NO_PROXY = "localhost,127.0.0.1,::1";
    next.no_proxy = "localhost,127.0.0.1,::1";
  } else if (!next.NO_PROXY && next.no_proxy) {
    next.NO_PROXY = next.no_proxy;
  } else if (!next.no_proxy && next.NO_PROXY) {
    next.no_proxy = next.NO_PROXY;
  }
  return next;
}

function runCommand(commandPath, args, options) {
  const result = spawnSync(commandPath, args, {
    encoding: "utf8",
    cwd: options.cwd,
    env: options.env,
    shell: false,
  });
  if (result.stdout) {
    process.stdout.write(String(result.stdout));
  }
  if (result.stderr) {
    process.stderr.write(String(result.stderr));
  }
  return {
    code: result.status ?? 1,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

function listRunIds(artifactRoot) {
  return listDirectories(artifactRoot, RUN_ID_PATTERN);
}

function listDirectories(dirPath, pattern) {
  if (!existsSync(dirPath)) {
    return [];
  }
  return readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function pickNew(before, after) {
  const beforeSet = new Set(before);
  const added = after.filter((name) => !beforeSet.has(name));
  return added.length > 0 ? added.sort().slice(-1)[0] : after.length ? after.sort().slice(-1)[0] : undefined;
}

function ensureRuntimeReady(configPath) {
  if (!existsSync(runtimeEntry)) {
    throw new Error(
      "runtime binary missing. Please build runtime first: npm --prefix apps/agent-runtime run build"
    );
  }
  if (!existsSync(configPath)) {
    throw new Error(
      `missing config: ${configPath}. Run: node .sandbox/bin/sandbox-workflow.mjs bootstrap`
    );
  }
}

function resolveConfigPath(configArg) {
  const raw = configArg?.trim();
  return raw ? resolvePath(raw, process.cwd()) : runtimeConfigPath;
}

function getArtifactsRoot(configPath) {
  const config = loadJson(configPath);
  const configured = config?.runtime?.artifactsDir?.trim();
  if (!configured) {
    return path.join(projectRoot, "artifacts", "e2e");
  }
  if (configured.startsWith("~")) {
    return path.join(os.homedir(), configured.slice(2));
  }
  return path.isAbsolute(configured) ? configured : path.resolve(projectRoot, configured);
}

async function ensureSandboxDefaults(configPath) {
  const config = loadJson(configPath);
  const next = { ...config };
  let changed = false;
  next.cdp = next.cdp ?? {};
  next.runtime = next.runtime ?? {};
  if (!next.cdp.userDataDir) {
    next.cdp.userDataDir = "~/.sasiki/chrome_profile";
    changed = true;
  }
  if (!next.cdp.cookiesDir) {
    next.cdp.cookiesDir = "~/.sasiki/cookies";
    changed = true;
  }
  if (!next.runtime.artifactsDir) {
    next.runtime.artifactsDir = ".sandbox/artifacts";
    changed = true;
  }
  if (changed) {
    await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`);
  }
}

function resolveTaskArg(taskOpt, positionals) {
  const fromOption = taskOpt?.trim();
  if (fromOption) {
    return fromOption;
  }
  return positionals.join(" ").trim();
}

function resolveSnapshotPath(outArg) {
  const defaultName = `snapshot-${Date.now()}.png`;
  if (!outArg?.trim()) {
    return path.join(inspectRoot, defaultName);
  }
  if (path.isAbsolute(outArg)) {
    return outArg;
  }
  return path.resolve(projectRoot, outArg);
}

function shouldCopyDir(target, source, force) {
  if (force) {
    return true;
  }
  if (!existsSync(target)) {
    return true;
  }
  if (!existsSync(source)) {
    return false;
  }
  return readdirSync(target).length === 0 && readdirSync(source).length > 0;
}

function resolvePath(raw, baseDir) {
  const p = raw.trim();
  if (!p) {
    return "";
  }
  return path.isAbsolute(p) ? p : path.resolve(baseDir, p);
}

function resolveSourcePath(candidate, baseDir) {
  if (!candidate) {
    return "";
  }
  return resolvePath(candidate, baseDir);
}

function resolveBootstrapSourceCandidate(options) {
  const candidate = options.source ?? options.s ?? options.seed ?? options.origin ?? options.from;
  if (candidate) {
    return candidate;
  }
  if (process.env.SASIKI_SANDBOX_SOURCE) {
    return process.env.SASIKI_SANDBOX_SOURCE;
  }
  return runtimeStatePathSource();
}

function loadJson(configPath) {
  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizeSemantic(value) {
  if (value === "off" || value === "auto" || value === "on") {
    return value;
  }
  return undefined;
}

function normalizeObservePreset(value) {
  if (!value || !String(value).trim()) {
    return DEFAULT_OBSERVE_PRESET;
  }
  return String(value).trim();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBoolean(raw, defaultValue = false) {
  if (raw === undefined || raw === null || raw === "") {
    return defaultValue;
  }
  const normalized = String(raw).toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function parseArgs(argv) {
  const options = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      if (equals !== -1) {
        options[arg.slice(2, equals)] = arg.slice(equals + 1);
        continue;
      }
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        options[key] = next;
        i += 1;
      } else {
        options[key] = "true";
      }
      continue;
    }
    if (arg.length === 2) {
      const key = arg[1];
      const valueArgs = ["c", "r", "s", "i", "m"];
      const next = argv[i + 1];
      if (valueArgs.includes(key) && next && !next.startsWith("-")) {
        options[key] = next;
        i += 1;
      } else {
        options[key] = "true";
      }
      continue;
    }
    if (arg.length > 2) {
      for (let j = 1; j < arg.length; j += 1) {
        options[arg[j]] = "true";
      }
    }
  }
  return { options, positionals };
}

function stdoutJSON(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}
