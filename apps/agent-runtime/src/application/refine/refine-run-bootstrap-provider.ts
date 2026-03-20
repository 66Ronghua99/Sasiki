/**
 * Deps: application/refine/prompt-provider.ts, infrastructure/persistence/*, application/refine/*
 * Used By: application/refine/react-refinement-run-executor.ts, application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import type { AgentRunRequest } from "../../domain/agent-types.js";
import type { HitlAnswerProvider } from "./refine-runtime-tools.js";
import { createRefineReactSession } from "./refine-react-session.js";
import type { RefineReactToolClient } from "./refine-react-tool-client.js";
import type { AttentionGuidanceLoader } from "./attention-guidance-loader.js";
import type { RefineHitlResumeStore, RefineHitlResumeRecord } from "../../infrastructure/persistence/refine-hitl-resume-store.js";
import type { PromptProvider } from "./prompt-provider.js";

export interface RefineRunBootstrapProviderOptions {
  createRunId: () => string;
  guidanceLoader: Pick<AttentionGuidanceLoader, "load">;
  hitlResumeStore: Pick<RefineHitlResumeStore, "load" | "save">;
  promptProvider: Pick<PromptProvider, "buildRefineStartPrompt">;
  knowledgeTopN?: number;
}

export interface RefineRunBootstrapInput {
  request: AgentRunRequest;
  toolClient: Pick<RefineReactToolClient, "setSession" | "setHitlAnswerProvider" | "callTool">;
  hitlAnswerProvider?: HitlAnswerProvider;
}

export interface RefineRunBootstrapResult {
  runId: string;
  task: string;
  taskScope: string;
  prompt: string;
  loadedGuidanceCount: number;
}

export class RefineRunBootstrapProvider {
  private readonly createRunId: () => string;
  private readonly guidanceLoader: Pick<AttentionGuidanceLoader, "load">;
  private readonly hitlResumeStore: Pick<RefineHitlResumeStore, "load" | "save">;
  private readonly promptProvider: Pick<PromptProvider, "buildRefineStartPrompt">;
  private readonly knowledgeTopN: number;

  constructor(options: RefineRunBootstrapProviderOptions) {
    this.createRunId = options.createRunId;
    this.guidanceLoader = options.guidanceLoader;
    this.hitlResumeStore = options.hitlResumeStore;
    this.promptProvider = options.promptProvider;
    this.knowledgeTopN = Math.max(1, options.knowledgeTopN ?? 8);
  }

  async saveResumeRecord(record: RefineHitlResumeRecord): Promise<string> {
    return this.hitlResumeStore.save(record);
  }

  async prepare(input: RefineRunBootstrapInput): Promise<RefineRunBootstrapResult> {
    const resumeRecord = await this.loadResumeRecord(input.request);
    const task = input.request.task.trim() || resumeRecord?.task?.trim() || "";
    if (!task) {
      throw new Error("refinement run requires task text or a valid --resume-run-id with stored task context");
    }

    const runId = input.request.resumeRunId?.trim() || this.createRunId();
    const taskScope = this.resolveTaskScope(task);
    input.toolClient.setSession(createRefineReactSession(runId, task, { taskScope }));
    input.toolClient.setHitlAnswerProvider(input.hitlAnswerProvider);

    const preObservation = await input.toolClient.callTool("observe.page", {});
    const page = this.extractObservationPage(preObservation);
    const loadedGuidance = await this.guidanceLoader.load({
      taskScope,
      page,
      limit: this.knowledgeTopN,
    });

    const resumeInstruction = resumeRecord
      ? `Resumed from paused run ${resumeRecord.runId}. Human prompt context: ${resumeRecord.prompt}`
      : "";

    return {
      runId,
      task,
      taskScope,
      prompt: this.promptProvider.buildRefineStartPrompt({
        task,
        guidance: loadedGuidance.guidance,
        resumeInstruction,
      }),
      loadedGuidanceCount: loadedGuidance.records.length,
    };
  }

  private async loadResumeRecord(request: AgentRunRequest): Promise<RefineHitlResumeRecord | undefined> {
    const resumeRunId = request.resumeRunId?.trim();
    if (!resumeRunId) {
      return undefined;
    }
    return this.hitlResumeStore.load(resumeRunId);
  }

  private resolveTaskScope(task: string): string {
    const collapsed = task.replace(/\s+/g, " ").trim();
    return collapsed.length > 80 ? collapsed.slice(0, 80) : collapsed || "unknown-task";
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
}
