import type { ToolCallResult, ToolClient, ToolDefinition } from "../../contracts/tool-client.js";

export interface PlaywrightMcpClientConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class PlaywrightMcpStdioClient implements ToolClient {
  private readonly config: PlaywrightMcpClientConfig;
  private processStarted = false;
  private session: unknown | null = null;
  private transport: unknown | null = null;

  constructor(config: PlaywrightMcpClientConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.processStarted) {
      return;
    }

    const clientModule: any = await import("@modelcontextprotocol/sdk/client/index.js");
    const stdioModule: any = await import("@modelcontextprotocol/sdk/client/stdio.js");

    const transport = new stdioModule.StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: this.config.env,
      stderr: "pipe",
    });

    const session = new clientModule.Client(
      { name: "sasiki-agent-runtime", version: "0.1.0" },
      { capabilities: { tools: {} } }
    );

    await session.connect(transport);
    this.transport = transport;
    this.session = session;
    this.processStarted = true;
  }

  async disconnect(): Promise<void> {
    const session: any = this.session;
    const transport: any = this.transport;

    if (session?.close) {
      await session.close();
    }
    if (transport?.close) {
      await transport.close();
    }

    this.session = null;
    this.transport = null;
    this.processStarted = false;
  }

  async listTools(): Promise<ToolDefinition[]> {
    const session: any = this.requireSession();
    const result = await session.listTools();
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    return tools.map((item: any) => ({
      name: String(item?.name ?? ""),
      description: typeof item?.description === "string" ? item.description : undefined,
      inputSchema: this.toRecord(item?.inputSchema),
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const session: any = this.requireSession();
    try {
      const result = await session.callTool({ name, arguments: args });
      return this.toRecord(result);
    } catch {
      const result = await session.callTool(name, args);
      return this.toRecord(result);
    }
  }

  private requireSession(): unknown {
    if (!this.session) {
      throw new Error("MCP session is not connected");
    }
    return this.session;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object") {
      return value as Record<string, unknown>;
    }
    return {};
  }
}
