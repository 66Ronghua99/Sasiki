/**
 * Deps: node:fs/promises, node:path
 * Used By: runtime/agent-runtime.ts
 * Last Updated: 2026-03-04
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AgentStepRecord, McpCallRecord } from "../domain/agent-types.js";

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
    const lines = calls.map((call) => JSON.stringify(call)).join("\n");
    const output = lines ? `${lines}\n` : "";
    await writeFile(path.join(this.runDir, "mcp_calls.jsonl"), output, "utf-8");
  }

  async writeRuntimeLog(runtimeLog: string): Promise<void> {
    await writeFile(path.join(this.runDir, "runtime.log"), runtimeLog, "utf-8");
  }

  finalScreenshotPath(): string {
    return path.join(this.runDir, "final.png");
  }

  private async writeJson(filename: string, value: unknown): Promise<void> {
    await writeFile(path.join(this.runDir, filename), `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  }
}
