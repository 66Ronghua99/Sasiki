/**
 * Deps: domain/refine-react.ts, domain/attention-knowledge.ts
 * Used By: application/refine/*
 * Last Updated: 2026-03-20
 */
import { randomUUID } from "node:crypto";

import type {
  AttentionKnowledge,
  AttentionKnowledgeCandidate,
  AttentionKnowledgeLoadRequest,
} from "../../domain/attention-knowledge.js";
import type { ActionExecutionResult, PageObservation, RunFinishRequest } from "../../domain/refine-react.js";

export interface RefineReactSessionOptions {
  taskScope: string;
}

export interface HitlPauseState {
  prompt: string;
  context?: string;
  resumeRunId: string;
  resumeToken: string;
  createdAt: string;
}

export interface RefineRunFinishState {
  reason: RunFinishRequest["reason"];
  summary: string;
  finalStatus: "completed" | "failed";
}

export interface RefineReactSession {
  readonly runId: string;
  readonly task: string;
  readonly taskScope: string;
  latestObservation(): PageObservation | undefined;
  findObservation(observationRef: string): PageObservation | undefined;
  observationHistory(): PageObservation[];
  recordObservation(observation: PageObservation): void;
  recordAction(result: ActionExecutionResult): void;
  actionHistory(): ActionExecutionResult[];
  recordCandidate(candidate: AttentionKnowledgeCandidate): string;
  candidateKnowledge(): Array<AttentionKnowledgeCandidate & { candidateId: string; recordedAt: string }>;
  promoteCandidates(sourceRunId?: string): AttentionKnowledge[];
  promotedKnowledge(): AttentionKnowledge[];
  loadGuidance(request: AttentionKnowledgeLoadRequest): AttentionKnowledge[];
  pauseForHitl(prompt: string, context?: string): HitlPauseState;
  currentPauseState(): HitlPauseState | undefined;
  clearPauseState(): void;
  setFinish(request: RunFinishRequest): RefineRunFinishState;
  finishState(): RefineRunFinishState | undefined;
}

interface CandidateKnowledgeRecord extends AttentionKnowledgeCandidate {
  candidateId: string;
  recordedAt: string;
}

class InMemoryRefineReactSession implements RefineReactSession {
  readonly runId: string;
  readonly task: string;
  readonly taskScope: string;

  private readonly observations: PageObservation[] = [];
  private readonly actions: ActionExecutionResult[] = [];
  private readonly candidates: CandidateKnowledgeRecord[] = [];
  private readonly promoted: AttentionKnowledge[] = [];
  private paused: HitlPauseState | undefined;
  private finished: RefineRunFinishState | undefined;

  constructor(runId: string, task: string, options: RefineReactSessionOptions) {
    this.runId = runId;
    this.task = task;
    this.taskScope = options.taskScope.trim() || task.trim() || "unknown-task";
  }

  latestObservation(): PageObservation | undefined {
    return this.observations.length > 0 ? this.observations[this.observations.length - 1] : undefined;
  }

  findObservation(observationRef: string): PageObservation | undefined {
    const target = observationRef.trim();
    if (!target) {
      return undefined;
    }
    return this.observations.find((item) => item.observationRef === target);
  }

  observationHistory(): PageObservation[] {
    return [...this.observations];
  }

  recordObservation(observation: PageObservation): void {
    this.observations.push(observation);
  }

  recordAction(result: ActionExecutionResult): void {
    this.actions.push(result);
  }

  actionHistory(): ActionExecutionResult[] {
    return [...this.actions];
  }

  recordCandidate(candidate: AttentionKnowledgeCandidate): string {
    const candidateId = `candidate_${this.candidates.length + 1}`;
    this.candidates.push({
      ...candidate,
      candidateId,
      recordedAt: new Date().toISOString(),
    });
    return candidateId;
  }

  candidateKnowledge(): CandidateKnowledgeRecord[] {
    return [...this.candidates];
  }

  promoteCandidates(sourceRunId?: string): AttentionKnowledge[] {
    const runId = sourceRunId?.trim() || this.runId;
    const newPromoted: AttentionKnowledge[] = this.candidates.map((candidate) => ({
      id: `knowledge_${randomUUID()}`,
      taskScope: candidate.taskScope,
      page: candidate.page,
      category: candidate.category,
      cue: candidate.cue,
      rationale: candidate.rationale,
      sourceRunId: runId,
      sourceObservationRef: candidate.sourceObservationRef,
      sourceActionRef: candidate.sourceActionRef,
      promotedAt: new Date().toISOString(),
    }));
    this.promoted.push(...newPromoted);
    return newPromoted;
  }

  promotedKnowledge(): AttentionKnowledge[] {
    return [...this.promoted];
  }

  loadGuidance(request: AttentionKnowledgeLoadRequest): AttentionKnowledge[] {
    const limit = Number.isFinite(request.limit) && (request.limit ?? 0) > 0 ? Math.floor(request.limit as number) : 8;
    return this.promoted
      .filter(
        (item) =>
          item.taskScope === request.taskScope &&
          item.page.origin === request.page.origin &&
          item.page.normalizedPath === request.page.normalizedPath
      )
      .slice(0, limit);
  }

  pauseForHitl(prompt: string, context?: string): HitlPauseState {
    const pauseState: HitlPauseState = {
      prompt,
      context,
      resumeRunId: this.runId,
      resumeToken: `resume_${randomUUID()}`,
      createdAt: new Date().toISOString(),
    };
    this.paused = pauseState;
    return pauseState;
  }

  currentPauseState(): HitlPauseState | undefined {
    return this.paused;
  }

  clearPauseState(): void {
    this.paused = undefined;
  }

  setFinish(request: RunFinishRequest): RefineRunFinishState {
    const finish: RefineRunFinishState = {
      reason: request.reason,
      summary: request.summary,
      finalStatus: request.reason === "goal_achieved" ? "completed" : "failed",
    };
    this.finished = finish;
    return finish;
  }

  finishState(): RefineRunFinishState | undefined {
    return this.finished;
  }
}

export function createRefineReactSession(
  runId: string,
  task: string,
  options: RefineReactSessionOptions
): RefineReactSession {
  return new InMemoryRefineReactSession(runId, task, options);
}
