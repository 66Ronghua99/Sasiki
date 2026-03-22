import type {
  HitlRequest,
  HitlRequestResponse,
  KnowledgeRecordCandidateRequest,
  KnowledgeRecordCandidateResponse,
  RunFinishRequest,
  RunFinishResponse,
} from "../../../../domain/refine-react.js";
import type { RefineToolContext, RefineToolContextRef } from "../refine-tool-context.js";
import type { RefineReactSession } from "../../refine-react-session.js";
import {
  RefineRuntimeTools,
  type HitlAnswerProvider,
  type RefineRuntimeToolProviderContext,
} from "../../refine-runtime-tools.js";

export interface RefineRuntimeProviderContext extends RefineToolContext, RefineRuntimeToolProviderContext {}

export interface RefineRuntimeProvider {
  getSession(): RefineReactSession;
  requestHumanInput(request: HitlRequest): Promise<HitlRequestResponse>;
  recordKnowledgeCandidate(request: KnowledgeRecordCandidateRequest): Promise<KnowledgeRecordCandidateResponse>;
  finishRun(request: RunFinishRequest): Promise<RunFinishResponse>;
}

export interface RefineRuntimeProviderOptions {
  tools: RefineRuntimeTools;
  contextRef: RefineToolContextRef<RefineRuntimeProviderContext>;
}

export class RefineRuntimeProviderImpl implements RefineRuntimeProvider {
  private readonly tools: RefineRuntimeTools;
  private readonly contextRef: RefineToolContextRef<RefineRuntimeProviderContext>;

  constructor(options: RefineRuntimeProviderOptions) {
    this.tools = options.tools;
    this.contextRef = options.contextRef;
  }

  getSession(): RefineReactSession {
    return this.syncContext().session;
  }

  async requestHumanInput(request: HitlRequest): Promise<HitlRequestResponse> {
    this.syncContext();
    return this.tools.requestHitl(request);
  }

  async recordKnowledgeCandidate(
    request: KnowledgeRecordCandidateRequest,
  ): Promise<KnowledgeRecordCandidateResponse> {
    this.syncContext();
    return this.tools.recordCandidate(request);
  }

  async finishRun(request: RunFinishRequest): Promise<RunFinishResponse> {
    this.syncContext();
    return this.tools.finishRun(request);
  }

  private syncContext(): RefineRuntimeProviderContext {
    const context = this.contextRef.get();
    this.tools.setProviderContext(context);
    return context;
  }
}
