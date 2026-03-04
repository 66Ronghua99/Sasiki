/**
 * Deps: runtime/runtime-config.ts, runtime/agent-runtime.ts, domain/agent-types.ts
 * Used By: npm scripts (dev/build runtime entry)
 * Last Updated: 2026-03-04
 */
import type { RuntimeMode } from "./domain/agent-types.js";
import { AgentRuntime } from "./runtime/agent-runtime.js";
import { RuntimeConfigLoader } from "./runtime/runtime-config.js";

interface CliArguments {
  configPath?: string;
  mode: RuntimeMode;
  task: string;
}

async function main(): Promise<void> {
  const args = parseCliArguments(process.argv.slice(2));
  if (!args.task) {
    process.stderr.write(
      "Usage: npm run dev -- [--config path/to/runtime.config.json] [--mode run|observe] \"your task\"\n"
    );
    process.exit(1);
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
  return { configPath, mode, task: taskParts.join(" ").trim() };
}

function parseMode(value: string | undefined): RuntimeMode {
  if (value === "run" || value === "observe") {
    return value;
  }
  throw new Error(`invalid --mode value: ${value ?? "(missing)"}. expected run|observe`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`runtime error: ${message}\n`);
  process.exit(1);
});
