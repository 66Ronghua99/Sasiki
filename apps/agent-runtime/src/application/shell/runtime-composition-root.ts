/**
 * Deps: kernel/*, infrastructure/*, application/*
 * Used By: application/shell/workflow-runtime.ts
 * Last Updated: 2026-03-21
 */
import path from "node:path";

import { CdpBrowserLauncher } from "../../infrastructure/browser/cdp-browser-launcher.js";
import { PlaywrightDemonstrationRecorder } from "../../infrastructure/browser/playwright-demonstration-recorder.js";
import { TerminalHitlController } from "../../infrastructure/hitl/terminal-hitl-controller.js";
import { TerminalCompactHumanLoopTool } from "../../infrastructure/hitl/terminal-compact-human-loop-tool.js";
import {
  parseScriptedCompactReplies,
  ScriptedCompactHumanLoopTool,
} from "../../infrastructure/hitl/scripted-compact-human-loop-tool.js";
import { JsonModelClient } from "../../infrastructure/llm/json-model-client.js";
import { ModelResolver } from "../../infrastructure/llm/model-resolver.js";
import { FileAgentCheckpointWriter, createNoopAgentCheckpointWriter } from "../../infrastructure/persistence/agent-checkpoint-writer.js";
import { RuntimeLogger } from "../../infrastructure/logging/runtime-logger.js";
import { TerminalTelemetrySink } from "../../infrastructure/logging/terminal-telemetry-sink.js";
import { McpStdioClient } from "../../infrastructure/mcp/mcp-stdio-client.js";
import { RuntimeEventStreamWriter } from "../../infrastructure/persistence/runtime-event-stream-writer.js";
import { ArtifactsWriter } from "../../infrastructure/persistence/artifacts-writer.js";
import { AttentionKnowledgeStore } from "../../infrastructure/persistence/attention-knowledge-store.js";
import { RefineHitlResumeStore } from "../../infrastructure/persistence/refine-hitl-resume-store.js";
import { SopAssetStore } from "../../infrastructure/persistence/sop-asset-store.js";
import { SopSkillStore } from "../../infrastructure/persistence/sop-skill-store.js";
import { createCompactWorkflow } from "../compact/compact-workflow.js";
import { InteractiveSopCompactService } from "../compact/interactive-sop-compact.js";
import type { RuntimeSemanticMode } from "../config/runtime-config.js";
import type { ObserveWorkflow } from "../observe/observe-workflow.js";
import { createObserveWorkflowFactory } from "../observe/observe-workflow-factory.js";
import { PromptProvider, type RuntimePromptBundle } from "../refine/prompt-provider.js";
import { AttentionGuidanceLoader } from "../refine/attention-guidance-loader.js";
import {
  createRefineWorkflowAssembly,
  type RefineWorkflow,
  type RefineWorkflowRequest,
} from "../refine/refine-workflow.js";
import { createRefineToolComposition } from "../refine/tools/refine-tool-composition.js";
import { type RefinePersistenceContext } from "../refine/refine-run-bootstrap-provider.js";
import type { RuntimeConfig } from "../config/runtime-config.js";
import { createRuntimeTelemetryRegistry } from "./runtime-telemetry-registry.js";
import type {
  RuntimeRunTelemetryArtifacts,
  RuntimeRunTelemetryScope,
  RuntimeTelemetryRegistry,
  RuntimeTelemetrySink,
} from "../../contracts/runtime-telemetry.js";
import type { SopSkillMetadata } from "../../domain/sop-skill.js";
import type { CompactHumanLoopTool } from "../../contracts/compact-human-loop-tool.js";

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
  listSopSkills: () => Promise<SopSkillMetadata[]>;
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
  const resolvedRefineModel = ModelResolver.resolve({
    model: config.model,
    baseUrl: config.baseUrl,
  });
  const createObserveArtifactsWriter = (runId: string) => new ArtifactsWriter(config.artifactsDir, runId);
  const createCompactArtifactsWriter = (runId: string) => new ArtifactsWriter(config.artifactsDir, runId);
  const createRefineArtifactsWriter = (runId: string) => new ArtifactsWriter(config.artifactsDir, runId);
  const observeSopAssetStore = new SopAssetStore(config.sopAssetRootDir);
  const sopSkillStore = new SopSkillStore();
  const compactModelClient = new JsonModelClient({
    model: config.model,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    timeoutMs: config.semanticTimeoutMs,
    thinkingLevel: config.thinkingLevel,
  });
  const compactHumanLoopTool = createCompactHumanLoopTool(process.env);
  const observeWorkflowFactory = createObserveWorkflowFactory({
    browserLifecycle,
    logger,
    cdpEndpoint: config.cdpEndpoint,
    observeTimeoutMs: config.observeTimeoutMs,
    createRunId,
    createArtifactsWriter: createObserveArtifactsWriter,
    sopAssetStore: observeSopAssetStore,
    createRecorder: () => new PlaywrightDemonstrationRecorder(),
    telemetryRegistry,
  });
  const refinePersistenceContext = createRefinePersistenceContext(config);
  const refineAssembly = createRefineWorkflowAssembly({
    browserLifecycle,
    logger,
    rawToolClient,
    hitlController,
    createRunId,
    resolvedModel: resolvedRefineModel,
    persistenceContext: refinePersistenceContext,
    skillCatalog: sopSkillStore,
    skillStore: sopSkillStore,
    createArtifactsWriter: createRefineArtifactsWriter,
    config,
    telemetryRegistry,
    refineSystemPrompt: plan.prompts.refineSystemPrompt,
  }, {
    createToolComposition(rawToolClient) {
      return createRefineToolComposition({
        rawToolClient,
        guidanceLoader: refinePersistenceContext.guidanceLoader,
        knowledgeTopN: config.refinementKnowledgeTopN,
        skillStore: sopSkillStore,
      });
    },
  });

  return {
    browserLifecycle,
    telemetryRegistry,
    observeWorkflowFactory,
    refineWorkflowFactory: refineAssembly.createWorkflow,
    listSopSkills: () => sopSkillStore.listMetadata(),
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
        createArtifactsWriter: createCompactArtifactsWriter,
        modelClient: compactModelClient,
        humanLoopTool: compactHumanLoopTool,
        telemetryRegistry,
        skillStore: sopSkillStore,
      });

      return createCompactWorkflow({
        service: compactService,
        runId: request.runId,
      });
    },
  };
}

function createRefinePersistenceContext(config: Pick<RuntimeConfig, "artifactsDir">): RefinePersistenceContext {
  const knowledgeStore = new AttentionKnowledgeStore({
    filePath: path.join(config.artifactsDir, "refinement", "attention-knowledge-store.json"),
  });

  return {
    knowledgeStore,
    guidanceLoader: new AttentionGuidanceLoader(knowledgeStore),
    hitlResumeStore: new RefineHitlResumeStore({
      baseDir: config.artifactsDir,
    }),
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

function createCompactHumanLoopTool(env: NodeJS.ProcessEnv): CompactHumanLoopTool {
  const scriptedReplies = parseScriptedCompactReplies(env.SASIKI_COMPACT_SCRIPTED_REPLIES);
  if (scriptedReplies.length > 0) {
    return new ScriptedCompactHumanLoopTool(scriptedReplies);
  }
  return new TerminalCompactHumanLoopTool();
}
