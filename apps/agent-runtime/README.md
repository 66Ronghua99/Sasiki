# Agent Runtime

This package hosts the production Node runtime for Sasiki.

## Current scope
- Supported commands:
  - `observe`
  - `refine`
  - `sop-compact`
- Canonical code homes:
  - `src/application/observe/`
  - `src/application/refine/`
  - `src/application/compact/`
  - `src/kernel/`
  - `src/infrastructure/`

## Run
```bash
cd apps/agent-runtime
npm install
npm run dev -- observe "在百度演示一次：搜索咖啡豆并打开一个结果"
```

Run refine:
```bash
npm run dev -- refine "打开小红书，搜索咖啡豆推荐，打开帖子并点赞后截图"
```

Resume a paused refine run:
```bash
npm run dev -- refine --resume-run-id 20260320_180604_816
```

Compact one recorded run into structured SOP assets plus high-level markdown:
```bash
npm run dev -- sop-compact --run-id 20260305_120050_475
```

Enable semantic enhancement (`off|auto|on`, default from config):
```bash
npm run dev -- sop-compact --run-id 20260305_120050_475 --semantic auto
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
node apps/agent-runtime/dist/index.js refine -c apps/agent-runtime/runtime.config.json "打开小红书并搜索咖啡豆"
```

## Model Config
- `LLM_MODEL` format: `{provider}/{model_key}`.
- DashScope example: `openai/qwen-plus`
- OpenRouter example:
  - `minimax/minimax-m2.1` with `baseUrl=https://openrouter.ai/api/v1`
  - or explicit `openai/minimax/minimax-m2.1` with the same `baseUrl`
- When `baseUrl` points to OpenRouter, runtime now treats the endpoint as OpenAI-compatible and preserves the full OpenRouter model token instead of resolving only from the provider prefix.
- If `LLM_MODEL` is empty:
  - when `baseUrl` points to DashScope -> defaults to `openai/qwen-plus`
  - when `baseUrl` points to OpenRouter -> defaults to `openai/openrouter/auto`
  - otherwise with domestic key (`LLM_API_KEY` or `DASHSCOPE_API_KEY`) -> defaults to `minimax/MiniMax-M2.5`
  - otherwise with `OPENROUTER_API_KEY` -> defaults to `openrouter/openrouter/auto`

## CDP Launch
- Runtime now auto-launches local Chrome CDP by default (`LAUNCH_CDP=true`).
- Browser selection order:
  1. `CHROME_EXECUTABLE_PATH` (if provided)
  2. System Chrome/Chromium paths
  3. Playwright bundled Chromium (`playwright` / `playwright-core`)
- Recommended local Sasiki runtime path:
  - system Chrome binary
  - `~/.sasiki/chrome_profile` as the persistent Sasiki browser profile
  - `~/.sasiki/cookies` cookie injection enabled
- For local e2e on this machine/repo, prefer:
  - `PREFER_SYSTEM_BROWSER=true`
  - `CHROME_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  - `CDP_USER_DATA_DIR=~/.sasiki/chrome_profile`
  - `COOKIES_DIR=~/.sasiki/cookies`
- Config:
  - `PLAYWRIGHT_MCP_CDP_ENDPOINT` (default `http://localhost:9222`)
  - `CDP_USER_DATA_DIR` (default `~/.sasiki/chrome_profile`)
  - `CDP_RESET_PAGES_ON_LAUNCH` (default `true`, only when runtime launches the local browser)
  - `INJECT_COOKIES` (default `true`)
  - `COOKIES_DIR` (default `~/.sasiki/cookies`)
- `PREFER_SYSTEM_BROWSER` (default `true`)
- `CDP_HEADLESS` (`false` by default)
- `CHROME_EXECUTABLE_PATH` (optional override)
- To reduce noise, a runtime-launched local browser is reset to a single blank tab after startup. This keeps the persistent profile for cookies/local state, but does not carry previous tabs into the next run.
- Do not let an older Playwright bundled Chrome reuse a profile that has already been upgraded by a newer system Chrome build. If bundled Chrome must be used, give it a separate `CDP_USER_DATA_DIR`.
- If your shell has `http_proxy` / `https_proxy` enabled, set `NO_PROXY=localhost,127.0.0.1,::1` before running local CDP replay.

## Artifacts
- Default output directory: `artifacts/e2e/{run_id}/`
- Override root path via `RUNTIME_ARTIFACTS_DIR`
- Relative `runtime.artifactsDir` values resolve against the nearest repo root marked by `.git`.
- `refine` canonical artifacts:
  - `event_stream.jsonl`
  - `run_summary.json`
  - `agent_checkpoints/checkpoints.jsonl` (when telemetry checkpoint mode is not `off`)
  - `final.png` (best-effort screenshot for completed runs)
- Legacy refine artifacts such as `steps.json`, `mcp_calls.jsonl`, `high_level_logs.json`, and `runtime.log` are no longer front-door truth and may be absent.
- `observe` artifacts:
  - `demonstration_raw.jsonl`
  - `demonstration_trace.json`
  - `sop_draft.md`
  - `sop_asset.json`
- `sop-compact` artifacts:
  - `compact_session_state.json`
  - `compact_human_loop.jsonl`
  - `compact_capability_output.json`
  - per-session copies of the same files under `compact_sessions/<session_id>/`

Observe trace notes:
- Multi-tab flows are supported in recording.
- Raw events and trace steps include `tabId` to distinguish behavior across tabs.
- `sop-compact` adds explicit tab-switch steps in high-level output.
- `sop-compact` now follows `evidence -> semantic_intent -> validation -> execution_guide`.
- If semantic drafting is unavailable, compact falls back to a conservative asset and should remain `needs_clarification` instead of pretending to be replay-ready.

## Notes
- Runtime uses `@mariozechner/pi-agent-core` for the shared execution loop.
- The legacy `runtime` CLI surface and migration-only compatibility wrappers have been removed.
- Focus remains on browser workflow replication and refine stability for Xiaohongshu actions.
