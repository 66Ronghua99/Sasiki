/**
 * Deps: application/refine/*, kernel/agent-loop.ts
 * Used By: application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import type { HitlController } from "../../contracts/hitl-controller.js";
import type { Logger } from "../../contracts/logger.js";
import type { RuntimeTelemetryRegistry } from "../../contracts/runtime-telemetry.js";
import type { ToolClient } from "../../contracts/tool-client.js";
import type { AgentRunRequest, AgentRunResult } from "../../domain/agent-types.js";
import { AgentLoop } from "../../kernel/agent-loop.js";
import type { RuntimeConfig } from "../config/runtime-config.js";
import type { HostedWorkflow } from "../shell/workflow-contract.js";
import { PromptProvider } from "./prompt-provider.js";
import {
  createReactRefinementRunExecutor,
  type ReactRefinementRunExecutor,
  type ReactRefinementRunExecutorOptions,
} from "./react-refinement-run-executor.js";
import { createBootstrapRefineReactToolClient, type RefineReactToolClient } from "./refine-react-tool-client.js";
import { createRefinePersistenceContext, RefineRunBootstrapProvider } from "./refine-run-bootstrap-provider.js";

export interface RefineWorkflowBrowserLifecycle {
  start(): Promise<unknown>;
  stop(): Promise<void>;
}

export interface RefineWorkflowRequest {
  task: string;
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
  model: string;
  apiKey: string;
  baseUrl?: string;
  thinkingLevel: RuntimeConfig["thinkingLevel"];
  systemPrompt: string;
  toolClient: RefineReactToolClient;
  logger: Logger;
}

export interface RefineWorkflowAssemblyOverrides {
  createBootstrapToolClient?: (rawClient: ToolClient) => RefineReactToolClient;
  createPromptProvider?: () => Pick<PromptProvider, "buildRefineStartPrompt">;
  createPersistenceContext?: (
    config: Pick<RuntimeConfig, "artifactsDir">
  ) => ReturnType<typeof createRefinePersistenceContext>;
  createBootstrapProvider?: (
    options: ConstructorParameters<typeof RefineRunBootstrapProvider>[0]
  ) => RefineRunBootstrapProvider;
  createLoop?: (input: RefineWorkflowLoopInput) => AgentLoop;
  createRunExecutor?: (options: ReactRefinementRunExecutorOptions) => ReactRefinementRunExecutor;
  createAgentRuntime?: (input: { loop: AgentLoop; runExecutor: AgentRunExecutor }) => RefineWorkflowAgentRuntime;
}

export interface AgentRunExecutor {
  execute(request: AgentRunRequest): Promise<AgentRunResult>;
  requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean>;
}

class RefineWorkflowRuntime implements RefineWorkflowAgentRuntime {
  private readonly loop: AgentLoop;
  private readonly runExecutor: AgentRunExecutor;
  private loopInitialized = false;

  constructor(options: { loop: AgentLoop; runExecutor: AgentRunExecutor }) {
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
  private readonly resumeRunId?: string;

  constructor(options: RefineWorkflowOptions) {
    this.browserLifecycle = options.browserLifecycle;
    this.agentRuntime = options.agentRuntime;
    this.task = options.task;
    this.resumeRunId = options.resumeRunId;
  }

  async prepare(): Promise<void> {
    await this.browserLifecycle.start();
    await this.agentRuntime.start();
  }

  async execute(): Promise<AgentRunResult> {
    return this.agentRuntime.run({
      task: this.task,
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
  const createBootstrapToolClient = overrides.createBootstrapToolClient ?? createBootstrapRefineReactToolClient;
  const createPromptProvider = overrides.createPromptProvider ?? (() => new PromptProvider());
  const createPersistenceContext = overrides.createPersistenceContext ?? ((config) => createRefinePersistenceContext(config));
  const createBootstrapProvider =
    overrides.createBootstrapProvider ?? ((input) => new RefineRunBootstrapProvider(input));
  const createLoop =
    overrides.createLoop ??
    ((input) =>
      new AgentLoop(
        {
          model: input.model,
          apiKey: input.apiKey,
          baseUrl: input.baseUrl,
          thinkingLevel: input.thinkingLevel,
          systemPrompt: input.systemPrompt,
        },
        input.toolClient,
        input.logger
      ));
  const createRunExecutor = overrides.createRunExecutor ?? createReactRefinementRunExecutor;
  const createAgentRuntime =
    overrides.createAgentRuntime ?? ((input) => new RefineWorkflowRuntime({ loop: input.loop, runExecutor: input.runExecutor }));

  const toolClient = createBootstrapToolClient(options.rawToolClient);
  const promptProvider = createPromptProvider();
  const persistence = createPersistenceContext(options.config);
  const bootstrapProvider = createBootstrapProvider({
    createRunId: options.createRunId,
    guidanceLoader: persistence.guidanceLoader,
    hitlResumeStore: persistence.hitlResumeStore,
    promptProvider,
    knowledgeTopN: options.config.refinementKnowledgeTopN,
  });
  const loop = createLoop({
    model: options.config.model,
    apiKey: options.config.apiKey,
    baseUrl: options.config.baseUrl,
    thinkingLevel: options.config.thinkingLevel,
    systemPrompt: options.refineSystemPrompt,
    toolClient,
    logger: options.logger,
  });
  const runExecutor = createRunExecutor({
    loop,
    logger: options.logger,
    artifactsDir: options.config.artifactsDir,
    maxTurns: options.config.refinementMaxRounds,
    telemetryRegistry: options.telemetryRegistry,
    toolClient,
    hitlController: options.hitlController,
    knowledgeStore: persistence.knowledgeStore,
    bootstrapProvider,
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
        resumeRunId: request.resumeRunId,
      });
    },
  };
}
