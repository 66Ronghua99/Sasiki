/**
 * Deps: contracts/tool-client.ts, @mariozechner/pi-agent-core
 * Used By: kernel/pi-agent-loop.ts
 * Last Updated: 2026-03-23
 */
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { TSchema } from "@mariozechner/pi-ai";
import { inspect } from "node:util";

import type { ToolCallResult, ToolClient, ToolDefinition } from "../contracts/tool-client.js";
import type {
  PiAgentToolExecutionContext,
  PiAgentToolHook,
  PiAgentToolHookRegistry,
} from "./pi-agent-tool-hooks.js";

export interface PiAgentToolAdapterHookContext {
  runId?: string;
  sessionId?: string;
  pageId?: string;
  stepIndex?: number;
  runtimeContext?: Record<string, unknown>;
}

export interface PiAgentToolAdapterOptions {
  hooks?: PiAgentToolHookRegistry;
  hookContext?: PiAgentToolAdapterHookContext;
}

export class PiAgentToolAdapter {
  private readonly client: ToolClient;
  private hooks: PiAgentToolHookRegistry;
  private hookContext: PiAgentToolAdapterHookContext;

  constructor(client: ToolClient, options?: PiAgentToolAdapterOptions) {
    this.client = client;
    this.hooks = options?.hooks ?? new Map();
    this.hookContext = options?.hookContext ?? {};
  }

  setHooks(hooks: PiAgentToolHookRegistry): void {
    this.hooks = hooks;
  }

  setHookContext(context: PiAgentToolAdapterHookContext): void {
    this.hookContext = {
      ...this.hookContext,
      ...context,
      runtimeContext: {
        ...(this.hookContext.runtimeContext ?? {}),
        ...(context.runtimeContext ?? {}),
      },
    };
  }

  async buildAgentTools(): Promise<AgentTool[]> {
    const definitions = await this.client.listTools();
    return definitions.map((definition) => this.toAgentTool(definition));
  }

  private toAgentTool(definition: ToolDefinition): AgentTool {
    const name = definition.name;
    return {
      name,
      label: name,
      description: definition.description ?? `MCP tool: ${name}`,
      parameters: this.normalizeSchema(definition.inputSchema),
      execute: async (toolCallId, params) => {
        const args = this.toArgs(params);
        const executionContext = this.buildExecutionContext(toolCallId, name, args);
        const hooks = this.resolveHooks(name);
        const captures = await this.runBeforeHooks(hooks, executionContext);

        let result: ToolCallResult;
        try {
          result = await this.client.callTool(name, args);
        } catch (error) {
          await this.runAfterHooks(hooks, executionContext, this.errorResult(error), captures);
          throw error;
        }

        const finalResult = await this.runAfterHooks(hooks, executionContext, result, captures);
        return {
          content: [{ type: "text", text: this.originalToolText(finalResult) }],
          details: finalResult,
        };
      },
    };
  }

  private resolveHooks(toolName: string): PiAgentToolHook[] {
    return this.hooks.get(toolName) ?? [];
  }

  private async runBeforeHooks(hooks: PiAgentToolHook[], context: PiAgentToolExecutionContext): Promise<unknown[]> {
    const captures: unknown[] = [];
    for (const hook of hooks) {
      if (!hook.before) {
        captures.push(undefined);
        continue;
      }
      try {
        captures.push(await hook.before(context));
      } catch (error) {
        this.logHookError("before", context, error);
        captures.push(undefined);
      }
    }
    return captures;
  }

  private async runAfterHooks(
    hooks: PiAgentToolHook[],
    context: PiAgentToolExecutionContext,
    initialResult: ToolCallResult,
    captures: unknown[],
  ): Promise<ToolCallResult> {
    let nextResult = initialResult;
    for (const [index, hook] of hooks.entries()) {
      if (!hook.after) {
        continue;
      }
      try {
        nextResult = (await hook.after(context, nextResult, captures[index])) ?? nextResult;
      } catch (error) {
        this.logHookError("after", context, error);
      }
    }
    return nextResult;
  }

  private buildExecutionContext(
    toolCallId: string | undefined,
    toolName: string,
    args: Record<string, unknown>,
  ): PiAgentToolExecutionContext {
    const runtimeContext = this.buildRuntimeContext();
    return {
      toolName,
      toolCallId: this.readString(toolCallId, this.syntheticToolCallId(toolName)),
      args,
      runtimeContext: Object.keys(runtimeContext).length > 0 ? runtimeContext : undefined,
    };
  }

  private buildRuntimeContext(): Record<string, unknown> {
    const runtimeContext = { ...(this.hookContext.runtimeContext ?? {}) };
    for (const key of ["runId", "sessionId", "pageId", "stepIndex"] as const) {
      const value = this.hookContext[key];
      if (value !== undefined) {
        runtimeContext[key] = value;
      }
    }
    return runtimeContext;
  }

  private normalizeSchema(inputSchema?: Record<string, unknown>): TSchema {
    if (!inputSchema) {
      return { type: "object", properties: {} } as unknown as TSchema;
    }
    const sanitized = this.sanitizeSchema(inputSchema);
    if (typeof sanitized.type === "string") {
      return sanitized as unknown as TSchema;
    }
    return { type: "object", ...sanitized } as unknown as TSchema;
  }

  private sanitizeSchema(value: unknown): Record<string, unknown> {
    const record = this.toArgs(value);
    const output: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(record)) {
      if (key === "$schema" || key === "$id") {
        continue;
      }
      if (Array.isArray(raw)) {
        output[key] = raw.map((item) => (this.isRecord(item) ? this.sanitizeSchema(item) : item));
        continue;
      }
      if (this.isRecord(raw)) {
        output[key] = this.sanitizeSchema(raw);
        continue;
      }
      output[key] = raw;
    }
    return output;
  }

  private toArgs(params: unknown): Record<string, unknown> {
    if (this.isRecord(params)) {
      return params as Record<string, unknown>;
    }
    return {};
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private resultText(result: ToolCallResult): string {
    if (typeof result === "string") {
      return result;
    }
    try {
      return JSON.stringify(result);
    } catch {
      return inspect(result, {
        depth: null,
        maxArrayLength: null,
        maxStringLength: null,
        compact: false,
      });
    }
  }

  private originalToolText(result: ToolCallResult): string {
    if (typeof result === "string") {
      return result;
    }
    const content = result.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!this.isRecord(block)) {
          continue;
        }
        if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
          return block.text;
        }
      }
    }
    return this.resultText(result);
  }

  private readString(value: unknown, fallback: string): string {
    if (typeof value !== "string") {
      return fallback;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : fallback;
  }

  private syntheticToolCallId(toolName: string): string {
    return `synthetic_${toolName}_${Date.now()}`;
  }

  private errorResult(error: unknown): ToolCallResult {
    return {
      isError: true,
      content: [{ type: "text", text: this.errorMessage(error) }],
    };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private logHookError(phase: "before" | "after", context: PiAgentToolExecutionContext, error: unknown): void {
    console.warn("[pi-agent-tool-adapter] hook failed", {
      phase,
      toolName: context.toolName,
      toolCallId: context.toolCallId,
      error: this.errorMessage(error),
    });
  }
}
