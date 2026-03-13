# Checklist: Execution Kernel + Refine Core Rollout

## Track A: Core-Direct Mode
- [ ] `refinement.enabled=false` 时走 direct run executor 路径，且无 refine runtime event
- [ ] direct run 生成 legacy 工件（`steps.json`、`mcp_calls.jsonl`、`assistant_turns.json`）
- [ ] direct run 不要求生成 refinement 工件（如生成需有兼容说明）
- [ ] 证据已附：`artifacts/e2e/<run_id>/runtime.log` 中无 `refinement_run_started`
- [ ] 命令证据已附：`REFINEMENT_ENABLED=false node apps/agent-runtime/dist/index.js run --task "<task>"`

## Track B: Refinement Mode
- [ ] `OnlineRefinementRunExecutor` 接线并可完成一次完整 run
- [ ] orchestrator 能调用 `evaluate(turn)` 与 `promote(turn,evaluation)`
- [ ] LLM 失败时触发安全降级（`evaluate:no_progress/unknown`，`promote:hold/low`）并记录日志
- [ ] run 后可读取 decision audit（`listDecisionAudits/getDecisionAudit`）并写入运行态证据
- [ ] 证据已附：`artifacts/e2e/<run_id>/runtime.log` 命中 `refinement_decision_*`
- [ ] 工件证据已附：`refinement_steps.jsonl`、`snapshot_index.jsonl`、`refinement_knowledge.jsonl`
- [ ] 工件一致性证据：`mutation_tool_call_count == refinement_step_record_count`（允许显式白名单例外并给解释）

## Track C: Shared Kernel/Gateway Contract
- [ ] `refinement_step_record.v0` 字段完整（含 `pageStepId/toolCallId/operationIndexWithinPageStep`）
- [ ] `snapshot_index.v0` 字段完整（含 `phase/path/snapshotHash/tokenEstimate`）
- [ ] `BrowserOperatorTurnResult` 到 artifacts 的字段映射无丢失
- [ ] `MCP tool return` 外层兼容约束未被破坏
- [ ] 证据已附：`rg` 命中 schemaVersion 与关键字段
- [ ] 命令证据已附：`npm --prefix apps/agent-runtime run typecheck && npm --prefix apps/agent-runtime run build`

## Track D: Acceptance & Benchmark
- [ ] Round1/Round2 使用同任务与同口径配置完成
- [ ] Round2 日志出现 `knowledge_loaded_count>0`
- [ ] Round2 `consumption_bundle.tokenEstimate <= Round1 * 0.8`
- [ ] Round2 任务成功（必须出现明确业务成功信号；优先 `finishReason=goal_achieved`）
- [ ] Round2 生成并可读取 `refinement_knowledge.jsonl`
- [ ] 每条 promoted knowledge 均含 `rationale + critic_challenge + final_decision` 字段
- [ ] 证据已附：两轮 run 的 `runtime.log` 与 `consumption_bundle.json`

## Delivery Gate
- [ ] 每个 track 已提交“修改文件列表 + 命令结果 + 工件路径”
- [ ] 所有未完成项已写明阻塞原因与 P0 next
