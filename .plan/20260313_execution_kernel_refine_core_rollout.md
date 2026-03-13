# Execution Kernel + Refine Core Rollout (2026-03-13)

## Goal
- 把已冻结架构转为可并行执行的 worker tracks。
- 保持双路径并存：
1. Core-direct mode：`Core Brain -> Execution Kernel`
2. Refinement mode：`Refine Brain + Orchestrator`
- 同时收口共享契约与 benchmark 验收证据。

## Global Constraints
- 不改 freeze 边界：`refinement.enabled=false` 行为必须与 legacy run 等价。
- 不引入 rule-based 语义裁决替代 LLM 判断。
- 每个 track 必须产出可验证证据（日志/工件/命令输出）。

## Track A: Core-Direct Mode Path
- Ownership: `worker-core-direct`
- Scope:
1. 固化 `refinement.enabled=false` 路径为默认稳定主链。
2. 保持 `Core Brain -> Execution Kernel` 的直接执行，不注入 refine 编排。
3. 明确切换门：仅配置开关决定 direct/refinement 分流。
- Non-goals:
1. 不新增 refinement 特有 artifacts。
2. 不修改 knowledge store/promotion 逻辑。
- File Targets:
1. `apps/agent-runtime/src/runtime/workflow-runtime.ts`
2. `apps/agent-runtime/src/runtime/run-executor.ts`
3. `apps/agent-runtime/src/runtime/agent-execution-runtime.ts`
4. `apps/agent-runtime/src/runtime/runtime-config.ts`
- Verification Commands:
1. `npm --prefix apps/agent-runtime run typecheck`
2. `npm --prefix apps/agent-runtime run build`
3. `REFINEMENT_ENABLED=false node apps/agent-runtime/dist/index.js run --task "<task>"`
4. `rg -n "refinement_runtime_enabled|refinement_run_started" artifacts/e2e/<run_id>/runtime.log`（预期无命中）

## Track B: Refinement Mode Path (Refine Brain + Orchestrator)
- Ownership: `worker-refinement-mode`
- Scope:
1. 打通 `OnlineRefinementRunExecutor -> OnlineRefinementOrchestrator -> DecisionEngine`。
2. 保证 `evaluate(turn)` 与 `promote(turn,evaluation)` 可运行并可降级。
3. run 结束后可导出 decision audit 供 artifacts 写入。
- Non-goals:
1. 不做跨站点检索泛化策略扩展。
2. 不引入第二套 HITL 协议。
- File Targets:
1. `apps/agent-runtime/src/runtime/replay-refinement/online-refinement-run-executor.ts`
2. `apps/agent-runtime/src/runtime/replay-refinement/online-refinement-orchestrator.ts`
3. `apps/agent-runtime/src/runtime/replay-refinement/refinement-decision-engine.ts`
4. `apps/agent-runtime/src/runtime/replay-refinement/refinement-hitl-loop.ts`
- Verification Commands:
1. `npm --prefix apps/agent-runtime run typecheck`
2. `npm --prefix apps/agent-runtime run build`
3. `REFINEMENT_ENABLED=true node apps/agent-runtime/dist/index.js run --sop-run-id <run_id> --task "<task>"`
4. `ls -la artifacts/e2e/<run_id>/refinement_steps.jsonl artifacts/e2e/<run_id>/refinement_knowledge.jsonl artifacts/e2e/<run_id>/snapshot_index.jsonl`
5. `rg -n "refinement_decision_.*(succeeded|fallback)" artifacts/e2e/<run_id>/runtime.log`

## Track C: Shared Kernel/Gateway Contract Hardening
- Ownership: `worker-kernel-contract`
- Scope:
1. 固化 `tool_call` 级 step contract 与 pageStep 聚合口径。
2. 固化 gateway/orchestrator 间 `BrowserOperatorTurnResult` 字段语义。
3. 固化 snapshot/index/artifact 落盘接口一致性。
- Non-goals:
1. 不重写 AgentLoop 主控制流。
2. 不改变 MCP tool return 外层兼容契约。
- File Targets:
1. `apps/agent-runtime/src/core/agent-loop.ts`
2. `apps/agent-runtime/src/core/mcp-tool-bridge.ts`
3. `apps/agent-runtime/src/domain/refinement-session.ts`
4. `apps/agent-runtime/src/domain/refinement-knowledge.ts`
5. `apps/agent-runtime/src/runtime/replay-refinement/browser-operator-gateway.ts`
6. `apps/agent-runtime/src/runtime/artifacts-writer.ts`
- Verification Commands:
1. `npm --prefix apps/agent-runtime run typecheck`
2. `npm --prefix apps/agent-runtime run build`
3. `rg -n "schemaVersion\\\":\\\"refinement_step_record.v0\\\"" artifacts/e2e/<run_id>/refinement_steps.jsonl`
4. `rg -n "schemaVersion\\\":\\\"snapshot_index.v0\\\"" artifacts/e2e/<run_id>/snapshot_index.jsonl`
5. `rg -n "tool_call|pageStepId|operationIndexWithinPageStep" artifacts/e2e/<run_id>/refinement_steps.jsonl`

## Track D: Acceptance & Benchmark Evidence
- Ownership: `worker-benchmark-evidence`
- Scope:
1. 两轮同任务 benchmark 证据收集与判定。
2. 验收口径固定：
   - Round2 `knowledge_loaded_count > 0`
   - Round2 `tokenEstimate <= Round1 * 0.8`
   - Round2 任务成功（completed + 关键结果信号）
3. 输出 evidence 索引到本计划与 checklist。
- Non-goals:
1. 不在本 track 修改运行时代码。
2. 不替换 benchmark 任务定义。
- File Targets:
1. `artifacts/e2e/<round1_run_id>/runtime.log`
2. `artifacts/e2e/<round1_run_id>/consumption_bundle.json`
3. `artifacts/e2e/<round2_run_id>/runtime.log`
4. `artifacts/e2e/<round2_run_id>/consumption_bundle.json`
5. `artifacts/e2e/<round2_run_id>/refinement_knowledge.jsonl`
- Verification Commands:
1. `rg -n "refinement_knowledge_loaded.v0|knowledge_loaded_count" artifacts/e2e/<round2_run_id>/runtime.log`
2. `node -e 'const fs=require("fs");const r1=JSON.parse(fs.readFileSync("artifacts/e2e/<round1_run_id>/consumption_bundle.json","utf8")).tokenEstimate;const r2=JSON.parse(fs.readFileSync("artifacts/e2e/<round2_run_id>/consumption_bundle.json","utf8")).tokenEstimate;console.log({r1,r2,ratio:r2/r1,pass:r2<=r1*0.8});'`
3. `rg -n "refinement_run_finished|status|finishReason|goal_achieved|completed" artifacts/e2e/<round2_run_id>/runtime.log`
4. `wc -l artifacts/e2e/<round2_run_id>/refinement_knowledge.jsonl`

## Handoff
- 每个 track 交付时必须附：
1. 修改文件列表
2. 运行命令与结果摘要
3. 工件路径与关键字段截图/摘录
4. 未完成项与下一步 P0
