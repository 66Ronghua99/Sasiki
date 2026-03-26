/**
 * Deps: domain/attention-knowledge.ts
 * Used By: application/refine/refine-run-bootstrap-provider.ts, application/shell/runtime-composition-root.ts
 * Last Updated: 2026-03-20
 */
import type { AttentionKnowledge } from "../../domain/attention-knowledge.js";

export interface AttentionGuidanceQuery {
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
    for (const record of records) {
      validatePageKnowledgeRecord(record);
    }
    const guidance = [
      "Loaded prior page retrieval cues:",
      ...records.map((record, index) => `${index + 1}. ${record.guide} Keywords: ${record.keywords.join(", ")}`),
    ].join("\n");
    return {
      records,
      guidance,
    };
  }
}

function validatePageKnowledgeRecord(record: AttentionKnowledge): void {
  if (typeof record.guide !== "string" || !record.guide.trim()) {
    throw new Error(`invalid attention knowledge record: expected guide for page ${record.page.origin}${record.page.normalizedPath}`);
  }
  if (
    !Array.isArray(record.keywords) ||
    record.keywords.length < 1 ||
    record.keywords.length > 3 ||
    record.keywords.some((keyword) => typeof keyword !== "string" || !keyword.trim())
  ) {
    throw new Error(`invalid attention knowledge record: expected keywords for page ${record.page.origin}${record.page.normalizedPath}`);
  }
}
