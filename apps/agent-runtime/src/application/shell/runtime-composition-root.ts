/**
 * Deps: kernel/*, infrastructure/*, application/*
 * Used By: application/shell/workflow-runtime.ts
 * Last Updated: 2026-03-21
 */
import { AgentLoop } from "../../kernel/agent-loop.js";
import { SopDemonstrationRecorder } from "../../runtime/observe-support/sop-demonstration-recorder.js";
import { CdpBrowserLauncher } from "../../infrastructure/browser/cdp-browser-launcher.js";
import { PlaywrightDemonstrationRecorder } from "../../infrastructure/browser/playwright-demonstration-recorder.js";
import { TerminalHitlController } from "../../infrastructure/hitl/terminal-hitl-controller.js";
import { RuntimeLogger } from "../../infrastructure/logging/runtime-logger.js";
import { McpStdioClient } from "../../infrastructure/mcp/mcp-stdio-client.js";
import { AgentExecutionRuntime } from "../../runtime/agent-execution-runtime.js";
import { ObserveExecutor } from "../../runtime/observe-executor.js";
import { ObserveRuntime } from "../../runtime/observe-runtime.js";
import { ExecutionContextProvider } from "../providers/execution-context-provider.js";
import { PromptProvider, type RuntimePromptBundle } from "../../runtime/providers/prompt-provider.js";
import { RefineRunBootstrapProvider } from "../../runtime/providers/refine-run-bootstrap-provider.js";
import { ToolSurfaceProvider } from "../providers/tool-surface-provider.js";
import { ReactRefinementRunExecutor } from "../../runtime/replay-refinement/react-refinement-run-executor.js";
import type { RuntimeConfig } from "../config/runtime-config.js";

export interface RuntimeCompositionPlanInput {
  refinementEnabled: boolean;
  runSystemPrompt?: string;
  refineSystemPrompt?: string;
}

export interface RuntimeCompositionPlan {
  runExecutorKind: "refine";
  toolSurfaceKind: "refine-react";
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
    runExecutorKind: "refine",
    toolSurfaceKind: "refine-react",
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

  const toolSurface = new ToolSurfaceProvider().select({ rawClient: rawToolClient });

  const hitlController = config.hitlEnabled ? new TerminalHitlController() : undefined;
  const executionContextProvider = new ExecutionContextProvider();
  const observeContext = executionContextProvider.createObserveContext(config);
  const refinementContext = executionContextProvider.createRefinementContext(config);

  const runLoop = new AgentLoop(
    {
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      thinkingLevel: config.thinkingLevel,
      systemPrompt: plan.prompts.refineSystemPrompt,
    },
    toolSurface.runToolClient,
    logger
  );

  const createRunId = createRunIdFactory();
  const runExecutor = new ReactRefinementRunExecutor({
    loop: runLoop,
    logger,
    artifactsDir: config.artifactsDir,
    maxTurns: config.refinementMaxRounds,
    toolClient: toolSurface.refineToolClient,
    hitlController,
    knowledgeStore: refinementContext.knowledgeStore,
    bootstrapProvider: new RefineRunBootstrapProvider({
      createRunId,
      guidanceLoader: refinementContext.guidanceLoader,
      hitlResumeStore: refinementContext.hitlResumeStore,
      promptProvider,
      knowledgeTopN: config.refinementKnowledgeTopN,
    }),
  });

  const observeExecutor = new ObserveExecutor({
    logger,
    cdpEndpoint: config.cdpEndpoint,
    observeTimeoutMs: config.observeTimeoutMs,
    artifactsDir: config.artifactsDir,
    createRunId,
    sopRecorder: new SopDemonstrationRecorder(),
    sopAssetStore: observeContext.sopAssetStore,
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
