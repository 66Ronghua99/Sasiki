/**
 * Deps: kernel/*, infrastructure/*, application/*
 * Used By: application/shell/workflow-runtime.ts
 * Last Updated: 2026-03-21
 */
import { CdpBrowserLauncher } from "../../infrastructure/browser/cdp-browser-launcher.js";
import { TerminalHitlController } from "../../infrastructure/hitl/terminal-hitl-controller.js";
import { FileAgentCheckpointWriter, createNoopAgentCheckpointWriter } from "../../infrastructure/persistence/agent-checkpoint-writer.js";
import { RuntimeLogger } from "../../infrastructure/logging/runtime-logger.js";
import { TerminalTelemetrySink } from "../../infrastructure/logging/terminal-telemetry-sink.js";
import { McpStdioClient } from "../../infrastructure/mcp/mcp-stdio-client.js";
import { RuntimeEventStreamWriter } from "../../infrastructure/persistence/runtime-event-stream-writer.js";
import { createCompactWorkflow } from "../compact/compact-workflow.js";
import { InteractiveSopCompactService } from "../compact/interactive-sop-compact.js";
import type { RuntimeSemanticMode } from "../config/runtime-config.js";
import type { ObserveWorkflow } from "../observe/observe-workflow.js";
import { createObserveWorkflowFactory } from "../observe/observe-workflow-factory.js";
import { PromptProvider, type RuntimePromptBundle } from "../refine/prompt-provider.js";
import {
  createRefineWorkflowAssembly,
  type RefineWorkflow,
  type RefineWorkflowRequest,
} from "../refine/refine-workflow.js";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { createRuntimeTelemetryRegistry } from "./runtime-telemetry-registry.js";
import type {
  RuntimeRunTelemetryArtifacts,
  RuntimeRunTelemetryScope,
  RuntimeTelemetryRegistry,
  RuntimeTelemetrySink,
} from "../../contracts/runtime-telemetry.js";

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
  telemetryRegistry: RuntimeTelemetryRegistry;
  observeWorkflowFactory: (taskHint: string) => ObserveWorkflow;
  refineWorkflowFactory: (request: RefineWorkflowRequest) => RefineWorkflow;
  compactWorkflowFactory: (request: CompactWorkflowRequest) => ReturnType<typeof createCompactWorkflow>;
}

export interface CompactWorkflowRequest {
  runId: string;
  semanticMode?: RuntimeSemanticMode;
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
  const logger = new RuntimeLogger();
  const telemetryRegistry = createRuntimeTelemetryRegistry({
    createSinks: (scope: RuntimeRunTelemetryScope) => {
      const sinks: RuntimeTelemetrySink[] = [new TerminalTelemetrySink(config.telemetry)];
      if (scope.workflow === "refine" && config.telemetry.artifactEventStreamEnabled) {
        sinks.unshift(new RuntimeEventStreamWriter(scope.artifactsDir));
      }
      return sinks;
    },
    createArtifacts: (scope: RuntimeRunTelemetryScope): RuntimeRunTelemetryArtifacts => {
      const checkpoints =
        scope.workflow === "refine" && config.telemetry.artifactCheckpointMode !== "off"
          ? new FileAgentCheckpointWriter(scope.artifactsDir)
          : createNoopAgentCheckpointWriter();

      return {
        scope,
        artifactsDir: scope.artifactsDir,
        checkpointMode: config.telemetry.artifactCheckpointMode,
        checkpoints,
        async dispose(): Promise<void> {
          await checkpoints.dispose();
        },
      };
    },
  });
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

  const hitlController = config.hitlEnabled ? new TerminalHitlController() : undefined;
  const createRunId = createRunIdFactory();
  const observeWorkflowFactory = createObserveWorkflowFactory({
    browserLifecycle,
    logger,
    cdpEndpoint: config.cdpEndpoint,
    observeTimeoutMs: config.observeTimeoutMs,
    artifactsDir: config.artifactsDir,
    createRunId,
    sopAssetRootDir: config.sopAssetRootDir,
    telemetryRegistry,
  });
  const refineAssembly = createRefineWorkflowAssembly({
    browserLifecycle,
    logger,
    rawToolClient,
    hitlController,
    createRunId,
    config,
    telemetryRegistry,
    refineSystemPrompt: plan.prompts.refineSystemPrompt,
  });

  return {
    browserLifecycle,
    telemetryRegistry,
    observeWorkflowFactory,
    refineWorkflowFactory: refineAssembly.createWorkflow,
    compactWorkflowFactory: (request: CompactWorkflowRequest) => {
      const compactSemanticMode = request.semanticMode ?? config.semanticMode;
      const compactService = new InteractiveSopCompactService(config.artifactsDir, {
        semantic: {
          mode: compactSemanticMode,
          timeoutMs: config.semanticTimeoutMs,
          model: config.model,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          thinkingLevel: config.thinkingLevel,
        },
        telemetryRegistry,
      });

      return createCompactWorkflow({
        service: compactService,
        runId: request.runId,
      });
    },
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
