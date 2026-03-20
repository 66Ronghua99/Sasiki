/**
 * Deps: core/*, infrastructure/*, runtime/*
 * Used By: runtime/workflow-runtime.ts
 * Last Updated: 2026-03-20
 */
import { AgentLoop } from "../core/agent-loop.js";
import { SopDemonstrationRecorder } from "../core/sop-demonstration-recorder.js";
import { CdpBrowserLauncher } from "../infrastructure/browser/cdp-browser-launcher.js";
import { PlaywrightDemonstrationRecorder } from "../infrastructure/browser/playwright-demonstration-recorder.js";
import { TerminalHitlController } from "../infrastructure/hitl/terminal-hitl-controller.js";
import { RuntimeLogger } from "../infrastructure/logging/runtime-logger.js";
import { McpStdioClient } from "../infrastructure/mcp/mcp-stdio-client.js";
import { AgentExecutionRuntime } from "./agent-execution-runtime.js";
import { ObserveExecutor } from "./observe-executor.js";
import { ObserveRuntime } from "./observe-runtime.js";
import { ExecutionContextProvider } from "./providers/execution-context-provider.js";
import { LegacyRunBootstrapProvider } from "./providers/legacy-run-bootstrap-provider.js";
import { PromptProvider, type RuntimePromptBundle } from "./providers/prompt-provider.js";
import { RefineRunBootstrapProvider } from "./providers/refine-run-bootstrap-provider.js";
import { ToolSurfaceProvider } from "./providers/tool-surface-provider.js";
import { ReactRefinementRunExecutor } from "./replay-refinement/react-refinement-run-executor.js";
import { RunExecutor } from "./run-executor.js";
import type { RuntimeConfig } from "./runtime-config.js";

export interface RuntimeCompositionPlanInput {
  refinementEnabled: boolean;
  runSystemPrompt?: string;
  refineSystemPrompt?: string;
}

export interface RuntimeCompositionPlan {
  runExecutorKind: "legacy" | "refine";
  toolSurfaceKind: "raw" | "refine-react";
  prompts: RuntimePromptBundle;
}

export interface BrowserLifecycle {
  start(): Promise<unknown>;
  stop(): Promise<void>;
  prepareObserveSession(): Promise<void>;
}

export interface RuntimeComposition {
  browserLifecycle: BrowserLifecycle;
  agentRuntime: AgentExecutionRuntime;
  observeRuntime: ObserveRuntime;
}

export function planRuntimeComposition(input: RuntimeCompositionPlanInput): RuntimeCompositionPlan {
  const prompts = new PromptProvider().resolve(input);
  return {
    runExecutorKind: input.refinementEnabled ? "refine" : "legacy",
    toolSurfaceKind: input.refinementEnabled ? "refine-react" : "raw",
    prompts,
  };
}

export function createRuntimeComposition(config: RuntimeConfig): RuntimeComposition {
  const plan = planRuntimeComposition(config);
  const promptProvider = new PromptProvider();
  const logger = new RuntimeLogger();
  const browserLifecycle = new CdpBrowserLauncher(
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

  const rawToolClient = new McpStdioClient({
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

  const toolSurface = new ToolSurfaceProvider().select({
    rawClient: rawToolClient,
    refinementEnabled: config.refinementEnabled,
  });

  const hitlController = config.hitlEnabled ? new TerminalHitlController() : undefined;
  const executionContextProvider = new ExecutionContextProvider();
  const runContext = executionContextProvider.createLegacyRunContext(config);
  const refinementContext = executionContextProvider.createRefinementContext(config);

  const runLoop = new AgentLoop(
    {
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      thinkingLevel: config.thinkingLevel,
      systemPrompt:
        plan.runExecutorKind === "refine" ? plan.prompts.refineSystemPrompt : plan.prompts.runSystemPrompt,
    },
    toolSurface.runToolClient,
    logger
  );

  const createRunId = createRunIdFactory();
  const runExecutor =
    plan.runExecutorKind === "refine"
      ? new ReactRefinementRunExecutor({
          loop: runLoop,
          logger,
          artifactsDir: config.artifactsDir,
          maxTurns: config.refinementMaxRounds,
          toolClient: toolSurface.refineToolClient!,
          hitlController,
          knowledgeStore: refinementContext.knowledgeStore,
          bootstrapProvider: new RefineRunBootstrapProvider({
            createRunId,
            guidanceLoader: refinementContext.guidanceLoader,
            hitlResumeStore: refinementContext.hitlResumeStore,
            promptProvider,
            knowledgeTopN: config.refinementKnowledgeTopN,
          }),
        })
      : new RunExecutor({
          loop: runLoop,
          logger,
          artifactsDir: config.artifactsDir,
          createRunId,
          bootstrapProvider: new LegacyRunBootstrapProvider({
            consumptionContext: runContext.sopConsumptionContext,
          }),
          hitlController,
          hitlRetryLimit: config.hitlRetryLimit,
          hitlMaxInterventions: config.hitlMaxInterventions,
        });

  if (config.refinementEnabled) {
    logger.info("refinement_runtime_enabled", {
      refinementMode: config.refinementMode,
      refinementMaxRounds: config.refinementMaxRounds,
      refinementTokenBudget: config.refinementTokenBudget,
      refinementKnowledgeTopN: config.refinementKnowledgeTopN,
    });
    logger.info("refinement_mode_ignored", {
      refinementMode: config.refinementMode,
      note: "refinementMode is retained only for config compatibility and is ignored in react refinement path",
    });
  }

  const observeExecutor = new ObserveExecutor({
    logger,
    cdpEndpoint: config.cdpEndpoint,
    observeTimeoutMs: config.observeTimeoutMs,
    artifactsDir: config.artifactsDir,
    createRunId,
    sopRecorder: new SopDemonstrationRecorder(),
    sopAssetStore: runContext.sopAssetStore,
    createRecorder: () => new PlaywrightDemonstrationRecorder(),
  });

  return {
    browserLifecycle,
    agentRuntime: new AgentExecutionRuntime({ loop: runLoop, runExecutor }),
    observeRuntime: new ObserveRuntime({ observeExecutor }),
  };
}

function createRunIdFactory(): () => string {
  return () => {
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
  };
}
