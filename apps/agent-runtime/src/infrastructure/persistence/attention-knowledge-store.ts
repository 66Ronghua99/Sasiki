/**
 * Deps: node:fs/promises, node:path, domain/attention-knowledge.ts
 * Used By: runtime/replay-refinement/react-refinement-run-executor.ts
 * Last Updated: 2026-03-21
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AttentionKnowledge } from "../../domain/attention-knowledge.js";

export interface AttentionKnowledgeQuery {
  taskScope: string;
  page: {
    origin: string;
    normalizedPath: string;
  };
  limit?: number;
}

export interface AttentionKnowledgeStoreOptions {
  filePath: string;
}

export class AttentionKnowledgeStore {
  private readonly filePath: string;

  constructor(options: AttentionKnowledgeStoreOptions) {
    this.filePath = path.resolve(options.filePath);
  }

  async append(entries: AttentionKnowledge[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    const existing = await this.readAll();
    existing.push(...entries);
    await this.writeAll(existing);
  }

  async query(request: AttentionKnowledgeQuery): Promise<AttentionKnowledge[]> {
    const limit = Number.isFinite(request.limit) && (request.limit ?? 0) > 0 ? Math.floor(request.limit as number) : 8;
    const entries = await this.readAll();
    return entries
      .filter(
        (item) =>
          item.taskScope === request.taskScope &&
          item.page.origin === request.page.origin &&
          item.page.normalizedPath === request.page.normalizedPath
      )
      .sort((a, b) => b.promotedAt.localeCompare(a.promotedAt))
      .slice(0, limit);
  }

  private async readAll(): Promise<AttentionKnowledge[]> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as AttentionKnowledge[]) : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("ENOENT")) {
        return [];
      }
      throw error;
    }
  }

  private async writeAll(entries: AttentionKnowledge[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(entries, null, 2)}\n`, "utf-8");
  }
}
