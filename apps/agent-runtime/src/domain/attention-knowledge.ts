/**
 * Deps: none
 * Used By: runtime/replay-refinement/*
 * Last Updated: 2026-03-20
 */
export const ATTENTION_KNOWLEDGE_CATEGORIES = ["keep", "ignore", "action-target", "success-indicator"] as const;

export type AttentionKnowledgeCategory = (typeof ATTENTION_KNOWLEDGE_CATEGORIES)[number];

export interface AttentionPageIdentity {
  origin: string;
  normalizedPath: string;
}

export interface AttentionKnowledgeCandidate {
  taskScope: string;
  page: AttentionPageIdentity;
  category: AttentionKnowledgeCategory;
  cue: string;
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
  taskScope: string;
  page: AttentionPageIdentity;
  limit?: number;
}

export interface AttentionKnowledgeLoadResult {
  taskScope: string;
  page: AttentionPageIdentity;
  loaded: AttentionKnowledge[];
}

export function isAttentionKnowledgeCategory(value: unknown): value is AttentionKnowledgeCategory {
  return typeof value === "string" && (ATTENTION_KNOWLEDGE_CATEGORIES as readonly string[]).includes(value);
}

export function normalizeAttentionPageKey(page: AttentionPageIdentity): string {
  return `${page.origin.trim().toLowerCase()}|${page.normalizedPath.trim() || "/"}`;
}
