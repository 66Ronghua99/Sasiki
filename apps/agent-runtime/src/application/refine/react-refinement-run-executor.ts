/**
 * Deps: kernel/pi-agent-loop.ts, application/refine/*
 * Used By: application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import type { HitlController } from "../../contracts/hitl-controller.js";
import type { Logger } from "../../contracts/logger.js";
import type { RuntimeRunTelemetry, RuntimeTelemetryRegistry } from "../../contracts/runtime-telemetry.js";
import type { PiAgentLoop } from "../../kernel/pi-agent-loop.js";
import type { AgentRunRequest, AgentRunResult } from "../../domain/agent-types.js";
import type { HitlInterventionRequest } from "../../domain/intervention-learning.js";
import type { AttentionKnowledge } from "../../domain/attention-knowledge.js";
import type { RefineRunBootstrapProvider } from "./refine-run-bootstrap-provider.js";
import type { RefineReactToolClient } from "./refine-react-tool-client.js";

interface RefinementKnowledgeSink {
  append(records: AttentionKnowledge[]): Promise<void>;
}

export interface RefinementArtifactsWriter {
  runId: string;
  runDir: string;
  ensureDir(): Promise<void>;
  finalScreenshotPath(): string;
  writeRunSummary(summary: unknown): Promise<void>;
}

export interface ReactRefinementRunExecutorOptions {
  loop: PiAgentLoop;
  logger: Logger;
  maxTurns: number;
  telemetryRegistry: RuntimeTelemetryRegistry;
  toolClient: RefineReactToolClient;
  hitlController?: HitlController;
  knowledgeStore: RefinementKnowledgeSink;
  bootstrapProvider: RefineRunBootstrapProvider;
  createArtifactsWriter: (runId: string) => RefinementArtifactsWriter;
}

interface ActiveRunState {
  runId: string;
  artifacts: RefinementArtifactsWriter;
  telemetry: RuntimeRunTelemetry;
}

export class ReactRefinementRunExecutor {
  private readonly loop: PiAgentLoop;
  private readonly logger: Logger;
  private readonly maxTurns: number;
  private readonly telemetryRegistry: RuntimeTelemetryRegistry;
  private readonly toolClient: RefineReactToolClient;
  private readonly hitlController?: HitlController;
  private readonly knowledgeStore: RefinementKnowledgeSink;
  private readonly bootstrapProvider: RefineRunBootstrapProvider;
  private readonly createArtifactsWriter: (runId: string) => RefinementArtifactsWriter;
  private activeRun: ActiveRunState | null = null;

  constructor(options: ReactRefinementRunExecutorOptions) {
    this.loop = options.loop;
    this.logger = options.logger;
    this.maxTurns = Math.max(1, options.maxTurns);
    this.telemetryRegistry = options.telemetryRegistry;
    this.toolClient = options.toolClient;
    this.hitlController = options.hitlController;
    this.knowledgeStore = options.knowledgeStore;
    this.bootstrapProvider = options.bootstrapProvider;
    this.createArtifactsWriter = options.createArtifactsWriter;
  }

  async execute(request: AgentRunRequest): Promise<AgentRunResult> {
    const bootstrap = await this.bootstrapProvider.prepare({
      request,
      toolClient: this.toolClient,
      hitlAnswerProvider: this.hitlAnswerProvider(),
    });
    const { runId, task, prompt, loadedGuidanceCount } = bootstrap;
    const session = this.toolClient.getSession();
    if ("setToolHookContext" in this.loop && typeof this.loop.setToolHookContext === "function") {
      this.loop.setToolHookContext({
        runId: session.runId,
        sessionId: session.runId,
        stepIndex: session.actionHistory().length,
      });
    }
    const artifacts = this.createArtifactsWriter(runId);
    await artifacts.ensureDir();
    const telemetry = this.telemetryRegistry.createRunTelemetry({
      workflow: "refine",
      runId,
      artifactsDir: artifacts.runDir,
    });
    this.loop.setRuntimeTelemetry(telemetry);
    this.activeRun = { runId, artifacts, telemetry };

    try {
      await this.emitWorkflowLifecycle(telemetry, "started", { runId, task });
      const loopResult = await this.loop.run(prompt);
      const assistantTurns = loopResult.assistantTurns;
      const session = this.toolClient.getSession();

      const pauseState = session.currentPauseState();
      const finishState = session.finishState();
      const overBudget = loopResult.status === "max_steps" || assistantTurns.length >= this.maxTurns;
      const finalScreenshotPath =
        finishState?.finalStatus === "completed"
          ? await this.loop.captureFinalScreenshot(artifacts.finalScreenshotPath())
          : undefined;

      let promotedKnowledge: AttentionKnowledge[] = [];
      let status: AgentRunResult["status"];
      let finishReason: string;
      let resumeRunId: string | undefined;
      let resumeToken: string | undefined;

      if (pauseState && !finishState) {
        status = "paused_hitl";
        finishReason = "hitl.request paused waiting for human input";
        resumeRunId = pauseState.resumeRunId;
        resumeToken = pauseState.resumeToken;
        await this.bootstrapProvider.saveResumeRecord({
          runId,
          task,
          prompt: pauseState.prompt,
          context: pauseState.context,
          resumeToken: pauseState.resumeToken,
          createdAt: pauseState.createdAt,
        });
      } else if (overBudget && !finishState) {
        status = "budget_exhausted";
        finishReason = "refinement turn budget exhausted";
      } else if (!finishState) {
        status = "failed";
        finishReason = "run.finish not called";
      } else {
        status = finishState.finalStatus;
        finishReason = finishState.summary || (finishState.finalStatus === "completed" ? "goal achieved" : "hard failure");
        promotedKnowledge = session.promoteCandidates(runId);
        await this.knowledgeStore.append(promotedKnowledge);
      }

      await this.writeTelemetryCheckpoints({
        telemetry,
        loopResult,
        status,
        finishReason,
        pauseState,
      });

      await this.persistArtifacts({
        artifacts,
        runId,
        loopResult,
        loadedKnowledgeCount: loadedGuidanceCount,
        promotedKnowledge,
        status,
        finishReason,
      });

      const result: AgentRunResult = {
        ...loopResult,
        task,
        runId,
        artifactsDir: artifacts.runDir,
        status,
        finishReason,
        finalScreenshotPath,
        resumeRunId,
        resumeToken,
      };

      await this.emitWorkflowLifecycle(telemetry, "finished", {
        runId,
        task,
        status: result.status,
        finishReason: result.finishReason,
      });

      this.logger.info("react_refinement_run_finished", {
        runId,
        status: result.status,
        finishReason: result.finishReason,
        loadedGuidanceCount,
        promotedKnowledgeCount: promotedKnowledge.length,
        pause: Boolean(pauseState),
        resumeRunId,
      });

      return result;
    } catch (error) {
      await this.emitWorkflowLifecycle(telemetry, "failed", {
        runId,
        task,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.loop.setRuntimeTelemetry(null);
      this.activeRun = null;
      await telemetry.dispose();
    }
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean> {
    if (!this.activeRun) {
      return false;
    }
    const activeRun = this.activeRun;
    await this.emitWorkflowLifecycle(activeRun.telemetry, "interrupt_requested", {
      runId: activeRun.runId,
      signal: signalName,
    });
    this.loop.abort(`signal:${signalName}`);
    this.logger.warn("react_refinement_interrupt_requested", {
      runId: activeRun.runId,
      signal: signalName,
    });
    return true;
  }

  private async persistArtifacts(input: {
    artifacts: RefinementArtifactsWriter;
    runId: string;
    loopResult: AgentRunResult;
    loadedKnowledgeCount: number;
    promotedKnowledge: AttentionKnowledge[];
    status: AgentRunResult["status"];
    finishReason: string;
  }): Promise<void> {
    const session = this.toolClient.getSession();
    await input.artifacts.writeRunSummary({
      runId: input.runId,
      status: input.status,
      finishReason: input.finishReason,
      loadedKnowledgeCount: input.loadedKnowledgeCount,
      candidateKnowledgeCount: session.candidateKnowledge().length,
      promotedKnowledgeCount: input.promotedKnowledge.length,
      assistantTurnCount: input.loopResult.assistantTurns.length,
      actionCount: session.actionHistory().length,
      observationCount: session.observationHistory().length,
    });
  }

  private async writeTelemetryCheckpoints(input: {
    telemetry: RuntimeRunTelemetry;
    loopResult: AgentRunResult;
    status: AgentRunResult["status"];
    finishReason: string;
    pauseState: { prompt: string; context?: string } | undefined;
  }): Promise<void> {
    const { telemetry } = input;
    if (telemetry.artifacts.checkpointMode === "off") {
      return;
    }

    const checkpoints = telemetry.artifacts.checkpoints;
    if (telemetry.artifacts.checkpointMode === "all_turns") {
      for (const turn of input.loopResult.assistantTurns) {
        await checkpoints.append({
          timestamp: turn.timestamp,
          workflow: "refine",
          runId: input.loopResult.runId ?? telemetry.artifacts.scope.runId,
          reason: "turn",
          turnIndex: turn.index,
          payload: {
            stopReason: turn.stopReason,
            text: turn.text,
            thinking: turn.thinking,
            toolCallCount: turn.toolCalls.length,
            stepCount: input.loopResult.steps.length,
            status: input.status,
            finishReason: input.finishReason,
          },
        });
      }
    } else {
      const firstToolTurn = input.loopResult.assistantTurns.find((turn) => turn.toolCalls.length > 0);
      if (firstToolTurn) {
        await checkpoints.append({
          timestamp: firstToolTurn.timestamp,
          workflow: "refine",
          runId: input.loopResult.runId ?? telemetry.artifacts.scope.runId,
          reason: "first_tool_turn",
          turnIndex: firstToolTurn.index,
          payload: {
            stopReason: firstToolTurn.stopReason,
            toolCallCount: firstToolTurn.toolCalls.length,
            stepCount: input.loopResult.steps.length,
            assistantTurnCount: input.loopResult.assistantTurns.length,
            firstToolName: firstToolTurn.toolCalls[0]?.name,
          },
        });
      }
    }

    if (input.status === "paused_hitl") {
      await checkpoints.append({
        timestamp: new Date().toISOString(),
        workflow: "refine",
        runId: input.loopResult.runId ?? telemetry.artifacts.scope.runId,
        reason: "pause",
        payload: {
          status: input.status,
          finishReason: input.finishReason,
          prompt: input.pauseState?.prompt,
          context: input.pauseState?.context,
        },
      });
    }

    if (input.status === "failed") {
      await checkpoints.append({
        timestamp: new Date().toISOString(),
        workflow: "refine",
        runId: input.loopResult.runId ?? telemetry.artifacts.scope.runId,
        reason: "failure",
        payload: {
          status: input.status,
          finishReason: input.finishReason,
          assistantTurnCount: input.loopResult.assistantTurns.length,
          stepCount: input.loopResult.steps.length,
        },
      });
    }
  }

  private async emitWorkflowLifecycle(
    telemetry: RuntimeRunTelemetry,
    phase: "started" | "finished" | "failed" | "interrupt_requested",
    payload: Record<string, unknown>
  ): Promise<void> {
    await telemetry.eventBus.emit({
      timestamp: new Date().toISOString(),
      workflow: "refine",
      runId: telemetry.artifacts.scope.runId,
      eventType: "workflow.lifecycle",
      payload: {
        phase,
        ...payload,
      },
    });
  }

  private async requestHitlAnswer(runId: string, task: string, prompt: string): Promise<string | undefined> {
    if (!this.hitlController) {
      return undefined;
    }
    const request: HitlInterventionRequest = {
      runId,
      attempt: 1,
      issueType: "uncertain_state",
      operationIntent: task,
      failureReason: prompt,
      beforeState: "refine-react tool requested HITL",
      context: {},
    };
    const response = await this.hitlController.requestIntervention(request);
    return response.resumeInstruction?.trim() || response.humanAction?.trim() || undefined;
  }

  hitlAnswerProvider(): (request: { prompt: string }) => Promise<string | undefined> {
    return async (request) => {
      const active = this.activeRun;
      if (!active) {
        return undefined;
      }
      return this.requestHitlAnswer(active.runId, this.toolClient.getSession().task, request.prompt);
    };
  }
}

export function createReactRefinementRunExecutor(
  options: ReactRefinementRunExecutorOptions
): ReactRefinementRunExecutor {
  return new ReactRefinementRunExecutor(options);
}
