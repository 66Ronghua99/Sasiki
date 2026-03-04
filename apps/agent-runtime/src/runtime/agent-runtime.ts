/**
 * Deps: core/agent-loop.ts, infrastructure/*, runtime/*
 * Used By: index.ts
 * Last Updated: 2026-03-04
 */
import type { AgentRunResult } from "../domain/agent-types.js";
import { AgentLoop } from "../core/agent-loop.js";
import { CdpBrowserLauncher } from "../infrastructure/browser/cdp-browser-launcher.js";
import { RuntimeLogger } from "../infrastructure/logging/runtime-logger.js";
import { McpStdioClient } from "../infrastructure/mcp/mcp-stdio-client.js";
import type { RuntimeConfig } from "./runtime-config.js";
import { ArtifactsWriter } from "./artifacts-writer.js";

export class AgentRuntime {
  private readonly config: RuntimeConfig;
  private readonly logger: RuntimeLogger;
  private readonly cdpLauncher: CdpBrowserLauncher;
  private readonly loop: AgentLoop;
  private activeRun:
    | {
        runId: string;
        artifacts: ArtifactsWriter;
      }
    | null = null;
  private flushPromise: Promise<void> | null = null;

  constructor(config: RuntimeConfig) {
    this.config = config;
    this.logger = new RuntimeLogger();
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
    const toolClient = new McpStdioClient({
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

    this.loop = new AgentLoop(
      {
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        thinkingLevel: config.thinkingLevel,
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
    const artifacts = new ArtifactsWriter(this.config.artifactsDir, runId);
    await artifacts.ensureDir();
    this.activeRun = { runId, artifacts };
    this.logger.info("run_started", { runId, task, artifactsDir: artifacts.runDir });

    try {
      const baseResult = await this.loop.run(task);
      const finalScreenshotPath = await this.loop.captureFinalScreenshot(artifacts.finalScreenshotPath());
      await artifacts.writeSteps(baseResult.steps);
      await artifacts.writeMcpCalls(baseResult.mcpCalls);
      await artifacts.writeAssistantTurns(baseResult.assistantTurns);

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
        assistantTurns: result.assistantTurns.length,
        finalScreenshotPath: result.finalScreenshotPath,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("run_failed", { runId, error: message });
      throw error;
    } finally {
      await artifacts.writeRuntimeLog(this.logger.toText());
      this.activeRun = null;
    }
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<void> {
    if (!this.activeRun) {
      return;
    }
    this.logger.warn("run_interrupt_requested", {
      signal: signalName,
      runId: this.activeRun.runId,
    });
    this.loop.abort(`signal:${signalName}`);
    await this.flushInProgressArtifacts("interrupt_requested");
  }

  async stop(): Promise<void> {
    await this.loop.shutdown();
    await this.cdpLauncher.stop();
  }

  private async flushInProgressArtifacts(reason: string): Promise<void> {
    if (!this.activeRun) {
      return;
    }
    if (!this.flushPromise) {
      this.flushPromise = this.flushInProgressArtifactsInternal(reason).finally(() => {
        this.flushPromise = null;
      });
    }
    await this.flushPromise;
  }

  private async flushInProgressArtifactsInternal(reason: string): Promise<void> {
    if (!this.activeRun) {
      return;
    }
    try {
      const snapshot = this.loop.snapshotProgress();
      await this.activeRun.artifacts.writeSteps(snapshot.steps);
      await this.activeRun.artifacts.writeMcpCalls(snapshot.mcpCalls);
      await this.activeRun.artifacts.writeAssistantTurns(snapshot.assistantTurns);
      await this.activeRun.artifacts.writeRuntimeLog(this.logger.toText());
      this.logger.info("run_interrupt_flushed", {
        runId: this.activeRun.runId,
        reason,
        steps: snapshot.steps.length,
        mcpCalls: snapshot.mcpCalls.length,
        assistantTurns: snapshot.assistantTurns.length,
      });
    } catch (error) {
      this.logger.warn("run_interrupt_flush_failed", {
        runId: this.activeRun.runId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
