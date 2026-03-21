/**
 * Deps: node:path, infrastructure/persistence/*, application/refine/*
 * Used By: application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-21
 */
import path from "node:path";

import type { RuntimeConfig } from "../config/runtime-config.js";
import { AttentionGuidanceLoader } from "../refine/attention-guidance-loader.js";
import { AttentionKnowledgeStore } from "../../infrastructure/persistence/attention-knowledge-store.js";
import { RefineHitlResumeStore } from "../../infrastructure/persistence/refine-hitl-resume-store.js";

export interface RefinementExecutionContext {
  knowledgeStore: AttentionKnowledgeStore;
  guidanceLoader: AttentionGuidanceLoader;
  hitlResumeStore: RefineHitlResumeStore;
}

export class ExecutionContextProvider {
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
