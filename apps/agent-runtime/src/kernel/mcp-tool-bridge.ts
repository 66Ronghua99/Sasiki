/**
 * Deps: contracts/tool-client.ts, @mariozechner/pi-agent-core
 * Used By: kernel/agent-loop.ts
 * Last Updated: 2026-03-04
 */
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { TSchema } from "@mariozechner/pi-ai";
import { inspect } from "node:util";

import type { ToolCallResult, ToolClient, ToolDefinition } from "../contracts/tool-client.js";
import type {
  SnapshotCaptureStatus,
  ToolCallHookContext,
  ToolCallHookOrigin,
  ToolClass,
} from "../domain/refinement-session.js";

const MUTATION_TOOL_NAMES = new Set<string>([
  "browser_click",
  "browser_type",
  "browser_fill_form",
  "browser_select_option",
  "browser_press_key",
  "browser_drag",
  "browser_file_upload",
  "browser_handle_dialog",
  "browser_navigate",
  "browser_navigate_back",
  "browser_tabs",
  "browser_run_code",
]);

const MUTATION_TAB_ACTIONS = new Set<string>(["create", "close", "select"]);

const OBSERVATION_TOOL_NAMES = new Set<string>([
  "browser_snapshot",
  "browser_take_screenshot",
  "browser_console_messages",
  "browser_network_requests",
  "browser_tabs",
]);

export interface ToolCallHookCapture {
  captureStatus: SnapshotCaptureStatus;
  captureError?: string;
  snapshotLatencyMs?: number;
  observationText?: string;
  [key: string]: unknown;
}

export interface McpToolCallHookObserver {
  beforeToolCall(context: ToolCallHookContext): Promise<ToolCallHookCapture | null>;
  afterToolCall(
    context: ToolCallHookContext,
    rawResult: ToolCallResult,
    beforeCapture: ToolCallHookCapture | null,
  ): Promise<ToolCallHookCapture | null>;
}

export interface McpToolBridgeOptions {
  hookObserver?: McpToolCallHookObserver | null;
  hookContext?: Partial<ToolCallHookContext>;
}

export class McpToolBridge {
  private readonly client: ToolClient;
  private hookObserver: McpToolCallHookObserver | null;
  private hookContext: Partial<ToolCallHookContext>;

  constructor(client: ToolClient, options?: McpToolBridgeOptions) {
    this.client = client;
    this.hookObserver = options?.hookObserver ?? null;
    this.hookContext = options?.hookContext ?? {};
  }

  setHookObserver(observer: McpToolCallHookObserver | null): void {
    this.hookObserver = observer;
  }

  setHookContext(context: Partial<ToolCallHookContext>): void {
    this.hookContext = { ...this.hookContext, ...context };
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
        const rawArgs = this.toArgs(params);
        const hookOrigin = this.resolveHookOrigin(rawArgs, this.hookContext.hookOrigin);
        const args = this.stripBridgeInternalArgs(rawArgs);
        const context = this.buildHookContext(toolCallId, name, args, hookOrigin);
        const beforeCapture = await this.captureBefore(context);

        let result: ToolCallResult;
        try {
          result = await this.client.callTool(name, args);
        } catch (error) {
          await this.captureAfter(context, this.errorResult(error), beforeCapture);
          throw error;
        }

        const afterCapture = await this.captureAfter(context, result, beforeCapture);
        const observationText = this.getObservationTextOverride(afterCapture) ?? this.originalToolText(result);
        return {
          content: [{ type: "text", text: observationText }],
          details: result,
        };
      },
    };
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

  private async captureBefore(context: ToolCallHookContext): Promise<ToolCallHookCapture | null> {
    if (!this.shouldRunHook(context) || !this.hookObserver) {
      return null;
    }
    try {
      return await this.hookObserver.beforeToolCall(context);
    } catch (error) {
      this.logHookError("beforeToolCall", context, error);
      return {
        captureStatus: "failed",
        captureError: this.errorMessage(error),
      };
    }
  }

  private async captureAfter(
    context: ToolCallHookContext,
    rawResult: ToolCallResult,
    beforeCapture: ToolCallHookCapture | null,
  ): Promise<ToolCallHookCapture | null> {
    if (!this.shouldRunHook(context) || !this.hookObserver) {
      return null;
    }
    try {
      return await this.hookObserver.afterToolCall(context, rawResult, beforeCapture);
    } catch (error) {
      this.logHookError("afterToolCall", context, error);
      return {
        captureStatus: "failed",
        captureError: this.errorMessage(error),
      };
    }
  }

  private getObservationTextOverride(capture: ToolCallHookCapture | null): string | undefined {
    if (!capture) {
      return undefined;
    }
    if (typeof capture.observationText !== "string") {
      return undefined;
    }
    const text = capture.observationText.trim();
    return text.length > 0 ? text : undefined;
  }

  private shouldRunHook(context: ToolCallHookContext): boolean {
    if (!this.hookObserver) {
      return false;
    }
    if (context.hookOrigin === "hook_internal") {
      return false;
    }
    return context.toolClass === "mutation";
  }

  private buildHookContext(
    toolCallId: string | undefined,
    toolName: string,
    toolArgs: Record<string, unknown>,
    hookOrigin: ToolCallHookOrigin,
  ): ToolCallHookContext {
    return {
      runId: this.readString(this.hookContext.runId, "unknown_run"),
      sessionId: this.readString(this.hookContext.sessionId, "unknown_session"),
      toolCallId: this.readString(toolCallId, this.syntheticToolCallId(toolName)),
      toolName,
      toolArgs,
      pageId: this.readString(this.hookContext.pageId, "unknown_page"),
      stepIndex: this.readNumber(this.hookContext.stepIndex, -1),
      toolClass: this.classifyTool(toolName, toolArgs),
      hookOrigin,
    };
  }

  private stripBridgeInternalArgs(toolArgs: Record<string, unknown>): Record<string, unknown> {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(toolArgs)) {
      if (key === "hookOrigin") {
        continue;
      }
      next[key] = value;
    }
    return next;
  }

  private classifyTool(toolName: string, toolArgs: Record<string, unknown>): ToolClass {
    const normalizedName = toolName.trim().toLowerCase();
    if (this.isMutationTool(normalizedName, toolArgs)) {
      return "mutation";
    }
    if (this.isObservationTool(normalizedName, toolArgs)) {
      return "observation";
    }
    return "meta";
  }

  private isMutationTool(toolName: string, toolArgs: Record<string, unknown>): boolean {
    if (!MUTATION_TOOL_NAMES.has(toolName)) {
      return false;
    }
    if (toolName !== "browser_tabs") {
      return true;
    }
    const action = this.readString(toolArgs.action, "");
    if (!action) {
      return false;
    }
    return MUTATION_TAB_ACTIONS.has(action.toLowerCase());
  }

  private isObservationTool(toolName: string, toolArgs: Record<string, unknown>): boolean {
    if (!OBSERVATION_TOOL_NAMES.has(toolName)) {
      return false;
    }
    if (toolName !== "browser_tabs") {
      return true;
    }
    const action = this.readString(toolArgs.action, "");
    if (!action) {
      return false;
    }
    return action.toLowerCase() === "list";
  }

  private resolveHookOrigin(
    toolArgs: Record<string, unknown>,
    fallbackOrigin: ToolCallHookContext["hookOrigin"] | undefined,
  ): ToolCallHookOrigin {
    const fromArgs = this.parseHookOrigin(toolArgs.hookOrigin);
    if (fromArgs) {
      return fromArgs;
    }
    const fromContext = this.parseHookOrigin(fallbackOrigin);
    if (fromContext) {
      return fromContext;
    }
    return "tool_call";
  }

  private parseHookOrigin(value: unknown): ToolCallHookOrigin | null {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "hook_internal") {
      return "hook_internal";
    }
    if (normalized === "tool_call") {
      return "tool_call";
    }
    return null;
  }

  private readString(value: unknown, fallback: string): string {
    if (typeof value !== "string") {
      return fallback;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : fallback;
  }

  private readNumber(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    return fallback;
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

  private logHookError(phase: "beforeToolCall" | "afterToolCall", context: ToolCallHookContext, error: unknown): void {
    console.warn("[mcp-tool-bridge] hook failed", {
      phase,
      toolName: context.toolName,
      toolCallId: context.toolCallId,
      hookOrigin: context.hookOrigin,
      error: this.errorMessage(error),
    });
  }
}
