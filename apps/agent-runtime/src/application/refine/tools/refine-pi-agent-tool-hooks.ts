import type { PiAgentToolExecutionContext, PiAgentToolHookRegistry } from "../../../kernel/pi-agent-tool-hooks.js";
import type { RefineToolContext } from "./refine-tool-context.js";
import type { RefineToolDefinition } from "./refine-tool-definition.js";
import {
  readRefineToolAfterResult,
  type RefineToolHookPipeline,
} from "./refine-tool-hook-pipeline.js";
import type { RefineToolRegistry } from "./refine-tool-registry.js";

export interface CreateRefinePiAgentToolHooksOptions<
  TContext extends RefineToolContext = RefineToolContext,
  TCapture = unknown,
> {
  registry: RefineToolRegistry<RefineToolDefinition<TContext>>;
  pipeline: RefineToolHookPipeline<TContext, TCapture>;
  resolveContext(executionContext: PiAgentToolExecutionContext): TContext;
}

export function createRefinePiAgentToolHooks<
  TContext extends RefineToolContext = RefineToolContext,
  TCapture = unknown,
>(options: CreateRefinePiAgentToolHooksOptions<TContext, TCapture>): PiAgentToolHookRegistry {
  const hooks: PiAgentToolHookRegistry = new Map();

  for (const definition of options.registry.listDefinitions()) {
    hooks.set(definition.name, [
      {
        before: async (executionContext) =>
          options.pipeline.beforeToolCall?.({
            definition,
            args: executionContext.args,
            context: options.resolveContext(executionContext),
          }),
        after: async (executionContext, result, capture) => {
          const output = await options.pipeline.afterToolCall?.(
            {
              definition,
              args: executionContext.args,
              context: options.resolveContext(executionContext),
              result,
            },
            capture as TCapture,
          );
          return output === undefined ? result : readRefineToolAfterResult(output, result);
        },
      },
    ]);
  }

  return hooks;
}
