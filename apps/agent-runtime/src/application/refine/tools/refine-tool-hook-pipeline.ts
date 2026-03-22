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

export interface RefineToolHookPipeline<
  TContext extends RefineToolContext = RefineToolContext,
  TCapture = unknown,
> {
  beforeToolCall?(call: RefineToolCall<TContext>): Promise<TCapture>;
  afterToolCall?(call: RefineToolCallResult<TContext>, beforeCapture: TCapture): Promise<TCapture>;
}

export interface RefineToolHookPipelineOptions<
  TContext extends RefineToolContext = RefineToolContext,
  TCapture = unknown,
> {
  beforeToolCall?(call: RefineToolCall<TContext>): Promise<TCapture>;
  afterToolCall?(call: RefineToolCallResult<TContext>, beforeCapture: TCapture): Promise<TCapture>;
}

class ConfiguredRefineToolHookPipeline<TContext extends RefineToolContext, TCapture>
  implements RefineToolHookPipeline<TContext, TCapture>
{
  readonly beforeToolCall?: (call: RefineToolCall<TContext>) => Promise<TCapture>;
  readonly afterToolCall?: (call: RefineToolCallResult<TContext>, beforeCapture: TCapture) => Promise<TCapture>;

  constructor(options: RefineToolHookPipelineOptions<TContext, TCapture>) {
    this.beforeToolCall = options.beforeToolCall;
    this.afterToolCall = options.afterToolCall;
  }
}

class NoOpRefineToolHookPipeline implements RefineToolHookPipeline<RefineToolContext, undefined> {
  async beforeToolCall(): Promise<undefined> {
    return undefined;
  }

  async afterToolCall(): Promise<undefined> {
    return undefined;
  }
}

export function createRefineToolHookPipeline<
  TContext extends RefineToolContext = RefineToolContext,
  TCapture = unknown,
>(
  options: RefineToolHookPipelineOptions<TContext, TCapture>,
): RefineToolHookPipeline<TContext, TCapture> {
  return new ConfiguredRefineToolHookPipeline(options);
}

export const NO_OP_REFINE_TOOL_HOOK_PIPELINE: RefineToolHookPipeline<RefineToolContext, undefined> =
  new NoOpRefineToolHookPipeline();
