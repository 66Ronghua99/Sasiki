/**
 * Deps: node:fs/promises, node:path
 * Used By: application/refine/refine-run-bootstrap-provider.ts
 * Last Updated: 2026-03-21
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface RefineHitlResumeRecord {
  runId: string;
  task: string;
  prompt: string;
  context?: string;
  resumeToken: string;
  createdAt: string;
}

export interface RefineHitlResumeStoreOptions {
  baseDir: string;
}

export class RefineHitlResumeStore {
  private readonly baseDir: string;

  constructor(options: RefineHitlResumeStoreOptions) {
    this.baseDir = path.resolve(options.baseDir);
  }

  async save(record: RefineHitlResumeRecord): Promise<string> {
    const filePath = this.recordPath(record.runId);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
    return filePath;
  }

  async load(runId: string): Promise<RefineHitlResumeRecord | undefined> {
    const filePath = this.recordPath(runId);
    try {
      const raw = await readFile(filePath, "utf-8");
      return JSON.parse(raw) as RefineHitlResumeRecord;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("ENOENT")) {
        return undefined;
      }
      throw error;
    }
  }

  private recordPath(runId: string): string {
    return path.join(this.baseDir, runId, "hitl_resume.json");
  }
}
