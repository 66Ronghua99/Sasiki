/**
 * Deps: domain/sop-asset.ts
 * Used By: runtime/sop-consumption-context.ts, runtime/run-executor.ts, runtime/artifacts-writer.ts
 * Last Updated: 2026-03-05
 */
import type { WebElementHint } from "./sop-asset.js";

export type SopGuideSource = "semantic" | "asset" | "none";

export interface SopConsumptionRecord {
  enabled: boolean;
  originalTask: string;
  injected: boolean;
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
