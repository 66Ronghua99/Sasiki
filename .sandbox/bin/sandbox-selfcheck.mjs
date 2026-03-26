#!/usr/bin/env node
/**
 * One-shot self-check harness for Sasiki sandbox workflow.
 *
 * Runs: bootstrap -> flow(observe/compact/refine) -> cdp snapshot inspect
 * and writes a compact report with run ids + command traces.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const workflowScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "sandbox-workflow.mjs",
);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultObserveTask =
  "打开 TikTok Global Shop 客服页面 https://seller.tiktokshopglobalselling.com/homepage?shop_region=VN&register_libra= ，进入客户消息并检查是否有未读或未分配消息。";
const defaultRefineTask =
  "打开 TikTok Global Shop 客服页面 https://seller.tiktokshopglobalselling.com/homepage?shop_region=VN&register_libra= ，检查是否有未读或未分配消息。";

const argv = process.argv.slice(2);
const options = parseArgs(argv);

const source = options.source ?? options.seed ?? options.origin ?? options.from ?? process.env.SASIKI_SANDBOX_SOURCE;
const config = options.config ?? options.c;
const observeTask = options["observe-task"] ?? process.env.SANDBOX_SELFCHECK_OBSERVE_TASK ?? defaultObserveTask;
const refineTask = options["refine-task"] ?? process.env.SANDBOX_SELFCHECK_REFINE_TASK ?? defaultRefineTask;
const semantic = options.semantic;
const compact = toBoolean(options.compact, true) && !toBoolean(options["skip-compact"], false);
const resumeRunId = options["resume-run-id"] ?? options.resumeRunId;
const autoObserve = toBoolean(options["auto-observe"], false);
const observePreset = options["observe-preset"] ?? "tiktok-shop-customer-service";
const includeCompact = compact;
const inspect = toBoolean(options.inspect, false);
const inspectWatch = toNumber(options["watch-steps"], 0);
const watchInterval = toNumber(options.interval, 2000);
const cdpTitle = options["cdp-title"] ?? "selfcheck";
const outRoot = options.out
  ? path.resolve(projectRoot, options.out)
  : path.resolve(projectRoot, ".sandbox", "artifacts", "selfcheck", new Date().toISOString().replace(/[:.]/g, "-"));
const selfcheckLog = path.join(outRoot, "selfcheck.log");
const flowLog = path.join(outRoot, "flow.log");
const bootstrapLog = path.join(outRoot, "bootstrap.log");
const inspectStatusLog = path.join(outRoot, "cdp-status.log");
const inspectWatchLog = path.join(outRoot, "cdp-watch.log");

mkdirSync(outRoot, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  args: argv,
  configPath: config ? path.resolve(projectRoot, config) : undefined,
  source,
  outRoot,
  observeTask,
  refineTask,
  semantic: semantic ?? "default",
  compact: includeCompact,
  autoObserve,
  observePreset,
  resumeRunId,
};

appendLog(selfcheckLog, `selfcheck started: ${report.startedAt}`);
appendLog(selfcheckLog, `root: ${projectRoot}`);
appendLog(selfcheckLog, `report: ${outRoot}`);

let bootstrapResult;
let flowResult;
let inspectStatusResult;
let inspectWatchResult;

try {
  bootstrapResult = runWorkflow(["bootstrap", ...(source ? ["--source", source] : [])], bootstrapLog);
  report.bootstrap = bootstrapResult;
  if (bootstrapResult.code !== 0) {
    throw new Error(`bootstrap failed (code=${bootstrapResult.code})`);
  }

  const flowArgs = [
    "flow",
    "--observe-task",
    observeTask,
    "--refine-task",
    refineTask,
  ];
  if (inspect) {
    flowArgs.push("--inspect");
  }
  if (autoObserve) {
    flowArgs.push("--auto-observe");
  }
  if (observePreset) {
    flowArgs.push("--observe-preset", String(observePreset));
  }
  if (config) {
    flowArgs.push("--config", config);
  }
  if (!includeCompact) {
    flowArgs.push("--skip-compact");
  }
  if (semantic) {
    flowArgs.push("--semantic", semantic);
  }
  if (resumeRunId) {
    flowArgs.push("--resume-run-id", resumeRunId);
  }

  flowResult = runWorkflow(flowArgs, flowLog);
  report.flow = flowResult;
  report.runIds = extractRunIds(flowResult.stdout, flowResult.stderr);
  if (flowResult.code !== 0) {
    throw new Error(`flow failed (code=${flowResult.code})`);
  }

  const finalScreenshot = path.join(outRoot, "cdp-final.png");
  const statusArgs = [
    "inspect",
    "status",
    "--title",
    cdpTitle,
    "--out",
    finalScreenshot,
  ];
  if (config) {
    statusArgs.push("--config", config);
  }
  inspectStatusResult = runWorkflow(statusArgs, inspectStatusLog);
  report.inspectStatus = {
    ...inspectStatusResult,
    screenshot: finalScreenshot,
  };

  if (inspect && inspectWatch > 0) {
    const watchOut = path.join(outRoot, "cdp-watch.png");
    const watchArgs = [
      "inspect",
      "watch",
      "--interval",
      String(watchInterval),
      "--max-steps",
      String(inspectWatch),
      "--out",
      watchOut,
      "--title",
      `${cdpTitle}-watch`,
    ];
    if (config) {
      watchArgs.push("--config", config);
    }
    inspectWatchResult = runWorkflow(watchArgs, inspectWatchLog);
    report.inspectWatch = {
      ...inspectWatchResult,
      screenshotTemplate: watchOut,
      intervalMs: watchInterval,
      steps: inspectWatch,
    };
  }

  report.completedAt = new Date().toISOString();
  report.status = "completed";
} catch (error) {
  report.completedAt = new Date().toISOString();
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  report.exitCode = statusToCode(report);
  const reportPath = path.join(outRoot, "selfcheck-report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  appendLog(selfcheckLog, `report: ${reportPath}`);
  appendLog(selfcheckLog, `selfcheck status: ${report.status} code=${report.exitCode}`);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.exitCode);

function runWorkflow(args, logPath) {
  const cmd = process.execPath;
  const commandLine = [cmd, workflowScript, ...args].map((item) => JSON.stringify(item)).join(" ");
  appendLog(logPath, `run ${commandLine}`);
  try {
    const result = spawnSync(cmd, [workflowScript, ...args], {
      encoding: "utf8",
      cwd: projectRoot,
      maxBuffer: 8_388_608,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = (result.stdout ?? "").toString();
    appendLog(logPath, output);
    if (result.status !== 0) {
      const errorOutput = (result.stderr ?? "").toString();
      if (errorOutput) appendLog(logPath, errorOutput);
      return { code: result.status ?? 1, stdout: output, stderr: errorOutput };
    }
    return { code: 0, stdout: output, stderr: "" };
  }
  catch (error) {
    const stderr = (error.stderr ?? "").toString();
    const stdout = (error.stdout ?? "").toString();
    if (stdout) appendLog(logPath, stdout);
    if (stderr) appendLog(logPath, stderr);
    return {
      code: error.status ?? 1,
      stdout,
      stderr,
    };
  }
}

function appendLog(filePath, chunk) {
  appendFileSync(filePath, `${chunk}\n`, { encoding: "utf8" });
}

function toBoolean(raw, defaultValue = false) {
  if (raw === undefined || raw === null || raw === "") {
    return defaultValue;
  }
  const normalized = String(raw).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function toNumber(raw, defaultValue) {
  const value = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function parseArgs(argvList) {
  const options = {};
  for (let i = 0; i < argvList.length; i += 1) {
    const arg = argvList[i];
    if (!arg.startsWith("-")) {
      continue;
    }
    if (arg === "--") {
      break;
    }
    if (arg.startsWith("--")) {
      const idx = arg.indexOf("=");
      if (idx > -1) {
        options[arg.slice(2, idx)] = arg.slice(idx + 1);
      } else {
        const key = arg.slice(2);
        const next = argvList[i + 1];
        if (next && !next.startsWith("-")) {
          options[key] = next;
          i += 1;
        } else {
          options[key] = "true";
        }
      }
      continue;
    }
    if (arg.length === 2) {
      const key = arg[1];
      const valueOptions = ["s", "c", "i", "m"];
      const next = argvList[i + 1];
      if (valueOptions.includes(key) && next && !next.startsWith("-")) {
        options[key] = next;
        i += 1;
      } else {
        options[key] = "true";
      }
    }
  }
  return options;
}

function extractRunIds(stdout, stderr) {
  const text = `${stdout}\n${stderr}`;
  const runIdSet = new Set();
  const patterns = [
    /\b"?(?:runId|run_id)"?\s*:\s*["']([^"'\r\n]+)["']/g,
    /\b(?:observe|compact|refine)RunId\s*[:=]\s*["']([^"'\r\n]+)["']/gi,
    /artifacts\/(?:e2e|selfcheck)\/([0-9_]{12,})/g,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(text);
    while (match !== null) {
      if (match[1]) {
        runIdSet.add(match[1]);
      }
      match = pattern.exec(text);
    }
  }

  return Array.from(runIdSet);
}

function statusToCode(report) {
  if (report.status !== "completed") {
    return 1;
  }
  if (!report.flow || report.flow.code !== 0) {
    return 2;
  }
  if (!report.bootstrap || report.bootstrap.code !== 0) {
    return 3;
  }
  return 0;
}
