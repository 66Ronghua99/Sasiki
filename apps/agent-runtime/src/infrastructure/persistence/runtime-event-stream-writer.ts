import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { RuntimeEvent, RuntimeTelemetrySink } from "../../contracts/runtime-telemetry.js";

export class RuntimeEventStreamWriter implements RuntimeTelemetrySink {
  private readonly filePath: string;

  constructor(runDir: string) {
    this.filePath = path.join(runDir, "event_stream.jsonl");
  }

  async emit(event: RuntimeEvent): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(event)}\n`, "utf-8");
  }

  async dispose(): Promise<void> {
    // no-op
  }
}

