/**
 * Deps: domain/sop-asset.ts
 * Used By: runtime/artifacts-writer.ts
 * Last Updated: 2026-03-06
 */
import type { WebElementHint } from "./sop-asset.js";

export type SopGuideSource = "semantic" | "asset" | "none";
export type SopSelectionMode = "none" | "auto" | "pinned";
export type SopTaskSource = "request" | "asset_task_hint";

export interface SopConsumptionRecord {
  enabled: boolean;
  originalTask: string;
  taskSource: SopTaskSource;
  injected: boolean;
  selectionMode: SopSelectionMode;
  pinnedRunId?: string;
  selectedAssetId?: string;
  candidateAssetIds: string[];
  candidateCount: number;
  siteHint?: string;
  guideSource: SopGuideSource;
  guidePath?: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  usedHints: WebElementHint[];
  generatedAt: string;
}

export interface SopConsumptionResult {
  taskForLoop: string;
  record: SopConsumptionRecord;
}
