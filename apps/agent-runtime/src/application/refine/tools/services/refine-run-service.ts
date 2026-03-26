/**
 * Deps: domain/attention-knowledge.ts, domain/refine-react.ts, application/refine/refine-react-session.ts
 * Used By: application/refine/tools/refine-tool-composition.ts, application/refine/refine-react-tool-client.ts
 * Last Updated: 2026-03-23
 */
import type {
  HitlRequest,
  HitlRequestResponse,
  KnowledgeRecordCandidateRequest,
  KnowledgeRecordCandidateResponse,
  RunFinishRequest,
  RunFinishResponse,
} from "../../../../domain/refine-react.js";
import type { RefineReactSession } from "../../refine-react-session.js";

export type HitlAnswerProvider = (
  request: HitlRequest,
) => Promise<string | undefined> | string | undefined;

export interface RefineRunService {
  getSession(): RefineReactSession;
  setSession(session: RefineReactSession): void;
  setHitlAnswerProvider(provider?: HitlAnswerProvider): void;
  requestHumanInput(request: HitlRequest): Promise<HitlRequestResponse>;
  recordKnowledgeCandidate(request: KnowledgeRecordCandidateRequest): Promise<KnowledgeRecordCandidateResponse>;
  finishRun(request: RunFinishRequest): Promise<RunFinishResponse>;
}

export interface RefineRunServiceOptions {
  session: RefineReactSession;
  hitlAnswerProvider?: HitlAnswerProvider;
}

export class RefineRunServiceImpl implements RefineRunService {
  private currentSession: RefineReactSession;
  private currentHitlAnswerProvider?: HitlAnswerProvider;

  constructor(options: RefineRunServiceOptions) {
    this.currentSession = options.session;
    this.currentHitlAnswerProvider = options.hitlAnswerProvider;
  }

  getSession(): RefineReactSession {
    return this.currentSession;
  }

  setSession(session: RefineReactSession): void {
    this.currentSession = session;
  }

  setHitlAnswerProvider(provider?: HitlAnswerProvider): void {
    this.currentHitlAnswerProvider = provider;
  }

  async requestHumanInput(request: HitlRequest): Promise<HitlRequestResponse> {
    const prompt = request.prompt.trim();
    if (!prompt) {
      throw new Error("hitl.request.prompt is required");
    }
    const answer = this.currentHitlAnswerProvider ? await this.currentHitlAnswerProvider(request) : undefined;
    if (answer?.trim()) {
      return {
        status: "answered",
        answer: answer.trim(),
      };
    }
    const paused = this.currentSession.pauseForHitl(prompt, request.context);
    return {
      status: "paused",
      resumeRunId: paused.resumeRunId,
      resumeToken: paused.resumeToken,
    };
  }

  async recordKnowledgeCandidate(
    request: KnowledgeRecordCandidateRequest,
  ): Promise<KnowledgeRecordCandidateResponse> {
    if (!request.sourceObservationRef.trim()) {
      throw new Error("knowledge.record_candidate.sourceObservationRef is required");
    }
    const sourceObservation = this.currentSession.findObservation(request.sourceObservationRef);
    if (!sourceObservation) {
      throw new Error(`knowledge.record_candidate.sourceObservationRef is unknown: ${request.sourceObservationRef}`);
    }
    if (
      sourceObservation.page.origin !== request.page.origin ||
      sourceObservation.page.normalizedPath !== request.page.normalizedPath
    ) {
      throw new Error(
        `knowledge.record_candidate.page must match sourceObservationRef ${request.sourceObservationRef} page ${sourceObservation.page.origin}${sourceObservation.page.normalizedPath}`,
      );
    }
    const guide = request.guide.trim();
    if (!guide) {
      throw new Error("knowledge.record_candidate.guide is required");
    }
    const keywords = normalizeKeywords(request.keywords);
    const candidateId = this.currentSession.recordCandidate({
      ...request,
      guide,
      keywords,
    });
    return {
      accepted: true,
      candidateId,
    };
  }

  async finishRun(request: RunFinishRequest): Promise<RunFinishResponse> {
    if (!RUN_FINISH_REASONS.has(request.reason)) {
      throw new Error(`run.finish.reason is invalid: ${String(request.reason)}`);
    }
    if (!request.summary.trim()) {
      throw new Error("run.finish.summary is required");
    }
    const finish = this.currentSession.setFinish(request);
    return {
      accepted: true,
      finalStatus: finish.finalStatus,
    };
  }
}

const RUN_FINISH_REASONS = new Set<RunFinishRequest["reason"]>(["goal_achieved", "hard_failure"]);

function normalizeKeywords(keywords: string[]): string[] {
  if (!Array.isArray(keywords) || keywords.length < 1 || keywords.length > 3) {
    throw new Error("knowledge.record_candidate.keywords is required");
  }
  return keywords.map((keyword, index) => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      throw new Error(`knowledge.record_candidate.keywords[${index}] is required`);
    }
    return trimmed;
  });
}
