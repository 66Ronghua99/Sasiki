/**
 * Deps: core/agent-loop.ts, runtime/replay-refinement/*, runtime/artifacts-writer.ts
 * Used By: runtime/workflow-runtime.ts
 * Last Updated: 2026-03-20
 */
import path from "node:path";

import type { HitlController } from "../../contracts/hitl-controller.js";
import type { Logger } from "../../contracts/logger.js";
import type { AgentLoop } from "../../core/agent-loop.js";
import type { AgentRunRequest, AgentRunResult, AssistantTurnRecord } from "../../domain/agent-types.js";
import type { HitlInterventionRequest } from "../../domain/intervention-learning.js";
import type { AttentionKnowledge } from "../../domain/attention-knowledge.js";
import { ArtifactsWriter } from "../artifacts-writer.js";
import { AttentionGuidanceLoader } from "./attention-guidance-loader.js";
import { AttentionKnowledgeStore } from "./attention-knowledge-store.js";
import { createRefineReactSession } from "./refine-react-session.js";
import { RefineHitlResumeStore } from "./refine-hitl-resume-store.js";
import type { RefineReactToolClient } from "./refine-react-tool-client.js";

export interface ReactRefinementRunExecutorOptions {
  loop: AgentLoop;
  logger: Logger;
  artifactsDir: string;
  createRunId: () => string;
  maxTurns: number;
  toolClient: RefineReactToolClient;
  hitlController?: HitlController;
  knowledgeStorePath?: string;
}

interface ActiveRunState {
  runId: string;
  artifacts: ArtifactsWriter;
}

export class ReactRefinementRunExecutor {
  private readonly loop: AgentLoop;
  private readonly logger: Logger;
  private readonly artifactsDir: string;
  private readonly createRunId: () => string;
  private readonly maxTurns: number;
  private readonly toolClient: RefineReactToolClient;
  private readonly hitlController?: HitlController;
  private readonly knowledgeStore: AttentionKnowledgeStore;
  private readonly guidanceLoader: AttentionGuidanceLoader;
  private readonly hitlResumeStore: RefineHitlResumeStore;
  private activeRun: ActiveRunState | null = null;

  constructor(options: ReactRefinementRunExecutorOptions) {
    this.loop = options.loop;
    this.logger = options.logger;
    this.artifactsDir = options.artifactsDir;
    this.createRunId = options.createRunId;
    this.maxTurns = Math.max(1, options.maxTurns);
    this.toolClient = options.toolClient;
    this.hitlController = options.hitlController;
    const knowledgePath =
      options.knowledgeStorePath ?? path.join(this.artifactsDir, "refinement", "attention-knowledge-store.json");
    this.knowledgeStore = new AttentionKnowledgeStore({
      filePath: knowledgePath,
    });
    this.guidanceLoader = new AttentionGuidanceLoader(this.knowledgeStore);
    this.hitlResumeStore = new RefineHitlResumeStore({
      baseDir: this.artifactsDir,
    });
  }

  async execute(request: AgentRunRequest): Promise<AgentRunResult> {
    const runId = this.resolveRunId(request);
    const resumeRecord = request.resumeRunId?.trim() ? await this.hitlResumeStore.load(request.resumeRunId.trim()) : undefined;
    const task = request.task.trim() || resumeRecord?.task?.trim() || "";
    if (!task) {
      throw new Error("refinement run requires task text or a valid --resume-run-id with stored task context");
    }
    const taskScope = this.resolveTaskScope(task);
    const artifacts = new ArtifactsWriter(this.artifactsDir, runId);
    await artifacts.ensureDir();
    await artifacts.initializeReactRefinementArtifacts();
    this.activeRun = { runId, artifacts };

    const session = createRefineReactSession(runId, task, { taskScope });
    this.toolClient.setSession(session);
    this.toolClient.setHitlAnswerProvider(this.hitlAnswerProvider());
    const preObservation = await this.toolClient.callTool("observe.page", {});
    const page = this.extractObservationPage(preObservation);
    const loadedGuidance = await this.guidanceLoader.load({
      taskScope,
      page: {
        origin: page.origin,
        normalizedPath: page.normalizedPath,
      },
      limit: 8,
    });

    let injectedHitlInstruction = "";
    if (resumeRecord) {
      injectedHitlInstruction = `Resumed from paused run ${resumeRecord.runId}. Human prompt context: ${resumeRecord.prompt}`;
    }

    const prompt = this.buildAgentPrompt(task, loadedGuidance.guidance, injectedHitlInstruction);
    const loopResult = await this.loop.run(prompt);
    const assistantTurns = loopResult.assistantTurns;

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
      await this.hitlResumeStore.save({
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
      loadedKnowledgeCount: loadedGuidance.records.length,
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
      loadedGuidanceCount: loadedGuidance.records.length,
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

  private resolveRunId(request: AgentRunRequest): string {
    const resumeId = request.resumeRunId?.trim();
    if (resumeId) {
      return resumeId;
    }
    return this.createRunId();
  }

  private resolveTaskScope(task: string): string {
    const collapsed = task.replace(/\s+/g, " ").trim();
    return collapsed.length > 80 ? collapsed.slice(0, 80) : collapsed || "unknown-task";
  }

  private buildAgentPrompt(task: string, guidance: string, resumeInstruction: string): string {
    const sections = [
      `Task: ${task}`,
      guidance ? guidance : "",
      resumeInstruction ? resumeInstruction : "",
      "Use refine-react tools only.",
      "Call run.finish with reason and summary when done.",
      "If human help is required, call hitl.request with explicit prompt.",
    ].filter((line) => line.trim().length > 0);
    return sections.join("\n\n");
  }

  private extractObservationPage(value: unknown): { origin: string; normalizedPath: string } {
    const record = value as Record<string, unknown>;
    const observation = record.observation as Record<string, unknown>;
    const page = observation?.page as Record<string, unknown>;
    const origin = typeof page?.origin === "string" && page.origin.trim() ? page.origin.trim() : "unknown";
    const normalizedPath =
      typeof page?.normalizedPath === "string" && page.normalizedPath.trim() ? page.normalizedPath.trim() : "/";
    return { origin, normalizedPath };
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
