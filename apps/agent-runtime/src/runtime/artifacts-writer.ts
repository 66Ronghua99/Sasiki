/**
 * Deps: node:fs/promises, node:path, domain/agent-types.ts, domain/intervention-learning.ts, domain/sop-trace.ts, domain/sop-asset.ts, domain/sop-consumption.ts, domain/refinement-knowledge.ts
 * Used By: runtime/run-executor.ts, runtime/observe-executor.ts, runtime/interactive-sop-compact.ts
 * Last Updated: 2026-03-12
 */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AgentStepRecord, AssistantTurnRecord, McpCallRecord } from "../domain/agent-types.js";
import type {
  CompactCapabilityOutput,
  CompactHumanLoopEvent,
  CompactSessionState,
} from "../domain/compact-reasoning.js";
import type { HighLevelLogEntry } from "../domain/high-level-log.js";
import type { InterventionLearningRecord } from "../domain/intervention-learning.js";
import type {
  PromotedKnowledgeRecord,
  RefinementSnapshotIndexRecord,
  RefinementStepRecord,
} from "../domain/refinement-knowledge.js";
import type { SopAsset } from "../domain/sop-asset.js";
import type { SopConsumptionRecord } from "../domain/sop-consumption.js";
import type { DemonstrationRawEvent, SopTrace } from "../domain/sop-trace.js";

export class ArtifactsWriter {
  readonly runId: string;
  readonly runDir: string;

  constructor(baseDir: string, runId: string) {
    this.runId = runId;
    this.runDir = path.resolve(baseDir, runId);
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.runDir, { recursive: true });
  }

  async writeSteps(steps: AgentStepRecord[]): Promise<void> {
    await this.writeJson("steps.json", steps);
  }

  async writeMcpCalls(calls: McpCallRecord[]): Promise<void> {
    await this.writeJsonLines("mcp_calls.jsonl", calls);
  }

  async writeAssistantTurns(turns: AssistantTurnRecord[]): Promise<void> {
    await this.writeJson("assistant_turns.json", turns);
  }

  async writeHighLevelLogs(entries: HighLevelLogEntry[]): Promise<void> {
    await this.writeJson("high_level_logs.json", entries);
  }

  async appendInterventionLearning(record: InterventionLearningRecord): Promise<void> {
    await appendFile(path.join(this.runDir, "intervention_learning.jsonl"), `${JSON.stringify(record)}\n`, "utf-8");
  }

  async writeDemonstrationRaw(events: DemonstrationRawEvent[]): Promise<void> {
    await this.writeJsonLines("demonstration_raw.jsonl", events);
  }

  async writeDemonstrationTrace(trace: SopTrace): Promise<void> {
    await this.writeJson("demonstration_trace.json", trace);
  }

  async writeSopDraft(markdown: string): Promise<void> {
    const content = markdown.endsWith("\n") ? markdown : `${markdown}\n`;
    await writeFile(path.join(this.runDir, "sop_draft.md"), content, "utf-8");
  }

  async writeSopAsset(asset: SopAsset): Promise<void> {
    await this.writeJson("sop_asset.json", asset);
  }

  async writeSopConsumption(record: SopConsumptionRecord): Promise<void> {
    await this.writeJson("sop_consumption.json", record);
  }

  async writeRefinementSteps(records: RefinementStepRecord[]): Promise<void> {
    await this.writeJsonLines("refinement_steps.jsonl", records);
  }

  async writeSnapshotIndex(records: RefinementSnapshotIndexRecord[]): Promise<void> {
    await this.writeJsonLines("snapshot_index.jsonl", records);
  }

  async writeRefinementKnowledge(records: PromotedKnowledgeRecord[]): Promise<void> {
    await this.writeJsonLines("refinement_knowledge.jsonl", records);
  }

  async writeConsumptionBundle(bundle: unknown): Promise<void> {
    await this.writeJson("consumption_bundle.json", bundle);
  }

  async initializeRefinementArtifacts(): Promise<void> {
    await Promise.all([
      this.writeRefinementSteps([]),
      this.writeSnapshotIndex([]),
      this.writeRefinementKnowledge([]),
    ]);
  }

  async resetCompactSessionArtifacts(sessionId: string): Promise<void> {
    await this.ensureCompactSessionDir(sessionId);
    await this.writeRaw("compact_human_loop.jsonl", "");
    await this.writeCompactSessionRaw(sessionId, "compact_human_loop.jsonl", "");
  }

  async writeCompactSessionState(state: CompactSessionState, sessionId?: string): Promise<void> {
    await this.writeJson("compact_session_state.json", state);
    if (sessionId) {
      await this.writeCompactSessionJson(sessionId, "compact_session_state.json", state);
    }
  }

  async appendCompactHumanLoop(event: CompactHumanLoopEvent, sessionId?: string): Promise<void> {
    const line = `${JSON.stringify(event)}\n`;
    await appendFile(path.join(this.runDir, "compact_human_loop.jsonl"), line, "utf-8");
    if (sessionId) {
      await appendFile(this.compactSessionPath(sessionId, "compact_human_loop.jsonl"), line, "utf-8");
    }
  }

  async writeCompactCapabilityOutput(output: CompactCapabilityOutput, sessionId?: string): Promise<void> {
    await this.writeJson("compact_capability_output.json", output);
    if (sessionId) {
      await this.writeCompactSessionJson(sessionId, "compact_capability_output.json", output);
    }
  }

  async writeRuntimeLog(runtimeLog: string): Promise<void> {
    await writeFile(path.join(this.runDir, "runtime.log"), runtimeLog, "utf-8");
  }

  demonstrationRawPath(): string {
    return path.join(this.runDir, "demonstration_raw.jsonl");
  }

  demonstrationTracePath(): string {
    return path.join(this.runDir, "demonstration_trace.json");
  }

  sopDraftPath(): string {
    return path.join(this.runDir, "sop_draft.md");
  }

  sopAssetPath(): string {
    return path.join(this.runDir, "sop_asset.json");
  }

  finalScreenshotPath(): string {
    return path.join(this.runDir, "final.png");
  }

  compactSessionDir(sessionId: string): string {
    return path.join(this.runDir, "compact_sessions", sessionId);
  }

  private async writeJson(filename: string, value: unknown): Promise<void> {
    await writeFile(path.join(this.runDir, filename), `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  }

  private async writeJsonLines(filename: string, rows: unknown[]): Promise<void> {
    const lines = rows.map((row) => JSON.stringify(row)).join("\n");
    const output = lines ? `${lines}\n` : "";
    await writeFile(path.join(this.runDir, filename), output, "utf-8");
  }

  private compactSessionPath(sessionId: string, filename: string): string {
    return path.join(this.compactSessionDir(sessionId), filename);
  }

  private async ensureCompactSessionDir(sessionId: string): Promise<void> {
    await mkdir(this.compactSessionDir(sessionId), { recursive: true });
  }

  private async writeCompactSessionJson(sessionId: string, filename: string, value: unknown): Promise<void> {
    await this.ensureCompactSessionDir(sessionId);
    await writeFile(this.compactSessionPath(sessionId, filename), `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  }

  private async writeCompactSessionRaw(sessionId: string, filename: string, content: string): Promise<void> {
    await this.ensureCompactSessionDir(sessionId);
    await writeFile(this.compactSessionPath(sessionId, filename), content, "utf-8");
  }

  private async writeRaw(filename: string, content: string): Promise<void> {
    await writeFile(path.join(this.runDir, filename), content, "utf-8");
  }
}
