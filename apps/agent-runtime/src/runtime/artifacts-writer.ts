/**
 * Deps: node:fs/promises, node:path, domain/agent-types.ts, domain/sop-trace.ts, domain/sop-asset.ts
 * Used By: runtime/agent-runtime.ts
 * Last Updated: 2026-03-04
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AgentStepRecord, AssistantTurnRecord, McpCallRecord } from "../domain/agent-types.js";
import type { SopAsset } from "../domain/sop-asset.js";
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

  private async writeJson(filename: string, value: unknown): Promise<void> {
    await writeFile(path.join(this.runDir, filename), `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  }

  private async writeJsonLines(filename: string, rows: unknown[]): Promise<void> {
    const lines = rows.map((row) => JSON.stringify(row)).join("\n");
    const output = lines ? `${lines}\n` : "";
    await writeFile(path.join(this.runDir, filename), output, "utf-8");
  }
}
