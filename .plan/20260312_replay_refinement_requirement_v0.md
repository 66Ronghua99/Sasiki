# Replay + Online Refinement Requirement v0 (2026-03-12)

## 1. Project Reading Snapshot
- 已读取：`PROGRESS.md`、`NEXT_STEP.md`、`MEMORY.md`、`AGENTS.md`、共享路由 `AGENT_INDEX.md`。
- 上一阶段状态：`interactive_reasoning_sop_compact` 已冻结完成，`compact_capability_output` 已可稳定产出。
- 本阶段输入证据：
  - `artifacts/e2e/20260310_153315_481/compact_session_state.json`
  - `artifacts/e2e/20260310_153315_481/compact_human_loop.jsonl`
  - `artifacts/e2e/20260310_153315_481/compact_capability_output.json`
- 用户目标（本轮确认）：
  - 问题不是“sop-compact 无法产出 workflow”，而是“当前消费链路过于复杂，导致 core agent 页面打转、token 冗余”。
  - 需要新增 `online refinement`：在真实执行中学习“任务相关 vs 无关页面信息”，沉淀为后续 core agent 可消费的低 token 知识。

## 2. Requirement Gaps (Known/Unknown/Conflicts)
### Known
- 业务目标：降低执行阶段 snapshot/context token 消耗，同时保持任务成功率。
- 最小业务场景：小红书 creator platform 填内容并存草稿（无图片）。
- 关键原则：
  - 最小闭环是多轮 agent 对话。
  - MVP 先验证 agent 能力，不先堆外围规则。
  - 角色区分为 `sop agent` / `refine agent` / `core agent`。
- 边界共识：不回到 heuristic rule-based 过滤拼接主导路径。

### Unknown
- P1：`human_override` 的长期机制（是否在 UI 暴露“重标注”能力）仍未定义，v0 不做。
- P1：跨任务泛化的 planner 设计（如何自动生成任务成功口径）后移到下一阶段。

### Conflicts
- 历史文档中存在“不要引入第二个 refinement agent”的结论（旧 compact-stage inline HITL 背景）；当前需求明确要求增加专职 `refine agent`。
- 处理策略：以 2026-03-12 新需求为准，旧结论仅视为历史阶段约束，不再作为本阶段阻塞。

## 3. Decision Log (Resolved)
| ID | Priority | Decision | Why this matters | Unlocked Scope |
| --- | --- | --- | --- | --- |
| D1 | P0 | 相关性由 agent 主判；v0 不做离线 `human_override` 重标注台 | 降低 MVP 交互复杂度，避免把闭环依赖到人工审文件 | `RefinementStepRecord.relevance` 先按 agent 写入 |
| D2 | P0 | 任意一步判定 `no_progress` 即触发 HITL | 保证快速纠偏，避免页面打转拉高 token | refine loop 状态机可直接实现 |
| D3 | P0 | MVP 仅支持 pinned `--sop-run-id` | 先隔离检索变量，验证 agent 能力本身 | 首期实现范围固定 |
| D4 | P0 | `promotion_gate` 采用 agent 高置信直升 + critic challenge；不使用规则打分 | 避免回到 heuristic/rule-based 语义裁决 | knowledge promotion 可进入实现 |
| D5 | P1 | `CoreConsumptionBundle` 通过 MCP client 预处理注入，`tokenBudget=1000` | 明确注入入口与成本边界 | consumption filter 输入输出可固定 |
| D6 | P1 | 复用作用域仅同平台；任务通过短描述匹配或用户指定 | 限制知识污染范围 | surface/task scope 可收敛 |
| D7 | P2 | 通用任务成功口径后移到 planner 阶段 | 当前先聚焦单 benchmark 闭环 | 不阻塞 v0 implementation |
| D8 | P0 | consumption 主路径固定为 `MCP hook filtered-view`，`full snapshot file read` 仅 debug | 避免 core agent 在文件系统打转，同时保留离线审计能力 | Slice-1 可直接实现并验证 |
| D9 | P0 | MCP tool return 外层格式保持兼容，refinement 仅可改写 observation text | 防止上层 agent/tool 协议漂移导致混乱 | McpToolBridge 改造边界清晰 |

## 3.1 Clarification Freeze (2026-03-12)
- `snapshot`：必须完整离线落盘（文件存储 + index）；`refine agent` 默认消费 summary，必要时可回链原始快照。
- `step`：v0 记录单位固定为 `mutation tool call`；同时通过 `pageStepId` 聚合同一页面下连续操作，重点评估“是否推进任务/是否页面变化/是否纯信息提取”。
- `assistantIntent`：来源于当前回合 reasoning 摘要，不做规则补猜。
- `relevance`：默认由 agent 判断；若本步判定 `no_progress`，立即触发 HITL。
- HITL：v0 只做“当下纠偏指令”输入，不做历史标签覆盖编辑台。
- `promotion_gate`：允许 agent 高置信直接晋升；不采用规则打分模型决定语义正确性。
- 注入位置：优先走 MCP client 预处理；`tokenBudget=1000`。
- consumption 形态：默认 `filtered-view`，保留 full snapshot 离线文件与索引；`full file read` 仅 debug。
- 成功口径：当前 benchmark 固定为“草稿保存成功”；通用任务成功口径由后续 planner 阶段统一定义。
- 作用域：仅同平台复用；任务匹配可通过简短任务描述或用户显式指定。

## 3.2 Contract Field Dictionary (v0)
| Field | Type | Source | Write Timing | Purpose |
| --- | --- | --- | --- | --- |
| `pageId` | string | browser runtime | 每次进入/切换页面时 | page 级 step 归属键 |
| `stepIndex` | number | orchestrator | 每次 mutation tool call 结束时 | 顺序回放与审计 |
| `recordUnit` | enum (`tool_call`) | orchestrator | 每次步骤写入时 | 固定 v0 计量单位 |
| `pageStepId` | string | orchestrator | 每次步骤写入时 | 同页面连续操作聚合键 |
| `toolCallId` | string | MCP call | 调工具时 | 工具调用级关联键 |
| `operationIndexWithinPageStep` | number | orchestrator | 每次步骤写入时 | pageStep 内顺序 |
| `pageBoundaryReason` | enum (`navigation`,`tab_switch`,`url_change`,`manual_reset`) | orchestrator | pageStep 切换时 | 页面边界切换原因 |
| `beforeSnapshot` | object (`path`,`summary`,`snapshot_hash`) | gateway capture | 动作前 | 记录动作前状态 |
| `afterSnapshot` | object (`path`,`summary`,`snapshot_hash`) | gateway capture | 动作后 | 评估动作影响 |
| `assistantIntent` | string | refine agent reasoning | 调工具前 | 标记该步意图 |
| `toolName` | string | MCP call | 调工具时 | 记录动作类型 |
| `toolArgs` | object | MCP call | 调工具时 | 记录动作参数 |
| `resultExcerpt` | string | tool result | 动作后 | 快速定位成功/失败原因 |
| `outcome` | enum (`progress`,`no_progress`,`page_changed`,`info_only`,`blocked`) | refine agent judgment | 动作后 | 判断推进状态 |
| `relevance` | enum (`task_relevant`,`task_irrelevant`,`unknown`) | refine agent judgment | 动作后 | 标注相关性 |
| `human_intervention_note` | string[] | HITL reply | 触发 HITL 后 | 记录纠偏指令，不改历史标签 |
| `promoteDecision` | enum (`promote`,`hold`) | refine agent final turn | 每轮回顾后 | 评审事件字段，决策后才生成 `PromotedKnowledgeRecord` |
| `confidence` | enum (`high`,`medium`,`low`) | refine agent final turn | 每轮回顾后 | 表示后验置信，不是规则分 |
| `provenance` | object (`runId`,`pageId`,`stepIndex`,`snapshot_hash`) | orchestrator | promotion 时 | 证据回链 |
| `knowledgeId` | string | knowledge store | promotion 写入时 | promoted knowledge 稳定主键（去重/upsert） |
| `tokenBudget` | number | runtime config | bundle 生成时 | 控制注入体量（v0=1000） |
| `estimatorVersion` | string | consumption filter | bundle 生成时 | AC4 tokenEstimate 比较版本锚点 |
| `snapshotIndex` | jsonl | gateway capture | 每次 pre/post 采集 | full snapshot 索引（`snapshot_index.jsonl`） |
| `consumptionMode` | enum (`filtered_view`,`full_snapshot_debug`) | runtime config | run 启动时 | 决定 core 是否只看 filtered view |

## 4. Requirement Snapshot v0
### feature_name
`replay_online_refinement`

### stage_name
`requirement_freeze_v0`

### problem
`sop-compact` 已能抽出 workflow，但执行消费链路信息冗余导致 core agent 在页面打转、snapshot token 过高。缺少“执行中学习并压缩上下文”的在线 refinement 机制。

### scope
- 在 `run/replay` 过程中引入专职 `refine agent` 编排：
  - 调用 browser operator（subagent/gateway）执行动作。
  - 按 `page-step` 逐步记录 snapshot、动作、element、结果。
  - 生成“任务相关/无关”标注与改进建议。
  - 单步 `no_progress` 即触发 HITL，并吸收纠偏指令。
- 产出可回放知识：用于 core agent 下次执行时缩小输入上下文。
- MVP 仅覆盖 pinned run + 单 benchmark（小红书长文草稿保存）。

### non_goals
- 不做通用检索/排序系统重构。
- 不做多站点泛化 benchmark。
- 不做规则机主导的页面过滤。
- 不在本阶段改造 sop agent（compact 主链只接受 bugfix）。

### acceptance_criteria
- AC1：单次在线 refinement 运行可产出完整 `page-step` 记录（含 before/after snapshot 文件索引、tool call、element hints、结果）。
- AC2：运行中任意一步判定 `no_progress` 时，必须触发 HITL，并写入 `human_intervention_note`。
- AC3：可产出一份 core consumption bundle（低 token），通过 MCP client 预处理注入，且 `tokenBudget<=1000`。
- AC4：第二轮相同 benchmark 执行时，`consumption_bundle.tokenEstimate` 必须低于首轮至少 20%，且任务仍可完成（以“存草稿成功”作为业务结果）。
- AC5：`refinement.enabled=false` 时，现有 run 路径行为不变。

### evidence_artifacts
- `artifacts/e2e/<run_id>/refinement_steps.jsonl`
- `artifacts/e2e/<run_id>/refinement_knowledge.jsonl`
- `artifacts/e2e/<run_id>/snapshot_index.jsonl`
- `artifacts/e2e/<run_id>/consumption_bundle.json`
- `artifacts/e2e/<run_id>/high_level_logs.json`
- 业务完成证据：`artifacts/e2e/<run_id>/final.png` + 日志状态字段

### open_risks
- 知识污染：错误相关性判定被长期复用。
- 事件错位：tool call 与 snapshot 对不上导致错误归因。
- 双重循环冲突：旧 run HITL 与 refine HITL 叠加。
- 过拟合当前 DOM：知识过度绑定 selector。
- `human_override` 机制暂未产品化，v0 只能依赖“实时纠偏 + 下轮再学习”。
- 若未实现跨 run 索引（`surfaceKey + taskKey`），AC4（二轮收敛）不可验证。

### p0_next_candidate
冻结 `Option B sidecar orchestrator` 的架构并实现 Slice-1（instrumentation + pinned replay + advisory knowledge injection）。

## 5. Next Confirmation Checklist
- [x] 确认本阶段主问题是“消费复杂度/token冗余”，不是“compact 产物缺失”。
- [x] 确认角色命名与职责：`sop agent` / `refine agent` / `core agent`。
- [x] 确认 MVP 只做单 benchmark + pinned replay。
- [x] 确认不采用 heuristic rule-based 作为主策略。
- [x] 确认先做 requirement freeze，再做 architecture，再进入实现。
- [ ] 进入 `drive-pm-closed-loop` 风格的最小实现切片执行（本文件之后）。
