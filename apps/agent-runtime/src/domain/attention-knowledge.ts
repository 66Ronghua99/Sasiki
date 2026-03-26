/**
 * Deps: none
 * Used By: runtime/replay-refinement/*
 * Last Updated: 2026-03-20
 */
export interface AttentionPageIdentity {
  origin: string;
  normalizedPath: string;
}

export interface PageKnowledge {
  guide: string;
  keywords: string[];
}

export interface AttentionKnowledgeCandidate extends PageKnowledge {
  page: AttentionPageIdentity;
  rationale?: string;
  sourceObservationRef: string;
  sourceActionRef?: string;
}

export interface AttentionKnowledge extends AttentionKnowledgeCandidate {
  id: string;
  sourceRunId: string;
  confidence?: number;
  promotedAt: string;
}

export interface AttentionKnowledgeLoadRequest {
  page: AttentionPageIdentity;
  limit?: number;
}

export interface AttentionKnowledgeLoadResult {
  page: AttentionPageIdentity;
  loaded: AttentionKnowledge[];
}

export function normalizeAttentionPageKey(page: AttentionPageIdentity): string {
  return `${page.origin}|${page.normalizedPath}`;
}
