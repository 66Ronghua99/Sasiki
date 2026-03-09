# Agent Runtime

This package hosts the production Node runtime for Sasiki.

## Current scope
- `pi-agent-core` drives the agent loop (`Agent` + tool execution events).
- Playwright MCP stdio client provides browser tools.
- Class-based adapters isolate model resolution and MCP tool mapping:
  - `AgentLoop`
  - `ModelResolver`
  - `McpToolBridge`
  - `RuntimeLogger`
  - `ArtifactsWriter`
  - `McpStdioClient`
  - `AgentRuntime`

## Run
```bash
cd apps/agent-runtime
npm install
npm run dev -- "Open xiaohongshu and search for coffee beans"
```

Run with deterministic SOP asset by recorded `run_id` (no extra task required):
```bash
npm run dev -- --mode run --sop-run-id 20260305_134516_980
```

Observe once (Watch-Once v0 baseline):
```bash
npm run dev -- --mode observe "在百度演示一次：搜索咖啡豆并打开一个结果"
```

Compact one recorded run into structured SOP assets plus high-level markdown:
```bash
npm run dev -- sop-compact --run-id 20260305_120050_475
```

Run the inline compact-stage clarification workflow in one command:
```bash
npm run dev -- sop-compact-clarify --run-id 20260308_110124_276
```

Enable semantic enhancement (`off|auto|on`, default from config):
```bash
npm run dev -- sop-compact --run-id 20260305_120050_475 --semantic auto
```

Inspect compact-stage HITL questions from a local artifact run (`debug/backfill` only):
```bash
npm run dev -- sop-compact-hitl --run-id 20260308_110124_276
```

Write/merge `intent_resolution.json` through CLI and keep the artifact in the current repo (`debug/backfill` only):
```bash
npm run dev -- sop-compact-hitl --run-id 20260308_110124_276 --set done_criteria="当前视图内所有待回复会话都已处理完" --set selection_criteria="只处理当前视图内待回复会话" --note "validated locally in repo"
```

Enable SOP consumption during `run` via config:
```json
{
  "consumption": {
    "enabled": true,
    "topN": 3,
    "hintsLimit": 8,
    "maxGuideChars": 4000
  }
}
```

Enable HITL retry/intervention loop during `run` via config:
```json
{
  "hitl": {
    "enabled": true,
    "retryLimit": 2,
    "maxInterventions": 1
  }
}
```

Consumption guide priority:
- `guide_semantic.md` (if present)
- `sop_compact.md` (if present)
- `sop_draft.md` (fallback via asset `guidePath`)

Compact output layering:
- Internal evidence / audit artifacts:
  - `abstraction_input.json`
  - `behavior_evidence.json`
  - `behavior_workflow.json`
  - `semantic_intent_draft.json` (optional when semantic drafting succeeds)
  - `observed_examples.json`
  - `clarification_questions.json` (optional)
  - `intent_resolution.json` (optional)
  - `compact_manifest.json`
- Replay-facing frozen guide:
  - `execution_guide.json`
- Human-readable render:
  - `guide_semantic.md`
  - `sop_compact.md`
- Legacy cleanup:
  - rerun `sop-compact` will remove stale `structured_abstraction*` / `workflow_guide*` / `decision_model.json`

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
- If your shell has `http_proxy` / `https_proxy` enabled, set `NO_PROXY=localhost,127.0.0.1,::1` before running local CDP replay.

## Artifacts
- Default output directory: `artifacts/e2e/{run_id}/`
- Override root path via `RUNTIME_ARTIFACTS_DIR`
- Relative `runtime.artifactsDir` values resolve against the nearest repo root marked by `.git`.
- `run` mode artifacts:
  - `steps.json`
  - `mcp_calls.jsonl`
  - `high_level_logs.json` (`read/judge/action/result/intervention` 统一高层日志)
  - `intervention_learning.jsonl` (written when HITL is enabled and intervention happens)
  - `runtime.log`
  - `final.png` (best-effort screenshot)
  - `sop_consumption.json` (written when run starts; records selection mode, pinned run id, selected asset, fallback)
- `observe` mode artifacts:
  - `demonstration_raw.jsonl`
  - `demonstration_trace.json`
  - `sop_draft.md`
  - `sop_asset.json`
  - `sop_compact.md` (generated by `sop-compact`)
  - `guide_semantic.md` (generated when semantic compaction succeeds)
  - `abstraction_input.json` (evidence-first compact input)
  - `behavior_evidence.json`
  - `behavior_workflow.json`
  - `semantic_intent_draft.json` (only when semantic drafting succeeds)
  - `observed_examples.json`
  - `clarification_questions.json` (only when blocking uncertainty exists)
  - `execution_guide.json` (single replay-facing frozen guide)
  - `compact_manifest.json` (status / artifact layering / gate result, `compact_manifest.v1`)
  - `runtime.log`

Compact-stage HITL notes:
- `sop-compact-clarify` is now the main inline path: it runs `sop-compact`, asks clarification questions in the same workflow, writes `intent_resolution.json`, then auto-recompiles.
- Question ordering is driven by `execution_guide.detailContext.unresolvedQuestions`; optional `clarification_questions.json` only contributes phrasing.
- The inline loop stops at `maxRounds=2`, `user_deferred`, `no_progress`, or `recompile_failed`.
- `sop-compact-hitl` remains available as `debug/backfill` tooling:
  - it reads `execution_guide.detailContext.unresolvedQuestions` and optional `clarification_questions.json`
  - `--set field=value` merges into `intent_resolution.json`
  - `--rerun` will write the resolution first and then rerun `sop-compact`

Observe trace notes:
- Multi-tab flows are supported in recording.
- Raw events and trace steps include `tabId` to distinguish behavior across tabs.
- `sop-compact` adds explicit tab-switch steps in high-level output.
- `sop-compact` now follows `evidence -> semantic_intent -> validation -> execution_guide`.
- If semantic drafting is unavailable, compact falls back to a conservative asset and should remain `needs_clarification` instead of pretending to be replay-ready.
- `observe` currently only保留轻量 `runtime.log`，不输出与 `run` 同规格的 `high_level_logs.json`。

## Notes
- Runtime now uses `@mariozechner/pi-agent-core` (no custom planner loop).
- Focus remains on business workflow replication and E2E stability for Xiaohongshu actions.
- Python legacy runtime has been removed from the mainline repository.
