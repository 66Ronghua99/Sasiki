export type AgentRunStatus = "completed" | "failed" | "stalled" | "max_steps";

export type PlannedActionName =
  | "navigate"
  | "click"
  | "type"
  | "press_key"
  | "wait_for"
  | "done";

export interface PlannedAction {
  action: PlannedActionName;
  reason?: string;
  url?: string;
  ref?: string;
  text?: string;
  key?: string;
  seconds?: number;
  submit?: boolean;
}

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

export interface AgentRunResult {
  task: string;
  status: AgentRunStatus;
  finishReason: string;
  steps: AgentStepRecord[];
}
