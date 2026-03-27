/**
 * Deps: application/*, domain/agent-types.ts
 * Used By: npm scripts (dev/build runtime entry)
 * Last Updated: 2026-03-09
 */
import process from "node:process";

import { parseCliArguments } from "./application/shell/command-router.js";
import { WorkflowRuntime } from "./application/shell/workflow-runtime.js";
import { createProcessInterruptHandler } from "./application/shell/process-interrupt-handler.js";
import { loadRuntimeConfig } from "./application/shell/runtime-config-bootstrap.js";

async function main(): Promise<void> {
  const args = parseCliArguments(process.argv.slice(2));
  if (args.command === "observe" && !args.task) {
    printUsageAndExit();
    return;
  }
  if (args.command === "refine" && !args.task && !args.resumeRunId && !args.skillName) {
    printUsageAndExit();
    return;
  }

  const config = loadRuntimeConfig({ configPath: args.configPath });
  const runtime = new WorkflowRuntime(config);
  const requestInterrupt = createProcessInterruptHandler({
    requestInterrupt: (signal) => runtime.requestInterrupt(signal),
    writeStderr: (message) => {
      process.stderr.write(message);
    },
    forceExit: (code) => {
      process.exit(code);
    },
  });
  const onSigint = (): void => {
    void requestInterrupt("SIGINT");
  };
  const onSigterm = (): void => {
    void requestInterrupt("SIGTERM");
  };
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    const result = await runtime.execute(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    await runtime.stop();
  }
}

function printUsageAndExit(): void {
  process.stderr.write(
    "Usage:\n  npm run dev -- observe [--config path] \"your task\"\n  npm run dev -- refine [--config path] [--skill <name>] [--resume-run-id <run_id>] \"your task\"\n  npm run dev -- sop-compact list [--config path]\n  npm run dev -- sop-compact --run-id <run_id> [--semantic off|auto|on] [--config path]\n"
  );
  process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`runtime error: ${message}\n`);
  process.exit(1);
});
