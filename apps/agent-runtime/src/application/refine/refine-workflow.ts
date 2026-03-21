/**
 * Deps: application/refine/*, kernel/agent-loop.ts, runtime/agent-execution-runtime.ts
 * Used By: application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import type { HitlController } from "../../contracts/hitl-controller.js";
import type { Logger } from "../../contracts/logger.js";
import type { ToolClient } from "../../contracts/tool-client.js";
import type { AgentRunRequest, AgentRunResult } from "../../domain/agent-types.js";
import { AgentLoop } from "../../kernel/agent-loop.js";
import { AgentExecutionRuntime } from "../../runtime/agent-execution-runtime.js";
import type { RuntimeConfig } from "../config/runtime-config.js";
import type { HostedWorkflow } from "../shell/workflow-contract.js";
import { PromptProvider } from "./prompt-provider.js";
import {
  createReactRefinementRunExecutor,
  type ReactRefinementRunExecutorOptions,
} from "./react-refinement-run-executor.js";
import { createBootstrapRefineReactToolClient } from "./refine-react-tool-client.js";
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
  refineSystemPrompt: string;
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

export function createRefineWorkflowFactory(
  options: CreateRefineWorkflowFactoryOptions
): (request: RefineWorkflowRequest) => RefineWorkflow {
  const promptProvider = new PromptProvider();
  const toolClient = createBootstrapRefineReactToolClient(options.rawToolClient);
  const persistence = createRefinePersistenceContext(options.config);
  const loop = new AgentLoop(
    {
      model: options.config.model,
      apiKey: options.config.apiKey,
      baseUrl: options.config.baseUrl,
      thinkingLevel: options.config.thinkingLevel,
      systemPrompt: options.refineSystemPrompt,
    },
    toolClient,
    options.logger
  );

  const runExecutorOptions: ReactRefinementRunExecutorOptions = {
    loop,
    logger: options.logger,
    artifactsDir: options.config.artifactsDir,
    maxTurns: options.config.refinementMaxRounds,
    toolClient,
    hitlController: options.hitlController,
    knowledgeStore: persistence.knowledgeStore,
    bootstrapProvider: new RefineRunBootstrapProvider({
      createRunId: options.createRunId,
      guidanceLoader: persistence.guidanceLoader,
      hitlResumeStore: persistence.hitlResumeStore,
      promptProvider,
      knowledgeTopN: options.config.refinementKnowledgeTopN,
    }),
  };
  const agentRuntime = new AgentExecutionRuntime({
    loop,
    runExecutor: createReactRefinementRunExecutor(runExecutorOptions),
  });

  return (request: RefineWorkflowRequest): RefineWorkflow =>
    createRefineWorkflow({
      browserLifecycle: options.browserLifecycle,
      agentRuntime,
      task: request.task,
      resumeRunId: request.resumeRunId,
    });
}
