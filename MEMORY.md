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
- 语义抽象治理：`sop-compact` 不能把单次示教中的具体实例直接提升为通用规则；必须拆分 `workflow_guide`、`decision_model` 与 `observed_examples`，把无法稳定推出的边界显式落为 `uncertainFields`。
- compact-stage HITL 治理：人工输入应只用于补关键决策边界，并以结构化 `intent_resolution` 覆盖自动推断；高优先级不确定项未解决前，资产不得进入 `ready_for_replay`。
- 意图注入治理：compact 阶段的意图来源必须分层合并，优先级固定为 `intent_resolution > inferred_from_trace > intent_seed > default_rule`，避免后续 replay 同时消费多份相互冲突的“意图文本”。
- 工件真源治理：当 compact 同时产出结构化 JSON 与可读文档时，必须固定 `JSON` 为单一真源，`MD` 仅作为渲染结果，避免 replay 侧消费两套不一致的 guide。
- 状态门禁治理：compact 阶段的资产状态只能由 `compact_manifest.json` 单点声明；`ready_for_replay` 必须同时通过 admission matrix、结构完整性、污染检测与 question 映射完整性校验。
- 抽象执行模型治理：`sop-compact` 的核心 intent/workflow/decision 生成必须由 agent draft 主导；deterministic 逻辑只负责 evidence extraction 与 validation/gate，不能重新退化成关键词分类器或 `goalType -> workflow template`。
- 关键词使用边界：字符串匹配只允许出现在 `abstraction_input.json` 的 weak signals 层，用于 evidence labeling；没有 agent draft 时只允许输出保守 fallback，并保持 `needs_clarification`，不能假装 replay-ready。
- 产物分层治理：内部 compact 工件用于抽象/审计/gate，最终 runtime 应只消费 `execution_guide.json` 这一份冻结后的 replay guide，而不是并读多份内部 JSON。
- 结构化输出治理：模型即使被要求返回 JSON，也经常退化成字符串数组或弱 schema 对象；structured prompt 需要显式给出字段级 JSON 形状示例，merge 层也必须宽容吸收 `string[] -> object[]` 的降级输出。
- 行为纠偏治理：若 agent draft 将明显的集合处理任务收窄成 `single_object_update`，可由 deterministic 的抽象行为证据（如 `iterate_collection`）做 `goalType` 纠偏；这类纠偏只允许发生在跨域通用行为层，不能回到领域字符串分类。
- surface 治理：`surface` 推断应优先来自 URL path 等结构信息，不能再依赖站点名 + 业务关键词的耦合判断。
- V0 归档原因：即使去掉了大部分业务关键词推断，只要 `TargetEntity/GoalType` 仍作为核心 schema 驱动 `decision_model/execution_guide`，抽象层就仍然混入了领域语义；V1 必须把“行为抽象”和“语义用途判定”彻底拆开。
- HITL 边界治理：当 agent 对“这个行为到底代表什么业务对象/用途/完成标准”不确定时，应直接生成用户澄清问题，而不是由 deterministic fallback 继续拼接业务语义。
- 增量迁移治理：V0 -> V1 的 schema 重构优先采用 dual-write/add-first；先新增 V1 工件并验证样本，再切换 `execution_guide` 编译入口，最后移除 legacy，避免一次性替换导致回归不可诊断。
- legacy 退役治理：一旦 `execution_guide.v1` 已接管 replay 主链路，就应尽快移除 `structured_abstraction/workflow_guide/decision_model` 的双写和落盘；继续保留只会让样本目录、manifest 和后续 compact-stage HITL 边界继续变脏。
- prompt 体量治理：`semantic_intent_draft` 若直接吞完整 `behavior_evidence.stepEvidence`，即使在 45s timeout 下也可能被 abort；V1 语义链路需要先对行为证据做摘要视图（phaseSignals/actionSummary/exampleCandidates/stepEvidenceSample），再交给模型解释语义。
- prompt 结构治理：`semantic_intent_draft` 的输入顺序应优先给 `behavior_workflow`，再给去噪后的 evidence/examples；同时强制 `strict JSON + single-line string values`，可显著降低 MiniMax/OpenRouter 路径下的输出漂移与控制字符风险。
- evidence 去噪治理：semantic prompt 摘要里应去掉 selector-only candidates、长 query URL、原始 selector 串等低语义密度噪声；在样本 `run_id=20260308_110124_276` 上，这样可把输入从约 `3.5k-4.1k` tokens 压到约 `2.36k-2.70k` tokens。
- replay gate 真源治理：`execution_guide.v1` 接管后，`ready_for_replay` 必须由 `semantic_intent_draft.blockingUncertainties + clarification_questions + intent_resolution` 决定；不能再回退到 V0 `decision_model.uncertainFields`。
- execution guide 编译治理：`execution_guide.v1` 应固定输出 `generalPlan + detailContext`，其中 `workflowOutline/stepDetails` 由 `behavior_workflow` 提供骨架，`goal/scope/doneCriteria/constraints` 由 `semantic_intent_draft` 与 `intent_resolution` 提供语义。
- MiniMax 结构化稳定性治理：在 OpenRouter + MiniMax 的 strict JSON 路径上，`thinkingLevel=off` 比 `high` 更适合作为回归验收配置；高 thinking 可用于探索，但 ready-path 验收优先选更稳定的结构化配置。
- OpenRouter 解析治理：当 `baseUrl` 指向 `openrouter.ai` 时，模型解析必须优先按 OpenAI-compatible 路径处理，并保留完整 OpenRouter model token；不能再被 `minimax/...` 这类 provider 前缀带到 `anthropic-messages` 等错误 API。
- clarification ownership 治理：只要 `clarification_questions` 仍存在“模型问题 + 模板补题”混合路径，最终 question 风格和语义边界就会不一致；V1 必须改为 agent-owned，deterministic 只做 coverage check。
- clarification coverage 治理：`clarification_questions` 的 coverage 真源必须是 `semantic_intent_draft.blockingUncertainties`；deterministic 只允许做 field-level normalize/filter，不能再按 fallback 模板自动补题。
- step kind 稳定性治理：当 prompt 只靠自然语言描述枚举约束时，模型仍会输出 `click/select/edit` 等本体行为词；若最终 schema 仍依赖后处理翻译，说明结构契约层级还不对。
- replay guide 分层治理：最终 `execution_guide` 不能只有通用流程，也不能只保留示教细节；run 阶段需要一个同时具备 `generalPlan + detailContext` 的单一消费工件，前者给方向，后者给局部动作线索与历史记忆访问。
- legacy replay freeze 治理：在 `execution_guide.v1` 接管前，`execution_guide.v0` 不能再被标记成 `ready_for_replay`；否则会把仍依赖 `goalType/targetEntity` 的不完整 guide 提前放行。

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
- HITL 兼容治理：`hitl.enabled=false` 时必须保持旧版单次执行行为；自动重试和人工介入不能在默认配置下悄悄生效。

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
