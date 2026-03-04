import { RuntimeConfigLoader } from "./runtime/runtime-config.js";
import { MigrationRuntime } from "./runtime/migration-runtime.js";

interface CliArguments {
  configPath?: string;
  task: string;
}

async function main(): Promise<void> {
  const args = parseCliArguments(process.argv.slice(2));
  if (!args.task) {
    process.stderr.write("Usage: npm run dev -- [--config path/to/runtime.config.json] \"your task\"\n");
    process.exit(1);
  }

  const config = RuntimeConfigLoader.fromSources({ configPath: args.configPath });
  const runtime = new MigrationRuntime(config);

  try {
    await runtime.start();
    const result = await runtime.run(args.task);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await runtime.stop();
  }
}

function parseCliArguments(argv: string[]): CliArguments {
  const taskParts: string[] = [];
  let configPath: string | undefined;
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
    taskParts.push(arg);
  }
  return { configPath, task: taskParts.join(" ").trim() };
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`runtime error: ${message}\n`);
  process.exit(1);
});
