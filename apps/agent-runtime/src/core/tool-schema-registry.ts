import type { ToolClient, ToolDefinition } from "../contracts/tool-client.js";

export class ToolSchemaRegistry {
  private readonly toolsByName = new Map<string, ToolDefinition>();

  async refresh(client: ToolClient): Promise<void> {
    const tools = await client.listTools();
    this.toolsByName.clear();
    for (const tool of tools) {
      if (!tool.name) {
        continue;
      }
      this.toolsByName.set(tool.name, tool);
    }
  }

  hasTool(name: string): boolean {
    return this.toolsByName.has(name);
  }

  toOpenAiToolSchemas(): Record<string, unknown>[] {
    const schemas: Record<string, unknown>[] = [];
    for (const tool of this.toolsByName.values()) {
      schemas.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description ?? `MCP tool: ${tool.name}`,
          parameters: this.withObjectType(tool.inputSchema),
        },
      });
    }
    return schemas;
  }

  private withObjectType(schema?: Record<string, unknown>): Record<string, unknown> {
    if (!schema) {
      return { type: "object", properties: {} };
    }
    if (typeof schema.type === "string") {
      return schema;
    }
    return { type: "object", ...schema };
  }
}
