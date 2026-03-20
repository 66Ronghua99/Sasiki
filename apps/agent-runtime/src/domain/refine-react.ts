/**
 * Deps: domain/attention-knowledge.ts
 * Used By: runtime/replay-refinement/*
 * Last Updated: 2026-03-20
 */
import type { AttentionKnowledgeCategory } from "./attention-knowledge.js";

export const REFINE_REACT_TOOL_NAMES = [
  "observe.page",
  "observe.query",
  "act.click",
  "act.type",
  "act.press",
  "act.navigate",
  "act.select_tab",
  "act.screenshot",
  "hitl.request",
  "knowledge.record_candidate",
  "run.finish",
] as const;

export const OBSERVE_QUERY_ALLOWED_NARROWING_FIELDS = ["mode", "text", "role", "elementRef", "limit"] as const;

export type ObserveQueryMode = "search" | "inspect";
export type RefineActionName = "click" | "type" | "press" | "navigate" | "select_tab" | "screenshot";
export type RefineFinishReason = "goal_achieved" | "hard_failure";

export interface BrowserTabIdentity {
  index: number;
  url: string;
  title: string;
  isActive: boolean;
}

export interface PageIdentity {
  url: string;
  origin: string;
  normalizedPath: string;
  title: string;
}

export interface PageObservation {
  observationRef: string;
  page: PageIdentity;
  tabs: BrowserTabIdentity[];
  activeTabIndex?: number;
  activeTabMatchesPage?: boolean;
  snapshot: string;
  capturedAt: string;
}

export interface ObservePageResponse {
  observation: PageObservation;
}

export interface ObserveQueryRequest {
  mode: ObserveQueryMode;
  intent?: string;
  text?: string;
  role?: string;
  elementRef?: string;
  limit?: number;
}

export interface ObserveQueryMatch {
  elementRef: string;
  sourceObservationRef: string;
  role: string;
  rawText: string;
  normalizedText: string;
}

export interface ObserveQueryResponse {
  observationRef: string;
  page: Pick<PageIdentity, "origin" | "normalizedPath">;
  matches: ObserveQueryMatch[];
}

export interface ActionExecutionResult {
  action: RefineActionName;
  success: boolean;
  sourceObservationRef: string;
  targetElementRef?: string;
  page: PageIdentity;
  tabs?: BrowserTabIdentity[];
  activeTabIndex?: number;
  evidenceRef?: string;
  message?: string;
}

export interface HitlRequest {
  prompt: string;
  context?: string;
}

export interface HitlAnsweredResponse {
  status: "answered";
  answer: string;
}

export interface HitlPausedResponse {
  status: "paused";
  resumeRunId: string;
  resumeToken: string;
}

export type HitlRequestResponse = HitlAnsweredResponse | HitlPausedResponse;

export interface KnowledgeRecordCandidateRequest {
  taskScope: string;
  page: Pick<PageIdentity, "origin" | "normalizedPath">;
  category: AttentionKnowledgeCategory;
  cue: string;
  rationale?: string;
  sourceObservationRef: string;
  sourceActionRef?: string;
}

export interface KnowledgeRecordCandidateResponse {
  accepted: true;
  candidateId: string;
}

export interface RunFinishRequest {
  reason: RefineFinishReason;
  summary: string;
}

export interface RunFinishResponse {
  accepted: true;
  finalStatus: "completed" | "failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPageIdentity(value: unknown): value is PageIdentity {
  if (!isRecord(value)) {
    return false;
  }
  return (
    hasNonEmptyString(value.url) &&
    hasNonEmptyString(value.origin) &&
    hasNonEmptyString(value.normalizedPath) &&
    hasNonEmptyString(value.title)
  );
}

function isObserveQueryMatch(value: unknown): value is ObserveQueryMatch {
  if (!isRecord(value)) {
    return false;
  }
  return (
    hasNonEmptyString(value.elementRef) &&
    hasNonEmptyString(value.sourceObservationRef) &&
    hasNonEmptyString(value.role) &&
    hasNonEmptyString(value.rawText) &&
    hasNonEmptyString(value.normalizedText)
  );
}

export function isObservePageResponse(value: unknown): value is ObservePageResponse {
  if (!isRecord(value) || !isRecord(value.observation)) {
    return false;
  }
  const observation = value.observation;
  return (
    hasNonEmptyString(observation.observationRef) &&
    hasNonEmptyString(observation.capturedAt) &&
    hasNonEmptyString(observation.snapshot) &&
    isPageIdentity(observation.page)
  );
}

export function isObserveQueryResponse(value: unknown): value is ObserveQueryResponse {
  if (!isRecord(value) || !isRecord(value.page)) {
    return false;
  }
  if (!hasNonEmptyString(value.observationRef)) {
    return false;
  }
  if (!hasNonEmptyString(value.page.origin) || !hasNonEmptyString(value.page.normalizedPath)) {
    return false;
  }
  if (!Array.isArray(value.matches)) {
    return false;
  }
  return value.matches.every((entry) => isObserveQueryMatch(entry));
}
