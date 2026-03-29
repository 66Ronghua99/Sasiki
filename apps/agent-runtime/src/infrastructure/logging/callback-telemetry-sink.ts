import type { RuntimeEvent, RuntimeTelemetrySink } from "../../contracts/runtime-telemetry.js";

export type RuntimeTelemetryEventListener = (event: RuntimeEvent) => void | Promise<void>;

export class CallbackTelemetrySink implements RuntimeTelemetrySink {
  constructor(private readonly listener: RuntimeTelemetryEventListener) {}

  async emit(event: RuntimeEvent): Promise<void> {
    await this.listener(event);
  }

  async dispose(): Promise<void> {
    // no-op
  }
}
