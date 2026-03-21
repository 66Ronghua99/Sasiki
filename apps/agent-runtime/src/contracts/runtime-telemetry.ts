export type RuntimeWorkflowKind = "observe" | "compact" | "refine";

export type RuntimeTelemetryArtifactCheckpointMode = "off" | "key_turns" | "all_turns";

export interface RuntimeEvent {
  timestamp: string;
  workflow: RuntimeWorkflowKind;
  runId: string;
  eventType: string;
  turnIndex?: number;
  stepIndex?: number;
  payload: Record<string, unknown>;
}

export interface RuntimeTelemetrySink {
  emit(event: RuntimeEvent): Promise<void>;
  dispose?(): Promise<void>;
}

export interface RuntimeEventBus {
  emit(event: RuntimeEvent): Promise<void>;
  dispose(): Promise<void>;
}

export interface AgentCheckpointRecord {
  timestamp: string;
  runId: string;
  workflow: RuntimeWorkflowKind;
  reason: string;
  turnIndex?: number;
  stepIndex?: number;
  payload: Record<string, unknown>;
}

export interface AgentCheckpointWriter {
  append(record: AgentCheckpointRecord): Promise<void>;
  dispose(): Promise<void>;
}

export interface RuntimeRunTelemetryScope {
  workflow: RuntimeWorkflowKind;
  runId: string;
  artifactsDir: string;
}

export interface RuntimeRunTelemetryArtifacts {
  scope: RuntimeRunTelemetryScope;
  artifactsDir: string;
  checkpointMode: RuntimeTelemetryArtifactCheckpointMode;
  checkpoints: AgentCheckpointWriter;
  dispose(): Promise<void>;
}

export interface RuntimeRunTelemetry {
  eventBus: RuntimeEventBus;
  artifacts: RuntimeRunTelemetryArtifacts;
  dispose(): Promise<void>;
}

export interface RuntimeTelemetryRegistry {
  createRunTelemetry(scope: RuntimeRunTelemetryScope): RuntimeRunTelemetry;
}
