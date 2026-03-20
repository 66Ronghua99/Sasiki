/**
 * Deps: runtime/*, domain/agent-types.ts
 * Used By: npm scripts (dev/build runtime entry)
 * Last Updated: 2026-03-09
 */
import process from "node:process";

import { parseCliArguments } from "./runtime/command-router.js";
import { WorkflowRuntime } from "./runtime/workflow-runtime.js";
import { RuntimeConfigLoader } from "./runtime/runtime-config.js";
import { InteractiveSopCompactService } from "./runtime/interactive-sop-compact.js";

async function main(): Promise<void> {
  const args = parseCliArguments(process.argv.slice(2));
  if (args.command === "sop-compact") {
    const config = RuntimeConfigLoader.fromSources({ configPath: args.configPath });
    const semanticMode = args.semanticMode ?? config.semanticMode;
    const service = new InteractiveSopCompactService(config.artifactsDir, {
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

  if (args.mode === "observe" && !args.task) {
    printUsageAndExit();
    return;
  }
  if (args.mode === "run" && !args.task && !args.sopRunId && !args.resumeRunId) {
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
            resumeRunId: args.resumeRunId,
          });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    await runtime.stop();
  }
}

function printUsageAndExit(): void {
  process.stderr.write(
    "Usage:\n  npm run dev -- [--config path] [--mode run|observe] [--sop-run-id <run_id>] [--resume-run-id <run_id>] \"your task\"\n  npm run dev -- --mode run --sop-run-id <run_id>\n  npm run dev -- --mode run --resume-run-id <run_id> [\"optional task\"]\n  npm run dev -- sop-compact --run-id <run_id> [--semantic off|auto|on] [--config path]\n"
  );
  process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`runtime error: ${message}\n`);
  process.exit(1);
});
