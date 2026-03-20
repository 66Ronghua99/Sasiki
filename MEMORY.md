# MEMORY

## Doc Ownership
- `MEMORY.md` 只保留在本次重启后仍然成立的经验、环境要求和协作约定。
- 已经变成“阶段流水账”或“旧方案实现细节”的内容，不再继续堆在这里。

## Stable Lessons
- Harness 初始化后，`.harness/bootstrap.toml` 是仓库入口真源；不要再靠猜目录结构来推断项目模式和验证命令。
- 这个仓库的真实可执行命令在 `apps/agent-runtime/package.json`，不是仓库根目录。
- 浏览器任务“看起来完成”不等于业务完成；任何完成声明都要有 `artifacts/e2e/<run_id>/` 里的新鲜证据支撑。
- shared execution kernel 仍是当前代码的核心边界：浏览器动作必须通过 `AgentLoop + McpToolBridge + Playwright MCP` 这条链路完成。
- `WorkflowRuntime` 的当前事实是 mode-gated split：legacy `RunExecutor` 和 `OnlineRefinementRunExecutor` 并存。
- `interactive-sop-compact` 已经是多轮 session 形态；旧 `sop-compact-hitl` / `sop-compact-clarify` 是 archived path。
- 历史 `.plan/*` 文档现在只作为背景，不再自动代表 active direction；新的方向必须重新写 spec。
- `LLM model` 与 `baseUrl` 很容易错配；DashScope 场景优先用 `openai/qwen-plus`。
- 本地如果设置了 `http_proxy/https_proxy`，CDP 探活和 `localhost:9222` 可能会被误代理；必要时显式设置 `NO_PROXY=localhost,127.0.0.1,::1`。
- refinement / compact 这类链路中的 JSON 工件应继续作为真源；Markdown 说明文档只做索引和解释。
- 尽量显式失败，不要用宽泛 fallback 或静默降级掩盖真实问题。
- 当前重构方向里，`refine agent` 必须是唯一高决策权主脑；runtime 不能通过 heuristic 或隐式 ranking 夺回语义决策权。
- `observe.page` 第一版坚持“完整 snapshot 读取”，不提前做 context 优化、delta 注入或语义缩减。
- `observe.query` 只允许结构化字段驱动的确定性筛选；`intent` 只用于记录上下文，不参与 include/exclude/rerank。
- `act.*` 第一版保持薄封装：执行动作、记录证据，不承载“是否推进任务”的语义判断。
- `AttentionKnowledge` 的成功标准不是“记录了内容”，而是“至少有一条可跨 run 被后续 refine run 加载和消费的 promoted knowledge”。
- `HITL` 在 refinement 里是“暂停并等待人类回复”，不是切到另一套控制流；人类回复后应恢复同一条 ReAct loop 继续执行。

## Environment Requirements
- Node `>=20`
- 可用 CDP endpoint（默认 `http://localhost:9222`）
- 可用登录 cookie（默认 `~/.sasiki/cookies/*.json`）
- Playwright MCP 可启动（默认 `@playwright/mcp@latest`）

## Working Conventions
- 默认加载顺序：
  - `PROGRESS.md`
  - `NEXT_STEP.md`
  - `MEMORY.md`
  - `AGENT_INDEX.md`
  - `.harness/bootstrap.toml`
  - `docs/project/current-state.md`
- 如果需要历史背景，再按需读取 `.plan/20260310_*`、`.plan/20260312_*`、`.plan/20260313_*`。
- 新的 active spec / plan / evidence 默认写到 Harness 目录结构下，不再继续把 `.plan/` 当成唯一前台入口。
