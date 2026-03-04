# Agent Runtime (Migration Scaffold)

This package hosts the Node migration runtime for Sasiki.

## Current scope
- `pi-agent-core` drives the agent loop (`Agent` + tool execution events).
- Playwright MCP stdio client provides browser tools.
- Class-based adapters isolate model resolution and MCP tool mapping:
  - `PiAgentCoreLoop`
  - `ModelResolver`
  - `McpToolAdapter`
  - `RunLogger`
  - `RunArtifactsWriter`
  - `PlaywrightMcpStdioClient`
  - `MigrationRuntime`

## Run
```bash
cd apps/agent-runtime
npm install
npm run dev -- "Open xiaohongshu and search for coffee beans"
```

## Config File
- Copy `runtime.config.example.json` to `runtime.config.json` and fill values.
- Runtime loads config from (first existing):
  1. `--config <path>` / `-c <path>`
  2. `RUNTIME_CONFIG_PATH`
  3. `./runtime.config.json`
  4. `./apps/agent-runtime/runtime.config.json`
- Precedence: config file values override environment variables.

Example:
```bash
cp apps/agent-runtime/runtime.config.example.json apps/agent-runtime/runtime.config.json
node apps/agent-runtime/dist/index.js -c apps/agent-runtime/runtime.config.json "打开小红书并搜索咖啡豆"
```

## Model Config
- `LLM_MODEL` format: `{provider}/{model_key}` (example: `minimax/MiniMax-M2.5`, `openrouter/openrouter/auto`).
- If `LLM_MODEL` is empty:
  - with domestic key (`LLM_API_KEY` or `DASHSCOPE_API_KEY`) -> defaults to `minimax/MiniMax-M2.5`
  - otherwise with `OPENROUTER_API_KEY` -> defaults to `openrouter/openrouter/auto`

## CDP Launch
- Runtime now auto-launches local Chrome CDP by default (`LAUNCH_CDP=true`).
- Browser selection order:
  1. `CHROME_EXECUTABLE_PATH` (if provided)
  2. System Chrome/Chromium paths
  3. Playwright bundled Chromium (`playwright` / `playwright-core`)
- Config:
  - `PLAYWRIGHT_MCP_CDP_ENDPOINT` (default `http://localhost:9222`)
  - `CDP_USER_DATA_DIR` (default `~/.sasiki/chrome_profile`)
  - `INJECT_COOKIES` (default `true`)
  - `COOKIES_DIR` (default `~/.sasiki/cookies`)
  - `PREFER_SYSTEM_BROWSER` (default `true`)
  - `CDP_HEADLESS` (`false` by default)
  - `CHROME_EXECUTABLE_PATH` (optional override)

## Artifacts
- Default output directory: `artifacts/e2e/{run_id}/`
- Override root path via `RUNTIME_ARTIFACTS_DIR`
- Per-run artifacts:
  - `steps.json`
  - `mcp_calls.jsonl`
  - `runtime.log`
  - `final.png` (best-effort screenshot)

## Notes
- Runtime now uses `@mariozechner/pi-agent-core` (no custom planner loop).
- Focus remains on business workflow replication and E2E stability for Xiaohongshu actions.
