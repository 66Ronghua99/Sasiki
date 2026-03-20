/**
 * Deps: kernel/agent-loop.ts, runtime/replay-refinement/*, infrastructure/persistence/*
 * Used By: runtime/runtime-composition-root.ts
 * Last Updated: 2026-03-20
 */
import type { HitlController } from "../../contracts/hitl-controller.js";
import type { Logger } from "../../contracts/logger.js";
import type { AgentLoop } from "../../kernel/agent-loop.js";
import type { AgentRunRequest, AgentRunResult, AssistantTurnRecord } from "../../domain/agent-types.js";
import type { HitlInterventionRequest } from "../../domain/intervention-learning.js";
import type { AttentionKnowledge } from "../../domain/attention-knowledge.js";
import { ArtifactsWriter } from "../../infrastructure/persistence/artifacts-writer.js";
import type { RefineRunBootstrapProvider } from "../providers/refine-run-bootstrap-provider.js";
import type { RefineReactToolClient } from "./refine-react-tool-client.js";

interface RefinementKnowledgeSink {
  append(records: AttentionKnowledge[]): Promise<void>;
}

export interface ReactRefinementRunExecutorOptions {
  loop: AgentLoop;
  logger: Logger;
  artifactsDir: string;
  maxTurns: number;
  toolClient: RefineReactToolClient;
  hitlController?: HitlController;
  knowledgeStore: RefinementKnowledgeSink;
  bootstrapProvider: RefineRunBootstrapProvider;
}

interface ActiveRunState {
  runId: string;
  artifacts: ArtifactsWriter;
}

export class ReactRefinementRunExecutor {
  private readonly loop: AgentLoop;
  private readonly logger: Logger;
  private readonly artifactsDir: string;
  private readonly maxTurns: number;
  private readonly toolClient: RefineReactToolClient;
  private readonly hitlController?: HitlController;
  private readonly knowledgeStore: RefinementKnowledgeSink;
  private readonly bootstrapProvider: RefineRunBootstrapProvider;
  private activeRun: ActiveRunState | null = null;

  constructor(options: ReactRefinementRunExecutorOptions) {
    this.loop = options.loop;
    this.logger = options.logger;
    this.artifactsDir = options.artifactsDir;
    this.maxTurns = Math.max(1, options.maxTurns);
    this.toolClient = options.toolClient;
    this.hitlController = options.hitlController;
    this.knowledgeStore = options.knowledgeStore;
    this.bootstrapProvider = options.bootstrapProvider;
  }

  async execute(request: AgentRunRequest): Promise<AgentRunResult> {
    const bootstrap = await this.bootstrapProvider.prepare({
      request,
      toolClient: this.toolClient,
      hitlAnswerProvider: this.hitlAnswerProvider(),
    });
    const { runId, task, prompt, loadedGuidanceCount } = bootstrap;
    const artifacts = new ArtifactsWriter(this.artifactsDir, runId);
    await artifacts.ensureDir();
    await artifacts.initializeReactRefinementArtifacts();
    this.activeRun = { runId, artifacts };

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

    await this.persistArtifacts({
      artifacts,
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

    this.logger.info("react_refinement_run_finished", {
      runId,
      status: result.status,
      finishReason: result.finishReason,
      loadedGuidanceCount,
      promotedKnowledgeCount: promotedKnowledge.length,
      pause: Boolean(pauseState),
      resumeRunId,
    });

    this.activeRun = null;
    return result;
  }

  async requestInterrupt(signalName: "SIGINT" | "SIGTERM"): Promise<boolean> {
    if (!this.activeRun) {
      return false;
    }
    this.loop.abort(`signal:${signalName}`);
    this.logger.warn("react_refinement_interrupt_requested", {
      runId: this.activeRun.runId,
      signal: signalName,
    });
    return true;
  }

  private async persistArtifacts(input: {
    artifacts: ArtifactsWriter;
    loopResult: AgentRunResult;
    loadedKnowledgeCount: number;
    promotedKnowledge: AttentionKnowledge[];
    status: AgentRunResult["status"];
    finishReason: string;
  }): Promise<void> {
    const session = this.toolClient.getSession();
    const knowledgeEvents = [
      {
        type: "guidance_loaded",
        count: input.loadedKnowledgeCount,
      },
      ...session.candidateKnowledge().map((candidate) => ({
        type: "candidate_recorded",
        candidateId: candidate.candidateId,
        category: candidate.category,
        cue: candidate.cue,
      })),
      ...input.promotedKnowledge.map((knowledge) => ({
        type: "knowledge_promoted",
        knowledgeId: knowledge.id,
        category: knowledge.category,
        cue: knowledge.cue,
      })),
    ];

    await input.artifacts.writeSteps(input.loopResult.steps);
    await input.artifacts.writeMcpCalls(input.loopResult.mcpCalls);
    await input.artifacts.writeAssistantTurns(input.loopResult.assistantTurns);
    await input.artifacts.writeRefineTurnLogs(input.loopResult.assistantTurns as AssistantTurnRecord[]);
    await input.artifacts.writeRefineBrowserObservations(session.observationHistory());
    await input.artifacts.writeRefineActionExecutions(session.actionHistory());
    await input.artifacts.writeRefineKnowledgeEvents(knowledgeEvents);
    await input.artifacts.writeRefineRunSummary({
      runId: input.loopResult.runId,
      status: input.status,
      finishReason: input.finishReason,
      candidateKnowledgeCount: session.candidateKnowledge().length,
      promotedKnowledgeCount: input.promotedKnowledge.length,
      assistantTurnCount: input.loopResult.assistantTurns.length,
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
