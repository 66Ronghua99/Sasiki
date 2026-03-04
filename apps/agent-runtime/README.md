# Agent Runtime (Migration Scaffold)

This package hosts the Node migration runtime for Sasiki.

## Current scope
- `pi-agent-core` drives the agent loop (`Agent` + tool execution events).
- Playwright MCP stdio client provides browser tools.
- Class-based adapters isolate model resolution and MCP tool mapping:
  - `PiAgentCoreLoop`
  - `ModelResolver`
  - `McpToolAdapter`
  - `PlaywrightMcpStdioClient`
  - `MigrationRuntime`

## Run
```bash
cd apps/agent-runtime
npm install
npm run dev -- "Open xiaohongshu and search for coffee beans"
```

## Notes
- Runtime now uses `@mariozechner/pi-agent-core` (no custom planner loop).
- Focus remains on business workflow replication and E2E stability for Xiaohongshu actions.
