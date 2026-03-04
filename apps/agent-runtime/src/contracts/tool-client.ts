export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ToolCallResult {
  content?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

export interface ToolClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listTools(): Promise<ToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
}
