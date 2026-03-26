/**
 * Deps: domain/attention-knowledge.ts
 * Used By: runtime/replay-refinement/*
 * Last Updated: 2026-03-20
 */
import type { PageKnowledge } from "./attention-knowledge.js";

export const OBSERVE_QUERY_ALLOWED_NARROWING_FIELDS = ["mode", "text", "role", "elementRef", "limit"] as const;

export type ObserveQueryMode = "search" | "inspect";
export type RefineActionName = "click" | "type" | "press" | "navigate" | "select_tab" | "screenshot" | "file_upload";
export type RefineFinishReason = "goal_achieved" | "hard_failure";
export type ObservationReadiness = "ready" | "incomplete";

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
  observationReadiness?: ObservationReadiness;
  pageTab?: BrowserTabIdentity;
  taskRelevantTabs?: BrowserTabIdentity[];
  snapshot: string;
  capturedAt: string;
}

export interface ObservePageResponse {
  observation: PageObservation;
  pageKnowledge?: PageKnowledge[];
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
  page: Pick<PageIdentity, "origin" | "normalizedPath">;
  guide: string;
  keywords: string[];
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
  const allowedKeys = new Set(["url", "origin", "normalizedPath", "title"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return false;
  }
  return (
    hasNonEmptyString(value.url) &&
    hasNonEmptyString(value.origin) &&
    hasNonEmptyString(value.normalizedPath) &&
    hasNonEmptyString(value.title)
  );
}

function isBrowserTabIdentity(value: unknown): value is BrowserTabIdentity {
  if (!isRecord(value)) {
    return false;
  }
  const allowedKeys = new Set(["index", "url", "title", "isActive"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return false;
  }
  const index = value.index;
  const isActive = value.isActive;
  return (
    typeof index === "number" &&
    Number.isInteger(index) &&
    index >= 0 &&
    hasNonEmptyString(value.url) &&
    hasNonEmptyString(value.title) &&
    typeof isActive === "boolean"
  );
}

function isBrowserTabIdentityArray(value: unknown): value is BrowserTabIdentity[] {
  return Array.isArray(value) && value.every((entry) => isBrowserTabIdentity(entry));
}

function isObservationReadiness(value: unknown): value is ObservationReadiness {
  return value === "ready" || value === "incomplete";
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

function isPageKnowledge(value: unknown): value is PageKnowledge {
  if (!isRecord(value)) {
    return false;
  }
  const allowedKeys = new Set(["guide", "keywords"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return false;
  }
  const keywords = value.keywords;
  return (
    hasNonEmptyString(value.guide) &&
    Array.isArray(keywords) &&
    keywords.length > 0 &&
    keywords.length <= 3 &&
    keywords.every((entry) => hasNonEmptyString(entry))
  );
}

function isPageKnowledgeArray(value: unknown): value is PageKnowledge[] {
  return Array.isArray(value) && value.every((entry) => isPageKnowledge(entry));
}

export function isObservePageResponse(value: unknown): value is ObservePageResponse {
  if (!isRecord(value) || !isRecord(value.observation)) {
    return false;
  }
  const allowedKeys = new Set(["observation", "pageKnowledge"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return false;
  }
  const observation = value.observation;
  const observationAllowedKeys = new Set([
    "observationRef",
    "page",
    "tabs",
    "activeTabIndex",
    "activeTabMatchesPage",
    "observationReadiness",
    "pageTab",
    "taskRelevantTabs",
    "snapshot",
    "capturedAt",
  ]);
  if (Object.keys(observation).some((key) => !observationAllowedKeys.has(key))) {
    return false;
  }
  return (
    hasNonEmptyString(observation.observationRef) &&
    hasNonEmptyString(observation.capturedAt) &&
    hasNonEmptyString(observation.snapshot) &&
    isPageIdentity(observation.page) &&
    isBrowserTabIdentityArray(observation.tabs) &&
    (observation.activeTabIndex === undefined || Number.isInteger(observation.activeTabIndex)) &&
    (observation.activeTabMatchesPage === undefined || typeof observation.activeTabMatchesPage === "boolean") &&
    (observation.observationReadiness === undefined || isObservationReadiness(observation.observationReadiness)) &&
    (observation.pageTab === undefined || isBrowserTabIdentity(observation.pageTab)) &&
    (observation.taskRelevantTabs === undefined || isBrowserTabIdentityArray(observation.taskRelevantTabs)) &&
    (value.pageKnowledge === undefined || isPageKnowledgeArray(value.pageKnowledge))
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
