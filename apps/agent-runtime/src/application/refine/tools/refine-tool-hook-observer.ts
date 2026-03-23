import type { RefineToolContext } from "./refine-tool-context.js";
import type { RefineToolDefinition } from "./refine-tool-definition.js";
import { readRefineToolAfterCapture, type RefineToolHookPipeline } from "./refine-tool-hook-pipeline.js";
import type { ToolCallHookContext } from "../../../domain/refinement-session.js";
import type {
  McpToolCallHookObserver,
  ToolCallHookCapture,
} from "../../../kernel/mcp-tool-bridge.js";

export interface CreateRefineToolHookObserverOptions<TContext extends RefineToolContext = RefineToolContext> {
  pipeline: RefineToolHookPipeline<TContext, ToolCallHookCapture | null>;
  resolveContext(hookContext: ToolCallHookContext): TContext;
  resolveDefinition?(hookContext: ToolCallHookContext): RefineToolDefinition<TContext>;
}

class RefineToolHookObserverAdapter<TContext extends RefineToolContext> implements McpToolCallHookObserver {
  private readonly pipeline: RefineToolHookPipeline<TContext, ToolCallHookCapture | null>;
  private readonly resolveContext: (hookContext: ToolCallHookContext) => TContext;
  private readonly resolveDefinition: (hookContext: ToolCallHookContext) => RefineToolDefinition<TContext>;

  constructor(options: CreateRefineToolHookObserverOptions<TContext>) {
    this.pipeline = options.pipeline;
    this.resolveContext = options.resolveContext;
    this.resolveDefinition = options.resolveDefinition ?? createSyntheticToolDefinition;
  }

  async beforeToolCall(context: ToolCallHookContext): Promise<ToolCallHookCapture | null> {
    return (
      (await this.pipeline.beforeToolCall?.({
        definition: this.resolveDefinition(context),
        args: context.toolArgs,
        context: this.resolveContext(context),
      })) ?? null
    );
  }

  async afterToolCall(
    context: ToolCallHookContext,
    rawResult: import("../../../contracts/tool-client.js").ToolCallResult,
    beforeCapture: ToolCallHookCapture | null,
  ): Promise<ToolCallHookCapture | null> {
    const output = await this.pipeline.afterToolCall?.(
      {
        definition: this.resolveDefinition(context),
        args: context.toolArgs,
        context: this.resolveContext(context),
        result: rawResult,
      },
      beforeCapture,
    );
    return output === undefined ? null : readRefineToolAfterCapture(output);
  }
}

export function createRefineToolHookObserver<TContext extends RefineToolContext = RefineToolContext>(
  options: CreateRefineToolHookObserverOptions<TContext>,
): McpToolCallHookObserver {
  return new RefineToolHookObserverAdapter(options);
}

function createSyntheticToolDefinition<TContext extends RefineToolContext>(
  hookContext: ToolCallHookContext,
): RefineToolDefinition<TContext> {
  return {
    name: hookContext.toolName,
    description: `bridge hook for ${hookContext.toolName}`,
    inputSchema: {
      type: "object",
      additionalProperties: true,
    },
    async invoke() {
      throw new Error("synthetic refine hook definition cannot be invoked");
    },
  };
}
