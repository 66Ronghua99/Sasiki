/**
 * Deps: none
 * Used By: core/agent-loop.ts, runtime/agent-runtime.ts, runtime/artifacts-writer.ts
 * Last Updated: 2026-03-04
 */
export type AgentRunStatus = "completed" | "failed" | "stalled" | "max_steps";

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
}
