/**
 * Deps: core/*, domain/agent-types.ts, infrastructure/*, runtime/*
 * Used By: index.ts, runtime/agent-runtime.ts
 * Last Updated: 2026-03-06
 */
import { AgentLoop } from "../core/agent-loop.js";
import { SopDemonstrationRecorder } from "../core/sop-demonstration-recorder.js";
import type { AgentRunRequest, AgentRunResult, ObserveRunResult, RuntimeMode } from "../domain/agent-types.js";
import { CdpBrowserLauncher } from "../infrastructure/browser/cdp-browser-launcher.js";
import { PlaywrightDemonstrationRecorder } from "../infrastructure/browser/playwright-demonstration-recorder.js";
import { TerminalHitlController } from "../infrastructure/hitl/terminal-hitl-controller.js";
import { RuntimeLogger } from "../infrastructure/logging/runtime-logger.js";
import { McpStdioClient } from "../infrastructure/mcp/mcp-stdio-client.js";
import { AgentExecutionRuntime } from "./agent-execution-runtime.js";
import { ObserveExecutor } from "./observe-executor.js";
import { ObserveRuntime } from "./observe-runtime.js";
import { RunExecutor } from "./run-executor.js";
import type { RuntimeConfig } from "./runtime-config.js";
import { SopAssetStore } from "./sop-asset-store.js";
import { SopConsumptionContextBuilder } from "./sop-consumption-context.js";

export class WorkflowRuntime {
  private readonly cdpLauncher: CdpBrowserLauncher;
  private readonly agentRuntime: AgentExecutionRuntime;
  private readonly observeRuntime: ObserveRuntime;
  private started = false;

  constructor(config: RuntimeConfig) {
    const logger = new RuntimeLogger();
    this.cdpLauncher = new CdpBrowserLauncher(
      {
        cdpEndpoint: config.cdpEndpoint,
        launchCdp: config.launchCdp,
        userDataDir: config.cdpUserDataDir,
        resetPagesOnLaunch: config.cdpResetPagesOnLaunch,
        headless: config.cdpHeadless,
        injectCookies: config.cdpInjectCookies,
        cookiesDir: config.cdpCookiesDir,
        preferSystemBrowser: config.cdpPreferSystemBrowser,
        executablePath: config.cdpExecutablePath,
        startupTimeoutMs: config.cdpStartupTimeoutMs,
      },
      logger
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

    const loop = new AgentLoop(
      {
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        thinkingLevel: config.thinkingLevel,
      },
      toolClient,
      logger
    );

    const sopAssetStore = new SopAssetStore(config.sopAssetRootDir);
    const sopConsumptionContext = new SopConsumptionContextBuilder({
      enabled: config.sopConsumptionEnabled,
      topN: config.sopConsumptionTopN,
      hintsLimit: config.sopConsumptionHintsLimit,
      maxGuideChars: config.sopConsumptionMaxGuideChars,
      assetStore: sopAssetStore,
    });

    const runExecutor = new RunExecutor({
      loop,
      logger,
      artifactsDir: config.artifactsDir,
      createRunId: () => this.createRunId(),
      sopConsumptionContext,
      hitlController: config.hitlEnabled ? new TerminalHitlController() : undefined,
      hitlRetryLimit: config.hitlRetryLimit,
      hitlMaxInterventions: config.hitlMaxInterventions,
    });

    const sopRecorder = new SopDemonstrationRecorder();
    const observeExecutor = new ObserveExecutor({
      logger,
      cdpEndpoint: config.cdpEndpoint,
      observeTimeoutMs: config.observeTimeoutMs,
      artifactsDir: config.artifactsDir,
      createRunId: () => this.createRunId(),
      sopRecorder,
      sopAssetStore,
      createRecorder: () => new PlaywrightDemonstrationRecorder(),
    });

    this.agentRuntime = new AgentExecutionRuntime({ loop, runExecutor });
    this.observeRuntime = new ObserveRuntime({ observeExecutor });
  }

  async start(mode: RuntimeMode = "run"): Promise<void> {
    if (!this.started) {
      await this.cdpLauncher.start();
      this.started = true;
    }
    if (mode === "observe") {
      await this.cdpLauncher.prepareObserveSession();
    }
    if (mode === "run") {
      await this.agentRuntime.start();
    }
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    return this.agentRuntime.run(request);
  }

  async observe(taskHint: string): Promise<ObserveRunResult> {
    return this.observeRuntime.observe(taskHint);
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<void> {
    if (await this.observeRuntime.requestInterrupt(signalName)) {
      return;
    }
    await this.agentRuntime.requestInterrupt(signalName);
  }

  async stop(): Promise<void> {
    await this.agentRuntime.stop();
    if (!this.started) {
      return;
    }
    await this.cdpLauncher.stop();
    this.started = false;
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
