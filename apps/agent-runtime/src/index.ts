import { RuntimeConfigLoader } from "./runtime/runtime-config.js";
import { MigrationRuntime } from "./runtime/migration-runtime.js";

async function main(): Promise<void> {
  const task = process.argv.slice(2).join(" ").trim();
  if (!task) {
    process.stderr.write("Usage: npm run dev -- \"your task\"\n");
    process.exit(1);
  }

  const config = RuntimeConfigLoader.fromEnv();
  const runtime = new MigrationRuntime(config);

  try {
    await runtime.start();
    const result = await runtime.run(task);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await runtime.stop();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`runtime error: ${message}\n`);
  process.exit(1);
});
