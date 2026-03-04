/**
 * Deps: none
 * Used By: runtime/artifacts-writer.ts, runtime/sop-asset-store.ts
 * Last Updated: 2026-03-04
 */
export const SOP_ASSET_VERSION = "v0" as const;

export interface WebElementHint {
  stepIndex: number;
  purpose: string;
  selector?: string;
  textHint?: string;
  roleHint?: string;
}

export interface SopAsset {
  assetVersion: typeof SOP_ASSET_VERSION;
  assetId: string;
  site: string;
  taskHint: string;
  tags: string[];
  tracePath: string;
  draftPath: string;
  guidePath: string;
  webElementHints: WebElementHint[];
  createdAt: string;
}

export interface SopAssetQuery {
  site?: string;
  tag?: string;
  taskHint?: string;
  limit?: number;
}
