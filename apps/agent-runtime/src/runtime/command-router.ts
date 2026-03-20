/**
 * Deps: domain/agent-types.ts
 * Used By: index.ts
 * Last Updated: 2026-03-21
 */
import type { RuntimeCliCommand } from "../domain/agent-types.js";

export type RuntimeSemanticMode = "off" | "auto" | "on";

export interface ObserveCliArguments {
  command: "observe";
  configPath?: string;
  task: string;
}

export interface RefineCliArguments {
  command: "refine";
  configPath?: string;
  task: string;
  resumeRunId?: string;
}

export interface SopCompactCliArguments {
  command: "sop-compact";
  configPath?: string;
  runId: string;
  semanticMode?: RuntimeSemanticMode;
}

export type CliArguments = ObserveCliArguments | RefineCliArguments | SopCompactCliArguments;

const LEGACY_RUNTIME_UPGRADE_MESSAGE =
  "legacy runtime CLI has been retired. use `observe \"task\"`, `refine \"task\"`, or `sop-compact --run-id <run_id>` instead.";

export function parseCliArguments(argv: string[]): CliArguments {
  if (hasLegacyRuntimeGrammar(argv)) {
    throw new Error(LEGACY_RUNTIME_UPGRADE_MESSAGE);
  }
  const command = argv[0] as RuntimeCliCommand | undefined;
  if (command === "observe") {
    return parseObserveArguments(argv.slice(1));
  }
  if (command === "refine") {
    return parseRefineArguments(argv.slice(1));
  }
  if (command === "sop-compact") {
    return parseSopCompactArguments(argv.slice(1));
  }
  if (command === "sop-compact-hitl" || command === "sop-compact-clarify") {
    throw new Error(
      `${command} is archived. use \`sop-compact --run-id <run_id>\` on the interactive reasoning path instead.`
    );
  }
  throw new Error(LEGACY_RUNTIME_UPGRADE_MESSAGE);
}

export function parseObserveArguments(argv: string[]): ObserveCliArguments {
  const { configPath, task } = parseTaskArguments(argv);
  return {
    command: "observe",
    configPath,
    task,
  };
}

export function parseRefineArguments(argv: string[]): RefineCliArguments {
  const { configPath, task, resumeRunId } = parseTaskArguments(argv);
  const result: RefineCliArguments = {
    command: "refine",
    configPath,
    task,
  };
  if (resumeRunId !== undefined) {
    result.resumeRunId = resumeRunId;
  }
  return result;
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

function parseTaskArguments(argv: string[]): { configPath?: string; task: string; resumeRunId?: string } {
  const taskParts: string[] = [];
  let configPath: string | undefined;
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
  return { configPath, task: taskParts.join(" ").trim(), resumeRunId };
}

function hasLegacyRuntimeGrammar(argv: string[]): boolean {
  if (argv[0] === "runtime") {
    return true;
  }
  return argv.some((arg) => arg === "--mode" || arg === "-m" || arg.startsWith("--mode="));
}

function parseSemanticMode(value: string | undefined): RuntimeSemanticMode {
  if (value === "off" || value === "auto" || value === "on") {
    return value;
  }
  throw new Error(`invalid --semantic value: ${value ?? "(missing)"}. expected off|auto|on`);
}
