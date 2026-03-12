/**
 * Deps: node:crypto, node:fs/promises, node:os, node:path
 * Used By: runtime/replay-refinement/online-refinement-orchestrator.ts
 * Last Updated: 2026-03-12
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const DEFAULT_REFINEMENT_KNOWLEDGE_ROOT_DIR = "~/.sasiki/refinement_knowledge";
export const REFINEMENT_KNOWLEDGE_ESTIMATED_TOP_N = 8;

const INDEX_SCHEMA_VERSION = "refinement_knowledge_index.v0";

export type RefinementKnowledgeType =
  | "element_affordance"
  | "branch_guard"
  | "completion_signal"
  | "recovery_rule"
  | "noise_pattern";

export type RefinementKnowledgeConfidence = "high" | "medium" | "low";
export type RefinementKnowledgeStatus = "active" | "superseded" | "held";

export interface RefinementKnowledgeProvenance {
  runId: string;
  pageId: string;
  stepIndex: number;
  snapshot_hash: string;
}

export interface PromotedKnowledgeRecord {
  schemaVersion: "refinement_knowledge.v0";
  knowledgeId: string;
  knowledgeType: RefinementKnowledgeType;
  surfaceKey: string;
  taskKey: string;
  instruction: string;
  sourceStepIds: string[];
  confidence: RefinementKnowledgeConfidence;
  rationale: string;
  critic_challenge: string[];
  final_decision: "promote" | "hold";
  provenance: RefinementKnowledgeProvenance;
  status: RefinementKnowledgeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PromotedKnowledgeUpsertInput {
  knowledgeId?: string;
  knowledgeType: RefinementKnowledgeType;
  surfaceKey: string;
  taskKey: string;
  instruction: string;
  sourceStepIds?: string[];
  confidence?: RefinementKnowledgeConfidence;
  rationale?: string;
  criticChallenge?: string[];
  finalDecision?: "promote" | "hold";
  provenance: RefinementKnowledgeProvenance;
  status?: RefinementKnowledgeStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface RefinementKnowledgeQuery {
  surfaceKey: string;
  taskKey: string;
  topN?: number;
}

export interface RefinementMemoryStoreOptions {
  rootDir?: string;
  defaultTopN?: number;
}

interface RefinementKnowledgeIndex {
  version: typeof INDEX_SCHEMA_VERSION;
  updatedAt: string;
  entries: Record<string, Record<string, string[]>>;
}

export interface KnowledgeIdentityInput {
  surfaceKey: string;
  taskKey: string;
  knowledgeType: RefinementKnowledgeType;
  instruction: string;
}

export function canonicalizeSurfaceKey(surfaceKey: string): string {
  const normalized = surfaceKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  if (!normalized) {
    return "";
  }
  if (normalized.includes(".")) {
    return normalized;
  }
  return "";
}

export function canonicalizeTaskKey(taskKey: string): string {
  const normalized = taskKey
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("task_")) {
    return normalized;
  }
  const digest = createHash("sha256").update(normalized, "utf-8").digest("hex").slice(0, 16);
  return `task_${digest}`;
}

export function normalizeInstruction(instruction: string): string {
  return instruction.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildKnowledgeId(input: KnowledgeIdentityInput): string {
  const source = [
    canonicalizeSurfaceKey(input.surfaceKey),
    canonicalizeTaskKey(input.taskKey),
    input.knowledgeType.trim().toLowerCase(),
    normalizeInstruction(input.instruction),
  ].join("|");
  const digest = createHash("sha256").update(source, "utf-8").digest("hex");
  return `kg_${digest}`;
}

export class RefinementMemoryStore {
  private readonly rootDir: string;
  private readonly indexPath: string;
  private readonly recordsDir: string;
  private readonly defaultTopN: number;

  constructor(options?: RefinementMemoryStoreOptions) {
    this.rootDir = this.expandHome(options?.rootDir ?? DEFAULT_REFINEMENT_KNOWLEDGE_ROOT_DIR);
    this.indexPath = path.join(this.rootDir, "index.json");
    this.recordsDir = path.join(this.rootDir, "records");
    this.defaultTopN = this.normalizeLimit(options?.defaultTopN, REFINEMENT_KNOWLEDGE_ESTIMATED_TOP_N);
  }

  async upsert(input: PromotedKnowledgeUpsertInput): Promise<PromotedKnowledgeRecord> {
    await this.ensureStoreDirectories();

    const now = new Date().toISOString();
    const surfaceKey = canonicalizeSurfaceKey(input.surfaceKey);
    const taskKey = canonicalizeTaskKey(input.taskKey);
    if (!surfaceKey || !taskKey) {
      throw new Error("refinement knowledge upsert requires non-empty surfaceKey/taskKey");
    }

    const knowledgeId =
      input.knowledgeId?.trim() ||
      buildKnowledgeId({
        surfaceKey,
        taskKey,
        knowledgeType: input.knowledgeType,
        instruction: input.instruction,
      });

    const existing = await this.readRecord(knowledgeId);
    const merged = this.mergeRecord(existing, input, knowledgeId, surfaceKey, taskKey, now);

    await this.writeRecord(merged);

    const index = await this.readIndex();
    if (existing) {
      this.removeKnowledgeIdFromIndex(
        index,
        canonicalizeSurfaceKey(existing.surfaceKey),
        canonicalizeTaskKey(existing.taskKey),
        knowledgeId
      );
    }
    this.addKnowledgeIdToIndex(index, surfaceKey, taskKey, knowledgeId);
    await this.sortIndexBucket(index, surfaceKey, taskKey);
    if (
      existing &&
      (canonicalizeSurfaceKey(existing.surfaceKey) !== surfaceKey || canonicalizeTaskKey(existing.taskKey) !== taskKey)
    ) {
      await this.sortIndexBucket(
        index,
        canonicalizeSurfaceKey(existing.surfaceKey),
        canonicalizeTaskKey(existing.taskKey)
      );
    }

    index.updatedAt = now;
    await this.writeIndex(index);
    return merged;
  }

  async queryBySurfaceTask(query: RefinementKnowledgeQuery): Promise<PromotedKnowledgeRecord[]> {
    const surfaceKey = canonicalizeSurfaceKey(query.surfaceKey);
    const taskKey = canonicalizeTaskKey(query.taskKey);
    if (!surfaceKey || !taskKey) {
      return [];
    }

    const index = await this.readIndex();
    const knowledgeIds = index.entries[surfaceKey]?.[taskKey] ?? [];
    if (knowledgeIds.length === 0) {
      return [];
    }

    const records = await this.readManyRecords(knowledgeIds);
    const activeRecords = records.filter((record) => record.status === "active");
    activeRecords.sort((left, right) => this.compareRecords(left, right));

    const limit = this.normalizeLimit(query.topN, this.defaultTopN);
    return activeRecords.slice(0, limit);
  }

  async getByKnowledgeId(knowledgeId: string): Promise<PromotedKnowledgeRecord | null> {
    if (!knowledgeId.trim()) {
      return null;
    }
    return this.readRecord(knowledgeId.trim());
  }

  private mergeRecord(
    existing: PromotedKnowledgeRecord | null,
    input: PromotedKnowledgeUpsertInput,
    knowledgeId: string,
    surfaceKey: string,
    taskKey: string,
    now: string
  ): PromotedKnowledgeRecord {
    const sourceStepIds = this.uniqueStrings([
      ...(existing?.sourceStepIds ?? []),
      ...(Array.isArray(input.sourceStepIds) ? input.sourceStepIds : []),
    ]);

    return {
      schemaVersion: "refinement_knowledge.v0",
      knowledgeId,
      knowledgeType: input.knowledgeType,
      surfaceKey,
      taskKey,
      instruction: input.instruction.trim(),
      sourceStepIds,
      confidence: input.confidence ?? existing?.confidence ?? "medium",
      rationale: input.rationale?.trim() || existing?.rationale || "",
      critic_challenge: this.uniqueStrings([...(existing?.critic_challenge ?? []), ...(input.criticChallenge ?? [])]),
      final_decision: input.finalDecision ?? existing?.final_decision ?? "hold",
      provenance: input.provenance ?? existing?.provenance,
      status: input.status ?? existing?.status ?? "active",
      createdAt: existing?.createdAt ?? input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    };
  }

  private async ensureStoreDirectories(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await mkdir(this.recordsDir, { recursive: true });
  }

  private async readManyRecords(knowledgeIds: string[]): Promise<PromotedKnowledgeRecord[]> {
    const records = await Promise.all(knowledgeIds.map((knowledgeId) => this.readRecord(knowledgeId)));
    return records.filter((record): record is PromotedKnowledgeRecord => record !== null);
  }

  private async sortIndexBucket(index: RefinementKnowledgeIndex, surfaceKey: string, taskKey: string): Promise<void> {
    const bucket = index.entries[surfaceKey];
    const current = bucket?.[taskKey];
    if (!bucket || !Array.isArray(current) || current.length === 0) {
      return;
    }
    const records = await this.readManyRecords(current);
    if (records.length === 0) {
      delete bucket[taskKey];
      if (Object.keys(bucket).length === 0) {
        delete index.entries[surfaceKey];
      }
      return;
    }

    records.sort((left, right) => this.compareRecords(left, right));
    bucket[taskKey] = records.map((record) => record.knowledgeId);
  }

  private compareRecords(left: PromotedKnowledgeRecord, right: PromotedKnowledgeRecord): number {
    const statusDelta = this.statusRank(right.status) - this.statusRank(left.status);
    if (statusDelta !== 0) {
      return statusDelta;
    }
    const confidenceDelta = this.confidenceRank(right.confidence) - this.confidenceRank(left.confidence);
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }
    const updatedDelta = right.updatedAt.localeCompare(left.updatedAt);
    if (updatedDelta !== 0) {
      return updatedDelta;
    }
    return right.createdAt.localeCompare(left.createdAt);
  }

  private statusRank(status: RefinementKnowledgeStatus): number {
    switch (status) {
      case "active":
        return 3;
      case "held":
        return 2;
      case "superseded":
      default:
        return 1;
    }
  }

  private confidenceRank(confidence: RefinementKnowledgeConfidence): number {
    switch (confidence) {
      case "high":
        return 3;
      case "medium":
        return 2;
      case "low":
      default:
        return 1;
    }
  }

  private addKnowledgeIdToIndex(
    index: RefinementKnowledgeIndex,
    surfaceKey: string,
    taskKey: string,
    knowledgeId: string
  ): void {
    if (!index.entries[surfaceKey]) {
      index.entries[surfaceKey] = {};
    }
    if (!index.entries[surfaceKey][taskKey]) {
      index.entries[surfaceKey][taskKey] = [];
    }
    const next = this.uniqueStrings([knowledgeId, ...index.entries[surfaceKey][taskKey]]);
    index.entries[surfaceKey][taskKey] = next;
  }

  private removeKnowledgeIdFromIndex(
    index: RefinementKnowledgeIndex,
    surfaceKey: string,
    taskKey: string,
    knowledgeId: string
  ): void {
    const bucket = index.entries[surfaceKey];
    const scoped = bucket?.[taskKey];
    if (!bucket || !Array.isArray(scoped)) {
      return;
    }
    bucket[taskKey] = scoped.filter((item) => item !== knowledgeId);
    if (bucket[taskKey].length === 0) {
      delete bucket[taskKey];
    }
    if (Object.keys(bucket).length === 0) {
      delete index.entries[surfaceKey];
    }
  }

  private async readIndex(): Promise<RefinementKnowledgeIndex> {
    try {
      const raw = await readFile(this.indexPath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<RefinementKnowledgeIndex>;
      if (!parsed || typeof parsed !== "object" || !parsed.entries || typeof parsed.entries !== "object") {
        return this.emptyIndex();
      }
      return {
        version: INDEX_SCHEMA_VERSION,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
        entries: parsed.entries as Record<string, Record<string, string[]>>,
      };
    } catch {
      return this.emptyIndex();
    }
  }

  private async writeIndex(index: RefinementKnowledgeIndex): Promise<void> {
    await writeFile(this.indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
  }

  private async readRecord(knowledgeId: string): Promise<PromotedKnowledgeRecord | null> {
    const recordPath = this.recordPath(knowledgeId);
    try {
      const raw = await readFile(recordPath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<PromotedKnowledgeRecord>;
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      if (typeof parsed.knowledgeId !== "string" || !parsed.knowledgeId.trim()) {
        return null;
      }
      if (typeof parsed.surfaceKey !== "string" || typeof parsed.taskKey !== "string") {
        return null;
      }
      if (typeof parsed.instruction !== "string" || typeof parsed.knowledgeType !== "string") {
        return null;
      }
      return {
        schemaVersion: "refinement_knowledge.v0",
        knowledgeId: parsed.knowledgeId,
        knowledgeType: parsed.knowledgeType as RefinementKnowledgeType,
        surfaceKey: parsed.surfaceKey,
        taskKey: parsed.taskKey,
        instruction: parsed.instruction,
        sourceStepIds: Array.isArray(parsed.sourceStepIds) ? parsed.sourceStepIds.filter((item) => typeof item === "string") : [],
        confidence:
          parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
            ? parsed.confidence
            : "medium",
        rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
        critic_challenge: Array.isArray(parsed.critic_challenge)
          ? parsed.critic_challenge.filter((item): item is string => typeof item === "string")
          : [],
        final_decision: parsed.final_decision === "promote" || parsed.final_decision === "hold" ? parsed.final_decision : "hold",
        provenance: parsed.provenance as RefinementKnowledgeProvenance,
        status:
          parsed.status === "active" || parsed.status === "superseded" || parsed.status === "held"
            ? parsed.status
            : "active",
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  private async writeRecord(record: PromotedKnowledgeRecord): Promise<void> {
    await writeFile(this.recordPath(record.knowledgeId), `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  }

  private recordPath(knowledgeId: string): string {
    return path.join(this.recordsDir, `${knowledgeId}.json`);
  }

  private emptyIndex(): RefinementKnowledgeIndex {
    return {
      version: INDEX_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      entries: {},
    };
  }

  private uniqueStrings(values: string[]): string[] {
    const output: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
      if (typeof value !== "string") {
        continue;
      }
      const normalized = value.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      output.push(normalized);
      seen.add(normalized);
    }
    return output;
  }

  private normalizeLimit(value: number | undefined, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return Math.max(1, Math.floor(value));
  }

  private expandHome(inputPath: string): string {
    if (inputPath === "~") {
      return homedir();
    }
    if (inputPath.startsWith("~/")) {
      return path.join(homedir(), inputPath.slice(2));
    }
    return inputPath;
  }
}
