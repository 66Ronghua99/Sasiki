/**
 * Deps: domain/attention-knowledge.ts, infrastructure/persistence/attention-knowledge-store.ts
 * Used By: runtime/replay-refinement/react-refinement-run-executor.ts
 * Last Updated: 2026-03-20
 */
import type { AttentionKnowledge } from "../../domain/attention-knowledge.js";
import { AttentionKnowledgeStore, type AttentionKnowledgeQuery } from "../../infrastructure/persistence/attention-knowledge-store.js";

export interface LoadedAttentionGuidance {
  records: AttentionKnowledge[];
  guidance: string;
}

export class AttentionGuidanceLoader {
  private readonly store: AttentionKnowledgeStore;

  constructor(store: AttentionKnowledgeStore) {
    this.store = store;
  }

  async load(query: AttentionKnowledgeQuery): Promise<LoadedAttentionGuidance> {
    const records = await this.store.query(query);
    if (records.length === 0) {
      return {
        records,
        guidance: "",
      };
    }
    const guidance = [
      "Loaded prior attention guidance:",
      ...records.map((record, index) => `${index + 1}. [${record.category}] ${record.cue}`),
    ].join("\n");
    return {
      records,
      guidance,
    };
  }
}
