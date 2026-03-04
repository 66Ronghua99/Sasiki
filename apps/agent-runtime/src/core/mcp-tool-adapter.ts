/**
 * Deps: contracts/tool-client.ts, @mariozechner/pi-agent-core
 * Used By: core/pi-agent-core-loop.ts
 * Last Updated: 2026-03-04
 */
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { TSchema } from "@mariozechner/pi-ai";

import type { ToolCallResult, ToolClient, ToolDefinition } from "../contracts/tool-client.js";

export class McpToolAdapter {
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
    if (typeof inputSchema.type === "string") {
      return inputSchema as unknown as TSchema;
    }
    return { type: "object", ...inputSchema } as unknown as TSchema;
  }

  private toArgs(params: unknown): Record<string, unknown> {
    if (params && typeof params === "object" && !Array.isArray(params)) {
      return params as Record<string, unknown>;
    }
    return {};
  }

  private resultText(result: ToolCallResult): string {
    try {
      const text = JSON.stringify(result);
      return text.length <= 800 ? text : `${text.slice(0, 800)}...<truncated>`;
    } catch {
      return String(result);
    }
  }
}
