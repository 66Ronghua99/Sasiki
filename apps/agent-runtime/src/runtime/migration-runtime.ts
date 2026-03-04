import type { AgentRunResult } from "../domain/agent-types.js";
import { PiAgentCoreLoop } from "../core/pi-agent-core-loop.js";
import { CdpBrowserLauncher } from "../infrastructure/browser/cdp-browser-launcher.js";
import { RunLogger } from "../infrastructure/logging/run-logger.js";
import { PlaywrightMcpStdioClient } from "../infrastructure/mcp/playwright-mcp-stdio-client.js";
import type { RuntimeConfig } from "./runtime-config.js";
import { RunArtifactsWriter } from "./run-artifacts-writer.js";

export class MigrationRuntime {
  private readonly config: RuntimeConfig;
  private readonly logger: RunLogger;
  private readonly cdpLauncher: CdpBrowserLauncher;
  private readonly loop: PiAgentCoreLoop;

  constructor(config: RuntimeConfig) {
    this.config = config;
    this.logger = new RunLogger();
    this.cdpLauncher = new CdpBrowserLauncher(
      {
        cdpEndpoint: config.cdpEndpoint,
        launchCdp: config.launchCdp,
        userDataDir: config.cdpUserDataDir,
        headless: config.cdpHeadless,
        injectCookies: config.cdpInjectCookies,
        cookiesDir: config.cdpCookiesDir,
        preferSystemBrowser: config.cdpPreferSystemBrowser,
        executablePath: config.cdpExecutablePath,
        startupTimeoutMs: config.cdpStartupTimeoutMs,
      },
      this.logger
    );
    const toolClient = new PlaywrightMcpStdioClient({
      command: config.mcpCommand,
      args: [...config.mcpArgs, "--cdp-endpoint", config.cdpEndpoint],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter((pair): pair is [string, string] => typeof pair[1] === "string")
        ),
        ...config.mcpEnv,
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
      this.logger
    );
  }

  async start(): Promise<void> {
    await this.cdpLauncher.start();
    await this.loop.initialize();
  }

  async run(task: string): Promise<AgentRunResult> {
    const runId = this.createRunId();
    const artifacts = new RunArtifactsWriter(this.config.artifactsDir, runId);
    await artifacts.ensureDir();
    this.logger.info("run_started", { runId, task, artifactsDir: artifacts.runDir });

    try {
      const baseResult = await this.loop.run(task);
      const finalScreenshotPath = await this.loop.captureFinalScreenshot(artifacts.finalScreenshotPath());
      await artifacts.writeSteps(baseResult.steps);
      await artifacts.writeMcpCalls(baseResult.mcpCalls);

      const result: AgentRunResult = {
        ...baseResult,
        runId,
        artifactsDir: artifacts.runDir,
        finalScreenshotPath,
      };

      if (result.mcpCalls.some((call) => call.phase === "end" && call.isError) && result.status === "completed") {
        result.status = "failed";
        result.finishReason = "mcp tool execution error";
      }

      if (!finalScreenshotPath && result.status === "completed") {
        result.status = "failed";
        result.finishReason = "final screenshot not captured";
      }

      this.logger.info("run_finished", {
        runId,
        status: result.status,
        finishReason: result.finishReason,
        steps: result.steps.length,
        mcpCalls: result.mcpCalls.length,
        finalScreenshotPath: result.finalScreenshotPath,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("run_failed", { runId, error: message });
      throw error;
    } finally {
      await artifacts.writeRuntimeLog(this.logger.toText());
    }
  }

  async stop(): Promise<void> {
    await this.loop.shutdown();
    await this.cdpLauncher.stop();
  }

  private createRunId(): string {
    const now = new Date();
    const parts = [
      now.getFullYear().toString().padStart(4, "0"),
      (now.getMonth() + 1).toString().padStart(2, "0"),
      now.getDate().toString().padStart(2, "0"),
      "_",
      now.getHours().toString().padStart(2, "0"),
      now.getMinutes().toString().padStart(2, "0"),
      now.getSeconds().toString().padStart(2, "0"),
      "_",
      now.getMilliseconds().toString().padStart(3, "0"),
    ];
    return parts.join("");
  }
}
