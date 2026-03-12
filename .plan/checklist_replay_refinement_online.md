# Checklist: Replay + Online Refinement

## Requirement Freeze
- [x] 已冻结问题定义：核心痛点是执行消费冗余与 token 膨胀
- [x] 已冻结角色命名：`sop agent` / `refine agent` / `core agent`
- [x] 已冻结 MVP benchmark：小红书 creator 长文草稿保存（无图片）
- [x] 已冻结主策略：agent-first，不回退到 heuristic rule-based 主导
- [x] 已冻结范围：先做 pinned replay + online refinement，不做检索泛化
- [x] 已冻结 step/page 关系：step 必须 page-scoped
- [x] 已冻结 HITL 触发：单步 `no_progress` 立即触发
- [x] 已冻结注入预算：MCP 预处理注入，`tokenBudget=1000`

## Architecture Freeze
- [x] 已冻结方案选择：Option B（sidecar orchestrator）
- [x] 已冻结模块边界与 ownership
- [x] 已冻结核心 contracts：`RefinementStepRecord` / `PromotedKnowledgeRecord` / `CoreConsumptionBundle`
- [x] 已冻结 step 计量单位：v0 为 `tool_call`，并通过 `pageStepId` 聚合同页连续操作
- [x] 已冻结兼容策略：`refinement.enabled=false` 时旧路径不变
- [x] 已冻结验证 hooks 与两轮 benchmark 口径
- [x] 已冻结 confidence 机制：agent 后验判断 + critic challenge（非规则打分）
- [x] 已冻结 v0 不做 human override 重标注台
- [x] 已冻结消费主路径：`MCP hook filtered-view`；`full snapshot file read` 仅 debug
- [x] 已冻结 MCP hook 触发白名单（mutation tools）与非触发集合
- [x] 已冻结 MCP tool return 兼容约束（外层结构不变，仅可改写 observation text）
- [x] 已冻结 snapshot index 契约：`snapshot_index.jsonl` + full snapshot 文件索引
- [x] 已冻结 `tool_observation_view.v0` 载荷结构与裁剪上限
- [x] 已冻结 `McpToolBridge` hook 回调签名与降级行为（hook 失败不阻塞 tool call）
- [x] 已冻结 `surfaceKey/taskKey` 归一规则与失败降级策略
- [x] 已冻结 `knowledgeId` 生成与 upsert 去重策略
- [x] 已冻结 `tokenEstimate` 估算器口径与跨版本比较约束
- [x] 已冻结 filtered-view 注入时机（mutation tool end）与 HITL payload 对齐规则

## Slice-1 Implementation
- [x] Phase 1: 仅接线 step capture + artifacts 落盘（不跑 refine LLM）
- [x] Phase 1: 在 `McpToolBridge` 增加 pre/post snapshot hook（支持 `summary_fallback`）
- [x] Phase 1: 扩展 artifacts writer 输出 `refinement_steps.jsonl`
- [x] Phase 2: 接入 refine LLM `evaluate -> critic -> finalize` 三段式 JSON 调用（无 HITL）
- [x] Phase 2: 实现 `promoteDecision/confidence/rationale` 落盘
- [x] Phase 2: 实现第一轮 bundle 编译（仅 `compact_capability_output` 输入）
- [x] Phase 3: 接入 refinement HITL pause/resume（CLI stdin）
- [x] Phase 3: 实现跨 run knowledge store（`surfaceKey + taskKey` 索引加载）
- [x] 扩展 runtime config 与 workflow runtime 接线（`refinement.enabled` 开关）

## Evidence
- [x] 产出 `refinement_steps.jsonl`
- [x] 产出 `consumption_bundle.json`
- [x] 产出 `snapshot_index.jsonl`
- [x] 产出 `refinement_knowledge.jsonl`（允许为空）
- [ ] 第二轮 benchmark 的 `consumption_bundle.tokenEstimate <= 第一轮 * 0.8`
- [ ] 第二轮 benchmark 任务仍成功（草稿保存）
- [ ] 每条 promoted knowledge 包含 `rationale + critic_challenge + final_decision`
- [ ] 第二轮日志存在 `knowledge_loaded_count>0`

## Quality Gates
- [x] `npm --prefix apps/agent-runtime run typecheck`
- [x] `npm --prefix apps/agent-runtime run build`

## Docs Sync
- [x] `AGENTS.md` 已更新为项目级治理文档
- [x] `PROGRESS.md` 已更新阶段状态与文档入口
- [x] `MEMORY.md` 已沉淀 replay/refinement 新治理边界
- [x] `NEXT_STEP.md` 已切到 Slice-1 实现指针
