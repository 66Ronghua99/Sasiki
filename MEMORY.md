# MEMORY

## Doc Ownership
- `MEMORY.md` 只保留在本次重启后仍然成立的经验、环境要求和协作约定。
- 已经变成“阶段流水账”或“旧方案实现细节”的内容，不再继续堆在这里。

## Stable Lessons
- Harness 初始化后，`.harness/bootstrap.toml` 是仓库 governance 元数据真源；不要把它当成命令注册表，也不要再靠猜目录结构来推断项目模式和验证命令。
- 这个仓库的真实可执行命令在 `apps/agent-runtime/package.json`，不是仓库根目录。
- 浏览器任务“看起来完成”不等于业务完成；任何完成声明都要有 `artifacts/e2e/<run_id>/` 里的新鲜证据支撑。
- shared execution kernel 仍是当前代码的核心边界：
  - legacy run 路径是 `AgentLoop + McpToolBridge + Playwright MCP`
  - refine 路径是 `AgentLoop + RefineReactToolClient + Playwright MCP`
- `WorkflowRuntime` 当前是 mode-gated split：legacy `RunExecutor` 与 `ReactRefinementRunExecutor` 并存。
- `refinementMode` 现在仅保留配置兼容，new refine path 里是显式 no-op（日志说明 ignored）。
- `interactive-sop-compact` 已经是多轮 session 形态；旧 `sop-compact-hitl` / `sop-compact-clarify` 是 archived path。
- 历史 `.plan/*` 文档现在只作为背景，不再自动代表 active direction；新的方向必须重新写 spec。
- `LLM model` 与 `baseUrl` 很容易错配；DashScope 场景优先用 `openai/qwen-plus`。
- 本地如果设置了 `http_proxy/https_proxy`，CDP 探活和 `localhost:9222` 可能会被误代理；必要时显式设置 `NO_PROXY=localhost,127.0.0.1,::1`。
- 为避免大小写环境变量差异，运行 refine e2e 时优先同时设置 `NO_PROXY` 与 `no_proxy`，并在同一命令里 `env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY`。
- 当前本地 refine e2e 的默认路径应固定为：系统 Chrome 二进制 + `~/.sasiki/chrome_profile` + `~/.sasiki/cookies`。
- 不要再让 Playwright bundled Chrome 直接复用 `~/.sasiki/chrome_profile`；该 profile 可能已被更高版本系统 Chrome 升级，旧 bundled Chrome 会在 CDP 建连阶段 `ECONNRESET` / `socket hang up`。
- 若必须使用 bundled Chrome，给它单独的 `userDataDir`，不要和系统 Chrome 共用 profile。
- refinement / compact 这类链路中的 JSON 工件应继续作为真源；Markdown 说明文档只做索引和解释。
- `lint:docs` 如果保留，只应视为仓库本地文档对齐检查，而不是 Harness governance contract 的一部分。
- 尽量显式失败，不要用宽泛 fallback 或静默降级掩盖真实问题。
- 大范围重构不要在单个 worktree 中长时间累积；更稳的节奏是每个可独立验证的小步骤完成后立刻回基线分支合并。
- 当前重构方向里，`refine agent` 必须是唯一高决策权主脑；runtime 不能通过 heuristic 或隐式 ranking 夺回语义决策权。
- `observe.page` 第一版坚持“完整 snapshot 读取”，不提前做 context 优化、delta 注入或语义缩减。
- `observe.query` 只允许结构化字段驱动的确定性筛选；`intent` 只用于记录上下文，不参与 include/exclude/rerank。
- `act.*` 第一版保持薄封装：执行动作、记录证据，不承载“是否推进任务”的语义判断。
- refinement 模式下，模型可见的工具与 schema 来自 `RefineReactToolClient.listTools()`，并经 `McpToolBridge` 注入到 pi-agent；不是直接暴露 raw MCP 工具集。
- raw MCP 即使已有某个能力（例如 `browser_take_screenshot`），若 refine adapter 不显式暴露，对 refine agent 仍然不可用。
- 弱 schema（仅 `type: object`）会显著提高参数漂移概率（漏必填、字段名错误、枚举值漂移），并直接恶化 E2E 稳定性。
- `run.finish` 在当前实现中只有 `reason=goal_achieved` 会映射为 completed；其他 reason 会映射 failed。
- `AttentionKnowledge` 的成功标准不是“记录了内容”，而是“至少有一条可跨 run 被后续 refine run 加载和消费的 promoted knowledge”。
- `HITL` 在 refinement 里是“暂停并等待人类回复”，不是切到另一套控制流；人类回复后应恢复同一条 ReAct loop 继续执行。
- 终端 HITL 当前已改为自然语言 incident brief + 单个可选自然语言恢复说明输入；结构化字段仍保留在内部 request/response 契约中用于记录与兼容，不再直接暴露为终端固定标签。
- 当页面出现系统级 `file chooser dialog` 时，refine agent 会持续触发 `hitl.request`（uncertain_state）；若人类侧未真实关闭弹窗，流程会重复同类 HITL，难以前进到工具执行阶段。
- 若 run 卡在首轮前（无工具调用），对应 run 目录里的 `refine_turn_logs.jsonl` / `refine_browser_observations.jsonl` / `refine_action_executions.jsonl` / `refine_knowledge_events.jsonl` 会保持空文件，且 run summary 文件仅为 `{}`，可据此快速识别“初始化后未进入有效执行”。
- 若 refine run 在 modal / file chooser 场景里反复 `navigate`，先检查两件事：
  - `observe.page` 的页面身份是否仍然指向 stale 底层页面，而不是当前 active tab
  - 工具面是否真实暴露了文件选择相关动作，而不是让模型只能猜 URL 或重试导航
- paused refinement 的恢复入口是 `--resume-run-id <run_id>`；恢复必须复用同一个 run id，而不是新开分支控制流。
- old stitched refinement 子树已在确认零活跃入口引用后移除；后续若再做 legacy cleanup，先验证 runtime 主路径和测试引用图，再删文件。
- refine-runtime 当前已暴露 `act.select_tab`；当点击触发新 tab 后，应优先显式切 tab，再继续动作。
- `observe.page` 的页面识别必须按 Playwright markdown 事实解析（`Page URL` / `Page Title` + `Open tabs`）；不能再假设旧 `URL:` / `TITLE:` 行格式。
- `observe.query` 元素提取必须兼容 YAML `- role [ref=...]` 行；否则会出现“页面有元素但 query 常年空结果”的假阴性。
- `sourceObservationRef` 现在不仅要“存在”，还要与 live active tab 一致；不一致时应显式失败并要求先 `act.select_tab` / `observe.page` 重新对齐上下文。
- refine `action.success` 不能硬编码为 true；需要从工具结果语义（`isError` / `### Error`）判定。
- 小红书长文草稿真实 e2e 已有标准化执行手册：`docs/testing/refine-e2e-xiaohongshu-long-note-runbook.md`；后续优先按手册执行，不再临时拼命令。

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
