# MEMORY

## Known Pitfalls
- `LLM model` 与 `baseUrl` 容易错配：DashScope 场景优先使用 `openai/qwen-plus`，避免 `MiniMax + DashScope` 导致 4xx/能力不兼容。
- 浏览器任务“看起来完成”不等于“业务完成”：必须用可验证证据确认（页面状态变化、截图、结构化步骤）。
- 仅靠 prompt 很难稳定复刻复杂 SOP：需要真实示教数据作为后续优化依据。

## Environment Requirements
- Node `>=20`
- 可用 CDP endpoint（默认 `http://localhost:9222`）
- 可用登录 cookie（`~/.sasiki/cookies/*.json`）
- Playwright MCP 可启动（默认 `@playwright/mcp@latest`）

## Working Conventions
- 需求加载顺序：`PROGRESS.md` -> `.plan/implementation_plan.md` -> `MEMORY.md` -> `NEXT_STEP.md`
- 每次迭代先确认目标工件，再实施：
  - E2E：`steps.json` / `mcp_calls.jsonl` / `runtime.log` / `final.png`
  - 示教：`demonstration_raw.jsonl` / `demonstration_trace.json` / `sop_draft.json`
