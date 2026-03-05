/**
 * Deps: runtime/*, domain/agent-types.ts
 * Used By: npm scripts (dev/build runtime entry)
 * Last Updated: 2026-03-05
 */
import type { RuntimeMode } from "./domain/agent-types.js";
import type { SemanticMode } from "./core/semantic-compactor.js";
import { AgentRuntime } from "./runtime/agent-runtime.js";
import { RuntimeConfigLoader } from "./runtime/runtime-config.js";
import { SopCompactService } from "./runtime/sop-compact.js";

interface RuntimeCliArguments {
  command: "runtime";
  configPath?: string;
  mode: RuntimeMode;
  task: string;
}

interface SopCompactCliArguments {
  command: "sop-compact";
  configPath?: string;
  runId: string;
  semanticMode?: SemanticMode;
}

type CliArguments = RuntimeCliArguments | SopCompactCliArguments;

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

  if (!args.task) {
    printUsageAndExit();
    return;
  }

  const config = RuntimeConfigLoader.fromSources({ configPath: args.configPath });
  const runtime = new AgentRuntime(config);
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
    const result = args.mode === "observe" ? await runtime.observe(args.task) : await runtime.run(args.task);
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
  return parseRuntimeArguments(argv);
}

function parseRuntimeArguments(argv: string[]): RuntimeCliArguments {
  const taskParts: string[] = [];
  let configPath: string | undefined;
  let mode: RuntimeMode = "run";
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
    taskParts.push(arg);
  }
  return { command: "runtime", configPath, mode, task: taskParts.join(" ").trim() };
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

function printUsageAndExit(): void {
  process.stderr.write(
    "Usage:\n  npm run dev -- [--config path] [--mode run|observe] \"your task\"\n  npm run dev -- sop-compact --run-id <run_id> [--semantic off|auto|on] [--config path]\n"
  );
  process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`runtime error: ${message}\n`);
  process.exit(1);
});
