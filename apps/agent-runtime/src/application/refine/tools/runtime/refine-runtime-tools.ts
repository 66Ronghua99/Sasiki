/**
 * Deps: domain/attention-knowledge.ts, domain/refine-react.ts, application/refine/refine-react-session.ts
 * Used By: application/refine/tools/refine-tool-composition.ts, application/refine/tools/providers/refine-runtime-provider.ts
 * Last Updated: 2026-03-21
 */
import { isAttentionKnowledgeCategory } from "../../../../domain/attention-knowledge.js";
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
  request: HitlRequest
) => Promise<string | undefined> | string | undefined;

export interface RefineRuntimeToolsOptions {
  session: RefineReactSession;
  hitlAnswerProvider?: HitlAnswerProvider;
}

export interface RefineRuntimeToolProviderContext {
  session: RefineReactSession;
  hitlAnswerProvider?: HitlAnswerProvider;
}

const RUN_FINISH_REASONS = new Set<RunFinishRequest["reason"]>(["goal_achieved", "hard_failure"]);

export class RefineRuntimeTools {
  private session: RefineReactSession;
  private hitlAnswerProvider?: HitlAnswerProvider;

  constructor(options: RefineRuntimeToolsOptions) {
    this.session = options.session;
    this.hitlAnswerProvider = options.hitlAnswerProvider;
  }

  setSession(session: RefineReactSession): void {
    this.session = session;
  }

  setHitlAnswerProvider(provider?: HitlAnswerProvider): void {
    this.hitlAnswerProvider = provider;
  }

  setProviderContext(context: RefineRuntimeToolProviderContext): void {
    this.setSession(context.session);
    this.setHitlAnswerProvider(context.hitlAnswerProvider);
  }

  async requestHitl(request: HitlRequest): Promise<HitlRequestResponse> {
    const prompt = request.prompt.trim();
    if (!prompt) {
      throw new Error("hitl.request.prompt is required");
    }
    const answer = this.hitlAnswerProvider ? await this.hitlAnswerProvider(request) : undefined;
    if (answer?.trim()) {
      return {
        status: "answered",
        answer: answer.trim(),
      };
    }
    const paused = this.session.pauseForHitl(prompt, request.context);
    return {
      status: "paused",
      resumeRunId: paused.resumeRunId,
      resumeToken: paused.resumeToken,
    };
  }

  async recordCandidate(request: KnowledgeRecordCandidateRequest): Promise<KnowledgeRecordCandidateResponse> {
    if (!isAttentionKnowledgeCategory(request.category)) {
      throw new Error(`knowledge.record_candidate.category is invalid: ${String(request.category)}`);
    }
    if (!request.sourceObservationRef.trim()) {
      throw new Error("knowledge.record_candidate.sourceObservationRef is required");
    }
    const candidateId = this.session.recordCandidate({
      ...request,
      taskScope: request.taskScope.trim() || this.session.taskScope,
      cue: request.cue.trim(),
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
    const finish = this.session.setFinish(request);
    return {
      accepted: true,
      finalStatus: finish.finalStatus,
    };
  }
}
