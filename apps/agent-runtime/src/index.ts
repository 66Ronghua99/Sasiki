/**
 * Deps: runtime/*, domain/agent-types.ts
 * Used By: npm scripts (dev/build runtime entry)
 * Last Updated: 2026-03-06
 */
import type { RuntimeMode } from "./domain/agent-types.js";
import type { SemanticMode } from "./core/semantic-compactor.js";
import { WorkflowRuntime } from "./runtime/workflow-runtime.js";
import { RuntimeConfigLoader } from "./runtime/runtime-config.js";
import { SopCompactService } from "./runtime/sop-compact.js";
import { SopCompactHitlService } from "./runtime/sop-compact-hitl.js";

interface RuntimeCliArguments {
  command: "runtime";
  configPath?: string;
  mode: RuntimeMode;
  task: string;
  sopRunId?: string;
}

interface SopCompactCliArguments {
  command: "sop-compact";
  configPath?: string;
  runId: string;
  semanticMode?: SemanticMode;
}

interface SopCompactHitlCliArguments {
  command: "sop-compact-hitl";
  configPath?: string;
  runId: string;
  updates: Array<{ field: string; value: boolean | string }>;
  notes: string[];
  rerun: boolean;
}

type CliArguments = RuntimeCliArguments | SopCompactCliArguments | SopCompactHitlCliArguments;

async function main(): Promise<void> {
  const args = parseCliArguments(process.argv.slice(2));
  if (args.command === "sop-compact") {
    const config = RuntimeConfigLoader.fromSources({ configPath: args.configPath });
    const semanticMode = args.semanticMode ?? config.semanticMode;
    const service = new SopCompactService(config.artifactsDir, {
      semantic: {
        mode: semanticMode,
        timeoutMs: config.semanticTimeoutMs,
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        thinkingLevel: config.thinkingLevel,
      },
    });
    const result = await service.compact(args.runId);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (args.command === "sop-compact-hitl") {
    const config = RuntimeConfigLoader.fromSources({ configPath: args.configPath });
    const service = new SopCompactHitlService(config.artifactsDir, {
      mode: config.semanticMode,
      timeoutMs: config.semanticTimeoutMs,
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      thinkingLevel: config.thinkingLevel,
    });
    const result =
      args.updates.length === 0 && args.notes.length === 0 && !args.rerun
        ? await service.inspect(args.runId)
        : await service.resolve({
            runId: args.runId,
            resolvedFields: Object.fromEntries(args.updates.map((item) => [item.field, item.value])),
            notes: args.notes,
            rerun: args.rerun,
          });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (args.mode === "observe" && !args.task) {
    printUsageAndExit();
    return;
  }
  if (args.mode === "run" && !args.task && !args.sopRunId) {
    printUsageAndExit();
    return;
  }

  const config = RuntimeConfigLoader.fromSources({ configPath: args.configPath });
  const runtime = new WorkflowRuntime(config);
  let interrupting = false;
  const requestInterrupt = (signal: "SIGINT" | "SIGTERM"): void => {
    if (interrupting) {
      process.stderr.write(`Force exiting after repeated ${signal}.\n`);
      process.exit(130);
      return;
    }
    interrupting = true;
    process.stderr.write(`Received ${signal}, requesting graceful stop and flushing logs...\n`);
    void runtime.requestInterrupt(signal);
  };
  const onSigint = (): void => requestInterrupt("SIGINT");
  const onSigterm = (): void => requestInterrupt("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    await runtime.start(args.mode);
    const result =
      args.mode === "observe"
        ? await runtime.observe(args.task)
        : await runtime.run({
            task: args.task,
            sopRunId: args.sopRunId,
          });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    await runtime.stop();
  }
}

function parseCliArguments(argv: string[]): CliArguments {
  if (argv[0] === "sop-compact") {
    return parseSopCompactArguments(argv.slice(1));
  }
  if (argv[0] === "sop-compact-hitl") {
    return parseSopCompactHitlArguments(argv.slice(1));
  }
  return parseRuntimeArguments(argv);
}

function parseRuntimeArguments(argv: string[]): RuntimeCliArguments {
  const taskParts: string[] = [];
  let configPath: string | undefined;
  let mode: RuntimeMode = "run";
  let sopRunId: string | undefined;
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
    taskParts.push(arg);
  }
  return { command: "runtime", configPath, mode, task: taskParts.join(" ").trim(), sopRunId };
}

function parseSopCompactArguments(argv: string[]): SopCompactCliArguments {
  let configPath: string | undefined;
  let runId: string | undefined;
  let semanticMode: SemanticMode | undefined;
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

function parseSopCompactHitlArguments(argv: string[]): SopCompactHitlCliArguments {
  let configPath: string | undefined;
  let runId: string | undefined;
  const updates: Array<{ field: string; value: boolean | string }> = [];
  const notes: string[] = [];
  let rerun = false;
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
    if (arg === "--set") {
      updates.push(parseResolutionUpdate(argv[i + 1]));
      i += 1;
      continue;
    }
    if (arg.startsWith("--set=")) {
      updates.push(parseResolutionUpdate(arg.slice("--set=".length)));
      continue;
    }
    if (arg === "--note") {
      notes.push((argv[i + 1] ?? "").trim());
      i += 1;
      continue;
    }
    if (arg.startsWith("--note=")) {
      notes.push(arg.slice("--note=".length).trim());
      continue;
    }
    if (arg === "--rerun") {
      rerun = true;
      continue;
    }
    if (!runId) {
      runId = arg;
    }
  }
  if (!runId?.trim()) {
    throw new Error("missing run id. usage: sop-compact-hitl --run-id <run_id>");
  }
  return {
    command: "sop-compact-hitl",
    configPath,
    runId: runId.trim(),
    updates: updates.filter((item) => item.field.length > 0),
    notes: notes.filter((item) => item.length > 0),
    rerun,
  };
}

function parseMode(value: string | undefined): RuntimeMode {
  if (value === "run" || value === "observe") {
    return value;
  }
  throw new Error(`invalid --mode value: ${value ?? "(missing)"}. expected run|observe`);
}

function parseSemanticMode(value: string | undefined): SemanticMode {
  if (value === "off" || value === "auto" || value === "on") {
    return value;
  }
  throw new Error(`invalid --semantic value: ${value ?? "(missing)"}. expected off|auto|on`);
}

function parseResolutionUpdate(value: string | undefined): { field: string; value: boolean | string } {
  const raw = value?.trim() ?? "";
  const separatorIndex = raw.indexOf("=");
  if (separatorIndex <= 0) {
    throw new Error(`invalid --set value: ${value ?? "(missing)"}. expected field=value`);
  }
  const field = raw.slice(0, separatorIndex).trim();
  const serializedValue = raw.slice(separatorIndex + 1).trim();
  if (!field || !serializedValue) {
    throw new Error(`invalid --set value: ${value ?? "(missing)"}. expected field=value`);
  }
  if (serializedValue === "true") {
    return { field, value: true };
  }
  if (serializedValue === "false") {
    return { field, value: false };
  }
  return { field, value: serializedValue };
}

function printUsageAndExit(): void {
  process.stderr.write(
    "Usage:\n  npm run dev -- [--config path] [--mode run|observe] [--sop-run-id <run_id>] \"your task\"\n  npm run dev -- --mode run --sop-run-id <run_id>\n  npm run dev -- sop-compact --run-id <run_id> [--semantic off|auto|on] [--config path]\n  npm run dev -- sop-compact-hitl --run-id <run_id> [--set field=value] [--note text] [--rerun] [--config path]\n"
  );
  process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`runtime error: ${message}\n`);
  process.exit(1);
});
