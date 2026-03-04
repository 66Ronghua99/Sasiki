import type { AgentRunResult } from "../domain/agent-types.js";
import { AgentLoop } from "../core/agent-loop.js";
import { LoopPolicy } from "../core/loop-policy.js";
import { ConsoleLogger } from "../infrastructure/logging/console-logger.js";
import { PlaywrightMcpStdioClient } from "../infrastructure/mcp/playwright-mcp-stdio-client.js";
import { PiMonoPlanner } from "../infrastructure/planner/pi-mono-planner.js";
import type { RuntimeConfig } from "./runtime-config.js";

export class MigrationRuntime {
  private readonly loop: AgentLoop;

  constructor(config: RuntimeConfig) {
    const logger = new ConsoleLogger();
    const policy = new LoopPolicy();
    const planner = new PiMonoPlanner({
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
    const toolClient = new PlaywrightMcpStdioClient({
      command: config.mcpCommand,
      args: [...config.mcpArgs, "--cdp-endpoint", config.cdpEndpoint],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter((pair): pair is [string, string] => typeof pair[1] === "string")
        ),
        PLAYWRIGHT_MCP_CDP_ENDPOINT: config.cdpEndpoint,
      },
    });

    this.loop = new AgentLoop(planner, toolClient, policy, logger);
  }

  async start(): Promise<void> {
    await this.loop.initialize();
  }

  async run(task: string): Promise<AgentRunResult> {
    return this.loop.run(task);
  }

  async stop(): Promise<void> {
    await this.loop.shutdown();
  }
}
