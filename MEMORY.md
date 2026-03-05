# MEMORY

## Doc Ownership
- `PROGRESS.md` 负责里程碑、DONE/TODO、当前执行引用。
- `MEMORY.md` 负责可复用经验、踩坑根因、排障约定与环境要求。
- 新的“经验总结”默认写入 `MEMORY.md`，`PROGRESS.md` 只保留里程碑级状态结论。

## Known Pitfalls
- `LLM model` 与 `baseUrl` 容易错配：DashScope 场景优先使用 `openai/qwen-plus`，避免 `MiniMax + DashScope` 导致 4xx/能力不兼容。
- 浏览器任务“看起来完成”不等于“业务完成”：必须用可验证证据确认（页面状态变化、截图、结构化步骤）。
- 仅靠 prompt 很难稳定复刻复杂 SOP：需要真实示教数据作为后续优化依据。

## Migrated Experience (from PROGRESS)
- 模型端点治理：OpenAI-compatible `baseUrl` 场景下优先走 endpoint 兼容策略，避免 provider 自动映射误判。
- 模型诊断治理：运行期必须输出 `configuredModel/configuredBaseUrl` 与最终解析结果；若未进入 MCP，打 `llm_failed_before_mcp` 标记。
- 角色兼容治理：非 OpenAI 官方 `baseUrl` 强制关闭 `developer role` 以规避 400 参数校验报错。
- 可观测性治理：`runtime.log` 启动阶段不清空，保证启动日志、模型解析日志和失败路径可回放。
- 中断恢复治理：收到 `SIGINT/SIGTERM` 先触发 `abort`，再立即落盘 `steps/mcp_calls/assistant_turns/runtime.log`。
- 工件完整性治理：MCP 工具返回默认不截断，排障证据优先完整保留。
- 浏览器会话治理：停止时优先 `Browser.close`，会话不可用时回退进程 `SIGTERM`。
- 噪音控制治理：浏览器选择日志只保留最终选中来源，避免双来源日志误导排障。
- 模式隔离治理：`observe` 不能强依赖 LLM/MCP 初始化，避免仅示教场景被模型配置缺失阻塞。
- 示教采集治理：浏览器事件需通过 `addInitScript + 当前页注入` 双路径覆盖，减少导航后监听丢失。
- 多标签治理：录制层不应把多 tab 视为失败，而应显式记录 `tabId` 让后处理阶段理解跨 tab 行为。
- 降噪治理：录制保真与消费摘要要解耦，`sop-compact` 作为手动后处理更利于迭代压缩策略。
- 防漂移治理：进入跨模块改造前先冻结“单一闭环 + AC 阈值 + Gate 评审”，评审通过前不启动实现。
- 输入融合治理：`type/input` 链路需以“最终有效输入值”为准，`Backspace/Delete/方向键` 等编辑键默认视为噪声，不应单独占据 compact 步骤。
- hint 去重治理：`webElementHints` 去重键应至少包含 `purpose+selector+textHint+roleHint`，避免 selector 重复导致资产噪声膨胀。

## Environment Requirements
- Node `>=20`
- 可用 CDP endpoint（默认 `http://localhost:9222`）
- 可用登录 cookie（`~/.sasiki/cookies/*.json`）
- Playwright MCP 可启动（默认 `@playwright/mcp@latest`）

## Working Conventions
- 需求加载顺序：`PROGRESS.md` -> `MEMORY.md` -> `NEXT_STEP.md` -> `.plan/20260304_watch_once_v0_prd.md` -> `.plan/20260304_watch_once_v0_engineering_handoff.md`
- 每次迭代先确认目标工件，再实施：
  - E2E：`steps.json` / `mcp_calls.jsonl` / `runtime.log` / `final.png`
  - 示教：`demonstration_raw.jsonl` / `demonstration_trace.json` / `sop_draft.md`
