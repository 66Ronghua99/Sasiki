/**
 * Deps: application/refine/*, kernel/pi-agent-loop.ts
 * Used By: application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import type { HitlController } from "../../contracts/hitl-controller.js";
import type { Logger } from "../../contracts/logger.js";
import type { PiAgentModel } from "../../contracts/pi-agent-model.js";
import type { RuntimeTelemetryRegistry } from "../../contracts/runtime-telemetry.js";
import type { ToolClient } from "../../contracts/tool-client.js";
import type { AgentRunRequest, AgentRunResult } from "../../domain/agent-types.js";
import { PiAgentLoop } from "../../kernel/pi-agent-loop.js";
import type { RuntimeConfig } from "../config/runtime-config.js";
import type { HostedWorkflow } from "../shell/workflow-contract.js";
import { PromptProvider } from "./prompt-provider.js";
import {
  createReactRefinementRunExecutor,
  type RefinementArtifactsWriter,
  type ReactRefinementRunExecutor,
  type ReactRefinementRunExecutorOptions,
} from "./react-refinement-run-executor.js";
import { RefineReactToolClient } from "./refine-react-tool-client.js";
import {
  type RefinePersistenceContext,
  type RefineSkillMetadataCatalog,
  RefineRunBootstrapProvider,
} from "./refine-run-bootstrap-provider.js";
import { createBootstrapRefineToolComposition, type RefineToolComposition } from "./tools/refine-tool-composition.js";
import type { RefineSkillStorePort } from "./tools/services/refine-skill-service.js";

export interface RefineWorkflowBrowserLifecycle {
  start(): Promise<unknown>;
  stop(): Promise<void>;
}

export interface RefineWorkflowRequest {
  task: string;
  skillName?: string;
  resumeRunId?: string;
}

export interface RefineWorkflowAgentRuntime {
  start(): Promise<void>;
  run(request: AgentRunRequest): Promise<AgentRunResult>;
  requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean>;
  stop(): Promise<void>;
}

export interface RefineWorkflowOptions extends RefineWorkflowRequest {
  browserLifecycle: RefineWorkflowBrowserLifecycle;
  agentRuntime: RefineWorkflowAgentRuntime;
}

export interface CreateRefineWorkflowFactoryOptions {
  browserLifecycle: RefineWorkflowBrowserLifecycle;
  logger: Logger;
  rawToolClient: ToolClient;
  hitlController?: HitlController;
  createRunId: () => string;
  resolvedModel: PiAgentModel;
  persistenceContext: RefinePersistenceContext;
  skillCatalog?: RefineSkillMetadataCatalog;
  skillStore?: RefineSkillStorePort;
  createArtifactsWriter: (runId: string) => RefinementArtifactsWriter;
  config: Pick<
    RuntimeConfig,
    "apiKey" | "artifactsDir" | "baseUrl" | "model" | "refinementKnowledgeTopN" | "refinementMaxRounds" | "thinkingLevel"
  >;
  telemetryRegistry: RuntimeTelemetryRegistry;
  refineSystemPrompt: string;
}

export interface RefineWorkflowAssembly {
  createWorkflow(request: RefineWorkflowRequest): RefineWorkflow;
}

export interface RefineWorkflowLoopInput {
  resolvedModel: PiAgentModel;
  apiKey: string;
  configuredModel: string;
  configuredBaseUrl?: string;
  thinkingLevel: RuntimeConfig["thinkingLevel"];
  systemPrompt: string;
  toolClient: RefineReactToolClient;
  logger: Logger;
}

export interface RefineWorkflowAssemblyOverrides {
  createToolComposition?: (rawClient: ToolClient) => RefineToolComposition;
  createPromptProvider?: () => Pick<PromptProvider, "buildRefineStartPrompt">;
  createBootstrapProvider?: (
    options: ConstructorParameters<typeof RefineRunBootstrapProvider>[0]
  ) => RefineRunBootstrapProvider;
  createLoop?: (input: RefineWorkflowLoopInput) => PiAgentLoop;
  createRunExecutor?: (options: ReactRefinementRunExecutorOptions) => ReactRefinementRunExecutor;
  createAgentRuntime?: (input: { loop: PiAgentLoop; runExecutor: AgentRunExecutor }) => RefineWorkflowAgentRuntime;
}

export interface AgentRunExecutor {
  execute(request: AgentRunRequest): Promise<AgentRunResult>;
  requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean>;
}

class RefineWorkflowRuntime implements RefineWorkflowAgentRuntime {
  private readonly loop: PiAgentLoop;
  private readonly runExecutor: AgentRunExecutor;
  private loopInitialized = false;

  constructor(options: { loop: PiAgentLoop; runExecutor: AgentRunExecutor }) {
    this.loop = options.loop;
    this.runExecutor = options.runExecutor;
  }

  async start(): Promise<void> {
    await this.ensureLoopInitialized();
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    await this.ensureLoopInitialized();
    return this.runExecutor.execute(request);
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean> {
    return this.runExecutor.requestInterrupt(signalName);
  }

  async stop(): Promise<void> {
    if (!this.loopInitialized) {
      return;
    }
    await this.loop.shutdown();
    this.loopInitialized = false;
  }

  private async ensureLoopInitialized(): Promise<void> {
    if (this.loopInitialized) {
      return;
    }
    await this.loop.initialize();
    this.loopInitialized = true;
  }
}

export class RefineWorkflow implements HostedWorkflow<AgentRunResult> {
  private readonly browserLifecycle: RefineWorkflowBrowserLifecycle;
  private readonly agentRuntime: RefineWorkflowAgentRuntime;
  private readonly task: string;
  private readonly skillName?: string;
  private readonly resumeRunId?: string;

  constructor(options: RefineWorkflowOptions) {
    this.browserLifecycle = options.browserLifecycle;
    this.agentRuntime = options.agentRuntime;
    this.task = options.task;
    this.skillName = options.skillName;
    this.resumeRunId = options.resumeRunId;
  }

  async prepare(): Promise<void> {
    await this.browserLifecycle.start();
    await this.agentRuntime.start();
  }

  async execute(): Promise<AgentRunResult> {
    return this.agentRuntime.run({
      task: this.task,
      skillName: this.skillName,
      resumeRunId: this.resumeRunId,
    });
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean> {
    return this.agentRuntime.requestInterrupt(signalName);
  }

  async dispose(): Promise<void> {
    await this.agentRuntime.stop();
    await this.browserLifecycle.stop();
  }
}

export function createRefineWorkflow(options: RefineWorkflowOptions): RefineWorkflow {
  return new RefineWorkflow(options);
}

export function createRefineWorkflowAssembly(
  options: CreateRefineWorkflowFactoryOptions,
  overrides: RefineWorkflowAssemblyOverrides = {}
): RefineWorkflowAssembly {
  const createToolComposition = overrides.createToolComposition ?? createBootstrapRefineToolComposition;
  const createPromptProvider = overrides.createPromptProvider ?? (() => new PromptProvider());
  const createBootstrapProvider =
    overrides.createBootstrapProvider ?? ((input) => new RefineRunBootstrapProvider(input));
  const createLoop =
    overrides.createLoop ??
    ((input) =>
      new PiAgentLoop(
        {
          resolvedModel: input.resolvedModel,
          apiKey: input.apiKey,
          configuredModel: input.configuredModel,
          configuredBaseUrl: input.configuredBaseUrl,
          thinkingLevel: input.thinkingLevel,
          systemPrompt: input.systemPrompt,
        },
        input.toolClient,
        input.logger
      ));
  const createRunExecutor = overrides.createRunExecutor ?? createReactRefinementRunExecutor;
  const createAgentRuntime =
    overrides.createAgentRuntime ?? ((input) => new RefineWorkflowRuntime({ loop: input.loop, runExecutor: input.runExecutor }));

  const toolComposition =
    createToolComposition === createBootstrapRefineToolComposition
      ? createBootstrapRefineToolComposition(options.rawToolClient, {
          guidanceLoader: options.persistenceContext.guidanceLoader,
          knowledgeTopN: options.config.refinementKnowledgeTopN,
          skillStore: options.skillStore,
        })
      : createToolComposition(options.rawToolClient);
  const toolClient = new RefineReactToolClient(toolComposition);
  const promptProvider = createPromptProvider();
  const bootstrapProvider = createBootstrapProvider({
    createRunId: options.createRunId,
    guidanceLoader: options.persistenceContext.guidanceLoader,
    hitlResumeStore: options.persistenceContext.hitlResumeStore,
    skillCatalog: options.skillCatalog,
    promptProvider,
    knowledgeTopN: options.config.refinementKnowledgeTopN,
  });
  const loop = createLoop({
    resolvedModel: options.resolvedModel,
    apiKey: options.config.apiKey,
    configuredModel: options.config.model,
    configuredBaseUrl: options.config.baseUrl,
    thinkingLevel: options.config.thinkingLevel,
    systemPrompt: options.refineSystemPrompt,
    toolClient,
    logger: options.logger,
  });
  if ("setToolHooks" in loop && typeof loop.setToolHooks === "function") {
    loop.setToolHooks(toolComposition.toolHooks);
  }
  const runExecutor = createRunExecutor({
    loop,
    logger: options.logger,
    maxTurns: options.config.refinementMaxRounds,
    telemetryRegistry: options.telemetryRegistry,
    toolClient,
    hitlController: options.hitlController,
    knowledgeStore: options.persistenceContext.knowledgeStore,
    bootstrapProvider,
    createArtifactsWriter: options.createArtifactsWriter,
  });
  const agentRuntime = createAgentRuntime({
    loop,
    runExecutor,
  });

  return {
    createWorkflow(request: RefineWorkflowRequest): RefineWorkflow {
      return createRefineWorkflow({
        browserLifecycle: options.browserLifecycle,
        agentRuntime,
        task: request.task,
        skillName: request.skillName,
        resumeRunId: request.resumeRunId,
      });
    },
  };
}
