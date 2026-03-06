# MEMORY

## Doc Ownership
- `PROGRESS.md` 负责里程碑、DONE/TODO、当前执行引用。
- `MEMORY.md` 负责可复用经验、踩坑根因、排障约定与环境要求。
- 新的“经验总结”默认写入 `MEMORY.md`，`PROGRESS.md` 只保留里程碑级状态结论。

## Known Pitfalls
- `LLM model` 与 `baseUrl` 容易错配：DashScope 场景优先使用 `openai/qwen-plus`，避免 `MiniMax + DashScope` 导致 4xx/能力不兼容。
- 浏览器任务“看起来完成”不等于“业务完成”：必须用可验证证据确认（页面状态变化、截图、结构化步骤）。
- 仅靠 prompt 很难稳定复刻复杂 SOP：需要真实示教数据作为后续优化依据。
- 语义层调用具备环境依赖（网络/鉴权/模型可用性）：任何失败都必须回退到 rule-based 产物，不能阻塞 `sop_compact.md` 输出。
- API 兼容性坑：部分 OpenAI-compatible 端点对 reasoning/thinking 参数兼容不稳定，语义层失败时应优先将 `thinkingLevel` 设为 `off` 再排查。
- 代理环境坑：当 shell 设置了 `http_proxy/https_proxy` 时，本地 `localhost:9222` CDP 连接与探活可能被错误代理；自测 replay 前需显式设置 `NO_PROXY=localhost,127.0.0.1,::1`。

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
- 语义增强治理：`sop-compact` 需要显式写出 `semanticMode` 与 `semanticFallback`，并把 fallback 原因写入 `runtime.log` 方便排障。
- 结构解耦治理：跨链路服务（如 `AgentRuntime`、`sop-compact`）优先收敛为“编排壳”，将规则计算、语义调用、渲染、I/O 拆为可替换组件，降低回归风险并提升测试粒度。
- 命名归位治理：当模块已承载多能力（agent + observe）时，顶层命名应升级为中性编排名（如 `WorkflowRuntime`），并短期保留旧名兼容导出以平滑迁移。
- 消费注入治理：run 侧 SOP 资产消费必须 `config-gated`（默认关闭）并保持 no-asset/guide-missing 场景非阻塞回退，避免影响主执行链路稳定性。
- 消费可观测性治理：每次 run 必须落盘 `sop_consumption.json`，并在日志中包含 `asset_id/guide_source/fallback_used`，否则无法排查“注入是否生效”。
- 检索匹配治理：当前 `SopAssetStore.search` 的 taskHint 匹配是 `asset.taskHint.includes(query.taskHint)`，当 run 任务语句比资产 taskHint 更长时容易 miss；Phase-3 后续应评估改为双向包含或归一化匹配策略。
- 验收解耦治理：验证 SOP 消费效果时，优先使用 `--sop-run-id` 走确定性注入，避免“检索 miss + 指令仍成功”造成伪通过。
- 任务来源治理：pinned 场景允许 task 为空并回退到 `asset.taskHint`，同时在消费证据中记录 `taskSource=request|asset_task_hint` 便于回放判定。
- guide 优先级治理：run 注入时优先读取 `guide_semantic.md`，其次 `sop_compact.md`，最后 `sop_draft.md`，确保尽量消费 compact 后资产。
- 阶段拆分治理：当“检索质量”与“消费效果验证”相互干扰时，先走 pinned run_id 的确定性闭环，再把检索优化独立为单模块迭代。
- 协作操作系统治理：用户级 `AGENTS.md` 需要长期保持“方法论协议”定位（原则、Gate、文件职责、渐进加载）；项目状态与阶段结论只写入 `PROGRESS/MEMORY/NEXT_STEP`，避免职责漂移。
- 高层日志治理：`run` 侧的 HITL / failure aggregation 必须直接消费结构化 `high_level_logs.json`，不要回退到解析 `runtime.log` 文本；runtime 级事件（如 interrupt/final result）需要与 agent 级事件统一 schema 后再合并排序。
- 工程根解析治理：runtime 的路径解析只能依赖工程根标记（如 `.git`），不能依赖 `PROGRESS.md` / `AGENTS.md` 之类协作文档是否存在。

## Environment Requirements
- Node `>=20`
- 可用 CDP endpoint（默认 `http://localhost:9222`）
- 可用登录 cookie（`~/.sasiki/cookies/*.json`）
- Playwright MCP 可启动（默认 `@playwright/mcp@latest`）

## Working Conventions
- 需求加载顺序：`PROGRESS.md` -> `MEMORY.md` -> `NEXT_STEP.md` -> `.plan/20260304_watch_once_v0_prd.md` -> `.plan/20260304_watch_once_v0_engineering_handoff.md`
- 每次迭代先确认目标工件，再实施：
  - E2E：`steps.json` / `mcp_calls.jsonl` / `assistant_turns.json` / `high_level_logs.json` / `runtime.log` / `final.png`
  - 示教：`demonstration_raw.jsonl` / `demonstration_trace.json` / `sop_draft.md`
