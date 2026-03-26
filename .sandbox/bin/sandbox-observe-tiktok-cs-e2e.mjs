#!/usr/bin/env node
/**
 * One-command observe e2e for TikTok Global Shop customer-service workflow.
 *
 * Runs observe with auto browser operations (via CDP + Playwright preset) and
 * emits the run summary JSON from sandbox-workflow.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflowScript = path.join(projectRoot, ".sandbox", "bin", "sandbox-workflow.mjs");
const defaultTask =
  "打开 TikTok Global Shop 客服页面 https://seller.tiktokshopglobalselling.com/homepage?shop_region=VN&register_libra= ，进入客户消息并检查是否有未读或未分配消息。";

const { options } = parseArgs(process.argv.slice(2));
if (options.help || options.h) {
  process.stdout.write(`Usage:
  node .sandbox/bin/sandbox-observe-tiktok-cs-e2e.mjs [--config <path>] [--task "<observe task>"]
`);
  process.exit(0);
}

const configPath = options.config ?? options.c ?? ".sandbox/runtime.config.json";
const task = (options.task ?? defaultTask).trim() || defaultTask;

const env = { ...process.env };
for (const key of ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"]) {
  delete env[key];
}
if (!env.NO_PROXY) {
  env.NO_PROXY = "localhost,127.0.0.1,::1";
}
if (!env.no_proxy) {
  env.no_proxy = env.NO_PROXY;
}

const result = spawnSync(
  process.execPath,
  [
    workflowScript,
    "observe",
    "--config",
    configPath,
    "--auto-observe",
    "--observe-preset",
    "tiktok-shop-customer-service",
    "--task",
    task,
  ],
  {
    cwd: projectRoot,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
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
        const next = argv[i + 1];
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
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        options[key] = next;
        i += 1;
      } else {
        options[key] = "true";
      }
    }
  }
  return { options };
}
