export interface RuntimeConfig {
  mcpCommand: string;
  mcpArgs: string[];
  cdpEndpoint: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export class RuntimeConfigLoader {
  static fromEnv(): RuntimeConfig {
    const command = process.env.MCP_COMMAND ?? "npx";
    const argsRaw = process.env.MCP_ARGS ?? "@playwright/mcp@latest";

    return {
      mcpCommand: command,
      mcpArgs: argsRaw.split(" ").filter(Boolean),
      cdpEndpoint: process.env.PLAYWRIGHT_MCP_CDP_ENDPOINT ?? "http://localhost:9222",
      model: process.env.LLM_MODEL ?? "minimax/minimax-m2.5",
      apiKey: process.env.OPENROUTER_API_KEY ?? process.env.LLM_API_KEY ?? "",
      baseUrl: process.env.LLM_BASE_URL,
    };
  }
}
