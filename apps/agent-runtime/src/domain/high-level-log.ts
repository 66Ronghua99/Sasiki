/**
 * Deps: none
 * Used By: core/agent-loop.ts, runtime/run-executor.ts, runtime/artifacts-writer.ts
 * Last Updated: 2026-03-06
 */
export type HighLevelLogStage = "read" | "judge" | "action" | "result" | "intervention";
export type HighLevelLogStatus = "info" | "warning" | "error";
export type HighLevelLogSource = "assistant" | "tool" | "runtime" | "human";

export interface HighLevelLogEntry {
  index: number;
  timestamp: string;
  stage: HighLevelLogStage;
  status: HighLevelLogStatus;
  source: HighLevelLogSource;
  summary: string;
  detail?: string;
  turnIndex?: number;
  stepIndex?: number;
  toolName?: string;
  toolCallId?: string;
  actionName?: string;
  progressed?: boolean;
  data?: Record<string, unknown>;
}
