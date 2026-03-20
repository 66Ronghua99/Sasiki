/**
 * Deps: domain/agent-types.ts
 * Used By: index.ts
 * Last Updated: 2026-03-20
 */
import type { RuntimeMode } from "../domain/agent-types.js";

export type RuntimeSemanticMode = "off" | "auto" | "on";

export interface RuntimeCliArguments {
  command: "runtime";
  configPath?: string;
  mode: RuntimeMode;
  task: string;
  sopRunId?: string;
  resumeRunId?: string;
}

export interface SopCompactCliArguments {
  command: "sop-compact";
  configPath?: string;
  runId: string;
  semanticMode?: RuntimeSemanticMode;
}

export type CliArguments = RuntimeCliArguments | SopCompactCliArguments;

export function parseCliArguments(argv: string[]): CliArguments {
  if (argv[0] === "sop-compact") {
    return parseSopCompactArguments(argv.slice(1));
  }
  if (argv[0] === "sop-compact-hitl" || argv[0] === "sop-compact-clarify") {
    throw new Error(
      `${argv[0]} is archived. use \`sop-compact --run-id <run_id>\` on the interactive reasoning path instead.`
    );
  }
  return parseRuntimeArguments(argv);
}

export function parseRuntimeArguments(argv: string[]): RuntimeCliArguments {
  const taskParts: string[] = [];
  let configPath: string | undefined;
  let mode: RuntimeMode = "run";
  let sopRunId: string | undefined;
  let resumeRunId: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config" || arg === "-c") {
      configPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--config=")) {
      configPath = arg.slice("--config=".length);
      continue;
    }
    if (arg === "--mode" || arg === "-m") {
      mode = parseMode(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--mode=")) {
      mode = parseMode(arg.slice("--mode=".length));
      continue;
    }
    if (arg === "--sop-run-id") {
      sopRunId = argv[i + 1]?.trim();
      i += 1;
      continue;
    }
    if (arg.startsWith("--sop-run-id=")) {
      sopRunId = arg.slice("--sop-run-id=".length).trim();
      continue;
    }
    if (arg === "--resume-run-id") {
      resumeRunId = argv[i + 1]?.trim();
      i += 1;
      continue;
    }
    if (arg.startsWith("--resume-run-id=")) {
      resumeRunId = arg.slice("--resume-run-id=".length).trim();
      continue;
    }
    taskParts.push(arg);
  }
  return { command: "runtime", configPath, mode, task: taskParts.join(" ").trim(), sopRunId, resumeRunId };
}

export function parseSopCompactArguments(argv: string[]): SopCompactCliArguments {
  let configPath: string | undefined;
  let runId: string | undefined;
  let semanticMode: RuntimeSemanticMode | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config" || arg === "-c") {
      configPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--config=")) {
      configPath = arg.slice("--config=".length);
      continue;
    }
    if (arg === "--run-id" || arg === "-r") {
      runId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--run-id=")) {
      runId = arg.slice("--run-id=".length);
      continue;
    }
    if (arg === "--semantic" || arg === "-s") {
      semanticMode = parseSemanticMode(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--semantic=")) {
      semanticMode = parseSemanticMode(arg.slice("--semantic=".length));
      continue;
    }
    if (!runId) {
      runId = arg;
    }
  }
  if (!runId?.trim()) {
    throw new Error("missing run id. usage: sop-compact --run-id <run_id>");
  }
  return { command: "sop-compact", configPath, runId: runId.trim(), semanticMode };
}

function parseMode(value: string | undefined): RuntimeMode {
  if (value === "run" || value === "observe") {
    return value;
  }
  throw new Error(`invalid --mode value: ${value ?? "(missing)"}. expected run|observe`);
}

function parseSemanticMode(value: string | undefined): RuntimeSemanticMode {
  if (value === "off" || value === "auto" || value === "on") {
    return value;
  }
  throw new Error(`invalid --semantic value: ${value ?? "(missing)"}. expected off|auto|on`);
}
