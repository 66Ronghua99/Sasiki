/**
 * Deps: domain/attention-knowledge.ts
 * Used By: application/refine/refine-run-bootstrap-provider.ts, application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-20
 */
import type { AttentionKnowledge } from "../../domain/attention-knowledge.js";

export interface AttentionGuidanceQuery {
  taskScope: string;
  page: {
    origin: string;
    normalizedPath: string;
  };
  limit?: number;
}

export interface AttentionGuidanceStore {
  query(request: AttentionGuidanceQuery): Promise<AttentionKnowledge[]>;
}

export interface LoadedAttentionGuidance {
  records: AttentionKnowledge[];
  guidance: string;
}

export class AttentionGuidanceLoader {
  private readonly store: AttentionGuidanceStore;

  constructor(store: AttentionGuidanceStore) {
    this.store = store;
  }

  async load(query: AttentionGuidanceQuery): Promise<LoadedAttentionGuidance> {
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
