/**
 * Deps: node:path, runtime/replay-refinement/*, runtime/runtime-config.ts, runtime/sop-consumption-context.ts, runtime/sop-asset-store.ts
 * Used By: runtime/runtime-composition-root.ts
 * Last Updated: 2026-03-20
 */
import path from "node:path";

import type { RuntimeConfig } from "../runtime-config.js";
import { SopAssetStore } from "../sop-asset-store.js";
import { SopConsumptionContextBuilder } from "../sop-consumption-context.js";
import { AttentionGuidanceLoader } from "../replay-refinement/attention-guidance-loader.js";
import { AttentionKnowledgeStore } from "../replay-refinement/attention-knowledge-store.js";
import { RefineHitlResumeStore } from "../replay-refinement/refine-hitl-resume-store.js";

export interface LegacyRunExecutionContext {
  sopAssetStore: SopAssetStore;
  sopConsumptionContext: SopConsumptionContextBuilder;
}

export interface RefinementExecutionContext {
  knowledgeStore: AttentionKnowledgeStore;
  guidanceLoader: AttentionGuidanceLoader;
  hitlResumeStore: RefineHitlResumeStore;
}

export class ExecutionContextProvider {
  createLegacyRunContext(config: RuntimeConfig): LegacyRunExecutionContext {
    const sopAssetStore = new SopAssetStore(config.sopAssetRootDir);
    return {
      sopAssetStore,
      sopConsumptionContext: new SopConsumptionContextBuilder({
        enabled: config.sopConsumptionEnabled,
        topN: config.sopConsumptionTopN,
        hintsLimit: config.sopConsumptionHintsLimit,
        maxGuideChars: config.sopConsumptionMaxGuideChars,
        assetStore: sopAssetStore,
      }),
    };
  }

  createRefinementContext(config: RuntimeConfig): RefinementExecutionContext {
    const knowledgeStore = new AttentionKnowledgeStore({
      filePath: path.join(config.artifactsDir, "refinement", "attention-knowledge-store.json"),
    });
    return {
      knowledgeStore,
      guidanceLoader: new AttentionGuidanceLoader(knowledgeStore),
      hitlResumeStore: new RefineHitlResumeStore({
        baseDir: config.artifactsDir,
      }),
    };
  }
}
