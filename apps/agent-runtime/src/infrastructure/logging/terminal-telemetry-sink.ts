import type {
  RuntimeEvent,
  RuntimeRunTelemetryScope,
  RuntimeTelemetrySink,
} from "../../contracts/runtime-telemetry.js";

export class TerminalTelemetrySink implements RuntimeTelemetrySink {
  constructor(private readonly config: { terminalEnabled: boolean; terminalMode: "progress" | "agent" }) {}

  async emit(event: RuntimeEvent): Promise<void> {
    if (!this.config.terminalEnabled) {
      return;
    }

    if (this.config.terminalMode === "agent") {
      this.renderAgentEvent(event);
      return;
    }

    this.renderProgressEvent(event);
  }

  async dispose(): Promise<void> {
    // no-op
  }

  private renderAgentEvent(event: RuntimeEvent): void {
    const payload = event.payload;
    if (event.eventType === "agent.turn") {
      const thinking = typeof payload.thinking === "string" ? payload.thinking.trim() : "";
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (thinking) {
        process.stdout.write(`[telemetry] ${event.workflow}:${event.runId}:thinking ${thinking}\n`);
      }
      if (text) {
        process.stdout.write(`[telemetry] ${event.workflow}:${event.runId}:text ${text}\n`);
      }
      if (thinking || text) {
        return;
      }
    }

    if (event.eventType === "workflow.lifecycle") {
      const phase = String(event.payload.phase ?? "");
      if (phase) {
        process.stdout.write(`[telemetry] ${event.workflow}:${event.runId}:${phase} ${JSON.stringify(payload)}\n`);
        return;
      }
    }
    process.stdout.write(`[telemetry] ${event.workflow}:${event.eventType} ${JSON.stringify(payload)}\n`);
  }

  private renderProgressEvent(event: RuntimeEvent): void {
    process.stdout.write(`[telemetry] ${event.workflow}:${event.eventType}\n`);
  }
}

export function createTerminalTelemetrySink(
  config: { terminalEnabled: boolean; terminalMode: "progress" | "agent" },
  _scope: RuntimeRunTelemetryScope
): RuntimeTelemetrySink {
  return new TerminalTelemetrySink(config);
}
