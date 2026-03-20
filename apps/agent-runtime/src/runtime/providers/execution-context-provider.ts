/**
 * Deps: node:path, runtime/replay-refinement/*, runtime/runtime-config.ts, runtime/sop-asset-store.ts
 * Used By: runtime/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import path from "node:path";

import type { RuntimeConfig } from "../runtime-config.js";
import { SopAssetStore } from "../sop-asset-store.js";
import { AttentionGuidanceLoader } from "../replay-refinement/attention-guidance-loader.js";
import { AttentionKnowledgeStore } from "../replay-refinement/attention-knowledge-store.js";
import { RefineHitlResumeStore } from "../replay-refinement/refine-hitl-resume-store.js";

export interface ObserveExecutionContext {
  sopAssetStore: SopAssetStore;
}

export interface RefinementExecutionContext {
  knowledgeStore: AttentionKnowledgeStore;
  guidanceLoader: AttentionGuidanceLoader;
  hitlResumeStore: RefineHitlResumeStore;
}

export class ExecutionContextProvider {
  createObserveContext(config: RuntimeConfig): ObserveExecutionContext {
    return {
      sopAssetStore: new SopAssetStore(config.sopAssetRootDir),
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
