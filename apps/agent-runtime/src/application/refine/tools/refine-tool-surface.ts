import type { ToolCallResult, ToolDefinition } from "../../../contracts/tool-client.js";
import type { RefineToolContext, RefineToolContextRef } from "./refine-tool-context.js";
import { toToolDefinition, type RefineToolDefinition } from "./refine-tool-definition.js";
import { NO_OP_REFINE_TOOL_HOOK_PIPELINE, type RefineToolHookPipeline } from "./refine-tool-hook-pipeline.js";
import { RefineToolRegistry } from "./refine-tool-registry.js";
import {
  NO_OP_REFINE_TOOL_SURFACE_LIFECYCLE,
  type RefineToolSurfaceLifecycle,
} from "./refine-tool-surface-lifecycle.js";

export interface RefineToolSurfaceOptions<
  TContext extends RefineToolContext = RefineToolContext,
  TDefinition extends RefineToolDefinition<TContext> = RefineToolDefinition<TContext>,
> {
  registry: RefineToolRegistry<TDefinition>;
  contextRef: RefineToolContextRef<TContext>;
  hookPipeline?: RefineToolHookPipeline<TContext>;
  lifecycle?: RefineToolSurfaceLifecycle;
}

export class RefineToolSurface<
  TContext extends RefineToolContext = RefineToolContext,
  TDefinition extends RefineToolDefinition<TContext> = RefineToolDefinition<TContext>,
> {
  private readonly registry: RefineToolRegistry<TDefinition>;
  private readonly contextRef: RefineToolContextRef<TContext>;
  private readonly hookPipeline: RefineToolHookPipeline<TContext>;
  private readonly lifecycle: RefineToolSurfaceLifecycle;

  constructor(options: RefineToolSurfaceOptions<TContext, TDefinition>) {
    this.registry = options.registry;
    this.contextRef = options.contextRef;
    this.hookPipeline = options.hookPipeline ?? NO_OP_REFINE_TOOL_HOOK_PIPELINE;
    this.lifecycle = options.lifecycle ?? NO_OP_REFINE_TOOL_SURFACE_LIFECYCLE;
  }

  async connect(): Promise<void> {
    await this.lifecycle.connect();
  }

  async disconnect(): Promise<void> {
    await this.lifecycle.disconnect();
  }

  async listTools(): Promise<ToolDefinition[]> {
    return this.registry.listDefinitions().map((definition) => toToolDefinition(definition));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const definition = this.registry.getDefinition(name);
    const context = this.contextRef.get();
    await this.hookPipeline.beforeToolCall?.({ definition, args, context });
    const result = await definition.invoke(args, context);
    await this.hookPipeline.afterToolCall?.({ definition, args, context, result });
    return result;
  }
}
