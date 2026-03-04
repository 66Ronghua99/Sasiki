import type { AgentRunResult } from "../domain/agent-types.js";
import { PiAgentCoreLoop } from "../core/pi-agent-core-loop.js";
import { ConsoleLogger } from "../infrastructure/logging/console-logger.js";
import { PlaywrightMcpStdioClient } from "../infrastructure/mcp/playwright-mcp-stdio-client.js";
import type { RuntimeConfig } from "./runtime-config.js";

export class MigrationRuntime {
  private readonly loop: PiAgentCoreLoop;

  constructor(config: RuntimeConfig) {
    const logger = new ConsoleLogger();
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

    this.loop = new PiAgentCoreLoop(
      {
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      },
      toolClient,
      logger
    );
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
