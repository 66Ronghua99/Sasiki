import type { ToolCallResult } from "../../../contracts/tool-client.js";
import type { RefineToolContext } from "./refine-tool-context.js";
import type { RefineToolDefinition } from "./refine-tool-definition.js";

export interface RefineToolCall<TContext extends RefineToolContext = RefineToolContext> {
  readonly definition: RefineToolDefinition<TContext>;
  readonly args: Record<string, unknown>;
  readonly context: TContext;
}

export interface RefineToolCallResult<TContext extends RefineToolContext = RefineToolContext> extends RefineToolCall<TContext> {
  readonly result: ToolCallResult;
}

export interface RefineToolHookPipeline<TContext extends RefineToolContext = RefineToolContext> {
  beforeToolCall?(call: RefineToolCall<TContext>): Promise<void>;
  afterToolCall?(call: RefineToolCallResult<TContext>): Promise<void>;
}

class NoOpRefineToolHookPipeline implements RefineToolHookPipeline {
  async beforeToolCall(): Promise<void> {}
  async afterToolCall(): Promise<void> {}
}

export const NO_OP_REFINE_TOOL_HOOK_PIPELINE: RefineToolHookPipeline = new NoOpRefineToolHookPipeline();
