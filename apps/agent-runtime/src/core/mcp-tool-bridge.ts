/**
 * Deps: contracts/tool-client.ts, @mariozechner/pi-agent-core
 * Used By: core/agent-loop.ts
 * Last Updated: 2026-03-04
 */
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { TSchema } from "@mariozechner/pi-ai";
import { inspect } from "node:util";

import type { ToolCallResult, ToolClient, ToolDefinition } from "../contracts/tool-client.js";

export class McpToolBridge {
  private readonly client: ToolClient;

  constructor(client: ToolClient) {
    this.client = client;
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
      execute: async (_toolCallId, params) => {
        const result = await this.client.callTool(name, this.toArgs(params));
        return {
          content: [{ type: "text", text: this.resultText(result) }],
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
}
