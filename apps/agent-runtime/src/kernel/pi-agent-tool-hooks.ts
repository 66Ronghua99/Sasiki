import type { ToolCallResult } from "../contracts/tool-client.js";

export interface PiAgentToolExecutionContext {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
  runtimeContext?: Record<string, unknown>;
}

export interface PiAgentToolHook {
  before?(context: PiAgentToolExecutionContext): Promise<unknown>;
  after?(
    context: PiAgentToolExecutionContext,
    result: ToolCallResult,
    capture: unknown,
  ): Promise<ToolCallResult | void>;
}

export type PiAgentToolHookRegistry = Map<string, PiAgentToolHook[]>;
