/**
 * Deps: application/refine/prompt-provider.ts, application/refine/*
 * Used By: application/refine/react-refinement-run-executor.ts, application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import type { AgentRunRequest } from "../../domain/agent-types.js";
import type { SopSkillMetadata } from "../../domain/sop-skill.js";
import type { HitlAnswerProvider } from "./tools/services/refine-run-service.js";
import { createRefineReactSession } from "./refine-react-session.js";
import type { RefineReactToolClient } from "./refine-react-tool-client.js";
import { AttentionGuidanceLoader, type AttentionGuidanceLoader as AttentionGuidanceLoaderContract } from "./attention-guidance-loader.js";
import type { PromptProvider } from "./prompt-provider.js";

export interface RefineHitlResumeRecord {
  runId: string;
  task: string;
  prompt: string;
  context?: unknown;
  resumeToken: string;
  createdAt: string;
}

export interface RefineHitlResumeStorePort {
  load(runId: string): Promise<RefineHitlResumeRecord | undefined>;
  save(record: RefineHitlResumeRecord): Promise<string>;
}

export interface RefineRunBootstrapProviderOptions {
  createRunId: () => string;
  guidanceLoader: Pick<AttentionGuidanceLoaderContract, "load">;
  hitlResumeStore: RefineHitlResumeStorePort;
  skillCatalog?: RefineSkillMetadataCatalog;
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
  selectedSkillName?: string;
}

export interface RefineSkillMetadataCatalog {
  listMetadata(): Promise<SopSkillMetadata[]>;
}

export interface RefinePersistenceContext {
  knowledgeStore: {
    append(records: import("../../domain/attention-knowledge.js").AttentionKnowledge[]): Promise<void>;
  };
  guidanceLoader: AttentionGuidanceLoader;
  hitlResumeStore: RefineHitlResumeStorePort;
}

export class RefineRunBootstrapProvider {
  private readonly createRunId: () => string;
  private readonly guidanceLoader: Pick<AttentionGuidanceLoader, "load">;
  private readonly hitlResumeStore: RefineHitlResumeStorePort;
  private readonly skillCatalog: RefineSkillMetadataCatalog;
  private readonly promptProvider: Pick<PromptProvider, "buildRefineStartPrompt">;
  private readonly knowledgeTopN: number;

  constructor(options: RefineRunBootstrapProviderOptions) {
    this.createRunId = options.createRunId;
    this.guidanceLoader = options.guidanceLoader;
    this.hitlResumeStore = options.hitlResumeStore;
    this.skillCatalog = options.skillCatalog ?? { listMetadata: async () => [] };
    this.promptProvider = options.promptProvider;
    this.knowledgeTopN = Math.max(1, options.knowledgeTopN ?? 8);
  }

  async saveResumeRecord(record: RefineHitlResumeRecord): Promise<string> {
    return this.hitlResumeStore.save(record);
  }

  async prepare(input: RefineRunBootstrapInput): Promise<RefineRunBootstrapResult> {
    const resumeRecord = await this.loadResumeRecord(input.request);
    const availableSkills = await this.skillCatalog.listMetadata();
    const selectedSkill = this.resolveSelectedSkill(input.request, availableSkills);
    const task = input.request.task.trim() || resumeRecord?.task?.trim() || selectedSkill?.description.trim() || "";
    if (!task) {
      throw new Error("refinement run requires task text, --skill <name>, or a valid --resume-run-id with stored task context");
    }

    const runId = input.request.resumeRunId?.trim() || this.createRunId();
    const taskScope = this.resolveTaskScope(task);
    input.toolClient.setSession(createRefineReactSession(runId, task, { taskScope }));
    input.toolClient.setHitlAnswerProvider(input.hitlAnswerProvider);

    const preObservation = await input.toolClient.callTool("observe.page", {});
    const initialObservation = this.extractInitialObservation(preObservation);
    const page = {
      origin: initialObservation.page.origin,
      normalizedPath: initialObservation.page.normalizedPath,
    };
    const loadedGuidance = await this.guidanceLoader.load({
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
        availableSkills,
        selectedSkillName: selectedSkill?.name,
        resumeInstruction,
        initialObservation,
      }),
      loadedGuidanceCount: loadedGuidance.records.length,
      selectedSkillName: selectedSkill?.name,
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

  private resolveSelectedSkill(request: AgentRunRequest, availableSkills: SopSkillMetadata[]): SopSkillMetadata | undefined {
    const requestedSkillName = request.skillName?.trim();
    if (!requestedSkillName) {
      return undefined;
    }
    const selectedSkill = availableSkills.find((skill) => skill.name === requestedSkillName);
    if (!selectedSkill) {
      throw new Error(`requested SOP skill not found: ${requestedSkillName}`);
    }
    return selectedSkill;
  }

  private extractInitialObservation(value: unknown): {
    observationRef: string;
    page: {
      url: string;
      origin: string;
      normalizedPath: string;
      title: string;
    };
    activeTabIndex?: number;
    openTabCount?: number;
  } {
    const record = value as Record<string, unknown>;
    const observation = record.observation as Record<string, unknown>;
    const page = observation?.page as Record<string, unknown>;
    const tabs = Array.isArray(observation?.tabs) ? observation.tabs : [];
    return {
      observationRef:
        typeof observation?.observationRef === "string" && observation.observationRef.trim()
          ? observation.observationRef.trim()
          : "unknown-observation",
      page: {
        url: typeof page?.url === "string" && page.url.trim() ? page.url.trim() : "unknown",
        origin: typeof page?.origin === "string" && page.origin.trim() ? page.origin.trim() : "unknown",
        normalizedPath:
          typeof page?.normalizedPath === "string" && page.normalizedPath.trim() ? page.normalizedPath.trim() : "/",
        title: typeof page?.title === "string" && page.title.trim() ? page.title.trim() : "Unknown",
      },
      activeTabIndex: typeof observation?.activeTabIndex === "number" ? observation.activeTabIndex : undefined,
      openTabCount: tabs.length > 0 ? tabs.length : undefined,
    };
  }
}
