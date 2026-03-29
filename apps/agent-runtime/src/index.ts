/**
 * Deps: application/*, domain/agent-types.ts
 * Used By: npm scripts (dev/build runtime entry)
 * Last Updated: 2026-03-09
 */
import process from "node:process";
import { pathToFileURL } from "node:url";

import { parseCliArguments } from "./application/shell/command-router.js";
import { createProcessInterruptHandler } from "./application/shell/process-interrupt-handler.js";
import { loadRuntimeConfig } from "./application/shell/runtime-config-bootstrap.js";
import { RuntimeService } from "./application/shell/runtime-service.js";

export interface CliProcessLike {
  argv?: string[];
  stdout: {
    write(chunk: string): boolean;
  };
  stderr: {
    write(chunk: string): boolean;
  };
  on(event: "SIGINT" | "SIGTERM", listener: () => void): void;
  off(event: "SIGINT" | "SIGTERM", listener: () => void): void;
  exit(code?: number): never;
}

export interface RunCliMainDependencies {
  parseCliArguments?: typeof parseCliArguments;
  loadRuntimeConfig?: typeof loadRuntimeConfig;
  createRuntimeService?: (config: ReturnType<typeof loadRuntimeConfig>) => RuntimeService;
  processObject?: CliProcessLike;
}

export async function runCliMain(
  argv: string[],
  dependencies: RunCliMainDependencies = {}
): Promise<void> {
  const processObject = dependencies.processObject ?? (process as unknown as CliProcessLike);
  const parseArguments = dependencies.parseCliArguments ?? parseCliArguments;
  const loadConfig = dependencies.loadRuntimeConfig ?? loadRuntimeConfig;
  const args = parseArguments(argv);
  if (args.command === "observe" && !args.task) {
    printUsageAndExit(processObject);
    return;
  }
  if (args.command === "refine" && !args.task && !args.resumeRunId && !args.skillName) {
    printUsageAndExit(processObject);
    return;
  }

  const config = loadConfig({ configPath: args.configPath });
  const runtime = (dependencies.createRuntimeService ?? ((runtimeConfig) => new RuntimeService(runtimeConfig)))(config);
  const requestInterrupt = createProcessInterruptHandler({
    requestInterrupt: (signal) => runtime.requestInterrupt(signal),
    writeStderr: (message) => {
      processObject.stderr.write(message);
    },
    forceExit: (code) => {
      processObject.exit(code);
    },
  });
  const onSigint = (): void => {
    void requestInterrupt("SIGINT");
  };
  const onSigterm = (): void => {
    void requestInterrupt("SIGTERM");
  };
  processObject.on("SIGINT", onSigint);
  processObject.on("SIGTERM", onSigterm);

  try {
    const result = await runtime.runFromCliArguments(argv);
    processObject.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    processObject.off("SIGINT", onSigint);
    processObject.off("SIGTERM", onSigterm);
    await runtime.stop();
  }
}

function printUsageAndExit(processObject: CliProcessLike): void {
  processObject.stderr.write(
    "Usage:\n  npm run dev -- observe [--config path] \"your task\"\n  npm run dev -- refine [--config path] [--skill <name>] [--resume-run-id <run_id>] \"your task\"\n  npm run dev -- sop-compact list [--config path]\n  npm run dev -- sop-compact --run-id <run_id> [--semantic off|auto|on] [--config path]\n"
  );
  processObject.exit(1);
}

function isEntrypoint(metaUrl: string): boolean {
  const entryArg = process.argv[1];
  if (!entryArg) {
    return false;
  }
  return metaUrl === pathToFileURL(entryArg).href;
}

if (isEntrypoint(import.meta.url)) {
  runCliMain(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`runtime error: ${message}\n`);
    process.exit(1);
  });
}
