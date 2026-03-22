import type { ToolCallResult, ToolDefinition } from "../../../contracts/tool-client.js";
import type { RefineToolContext } from "./refine-tool-context.js";

export interface RefineToolDefinition<TContext extends RefineToolContext = RefineToolContext> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  invoke(args: Record<string, unknown>, context: TContext): Promise<ToolCallResult>;
}

export function toToolDefinition<TContext extends RefineToolContext>(
  definition: RefineToolDefinition<TContext>
): ToolDefinition {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
  };
}
