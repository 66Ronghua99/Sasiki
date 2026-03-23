/**
 * Deps: none
 * Used By: kernel/pi-agent-loop.ts
 * Last Updated: 2026-03-23
 */
export type AgentRunStatus = "completed" | "failed" | "stalled" | "max_steps" | "paused_hitl" | "budget_exhausted";

export interface AgentStepRecord {
  stepIndex: number;
  action: string;
  reason: string;
  toolName?: string;
  toolArguments: Record<string, unknown>;
  resultExcerpt: string;
  progressed: boolean;
  error?: string;
}

export interface McpCallRecord {
  index: number;
  timestamp: string;
  phase: "start" | "end";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  isError?: boolean;
  resultExcerpt?: string;
}

export interface AssistantToolCallRecord {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AssistantTurnRecord {
  index: number;
  timestamp: string;
  stopReason?: string;
  text: string;
  thinking: string;
  toolCalls: AssistantToolCallRecord[];
  errorMessage?: string;
}

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

export interface AgentRunResult {
  runId?: string;
  artifactsDir?: string;
  task: string;
  status: AgentRunStatus;
  finishReason: string;
  steps: AgentStepRecord[];
  mcpCalls: McpCallRecord[];
  assistantTurns: AssistantTurnRecord[];
  finalScreenshotPath?: string;
  resumeRunId?: string;
  resumeToken?: string;
}

export interface PiAgentLoopProgressSnapshot {
  steps: AgentStepRecord[];
  mcpCalls: McpCallRecord[];
  assistantTurns: AssistantTurnRecord[];
  highLevelLogs: HighLevelLogEntry[];
}
