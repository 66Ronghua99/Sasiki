import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { AgentCheckpointRecord, AgentCheckpointWriter } from "../../contracts/runtime-telemetry.js";

class FileAgentCheckpointWriter implements AgentCheckpointWriter {
  private readonly filePath: string;

  constructor(runDir: string) {
    this.filePath = path.join(runDir, "agent_checkpoints", "checkpoints.jsonl");
  }

  async append(record: AgentCheckpointRecord): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf-8");
  }

  async dispose(): Promise<void> {
    // no-op
  }
}

class NoopAgentCheckpointWriter implements AgentCheckpointWriter {
  async append(): Promise<void> {
    // no-op
  }

  async dispose(): Promise<void> {
    // no-op
  }
}

export function createNoopAgentCheckpointWriter(): AgentCheckpointWriter {
  return new NoopAgentCheckpointWriter();
}

export { FileAgentCheckpointWriter };

