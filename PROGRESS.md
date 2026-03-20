# PROGRESS

## Doc Ownership
- `PROGRESS.md` 只记录当前代码基线、活跃指针、DONE/TODO。
- `MEMORY.md` 只保留跨阶段仍然成立的经验和环境要求。

## Restart Baseline
- 仓库已回滚到 `3c973462158c2cdb22c4cd7fb803db88af8bcbb7`，作为这次重启同步的代码基线。
- 仓库已完成 Harness migration bootstrap，`.harness/bootstrap.toml` 是当前机器可读入口真源。
- 本次重启同步的目标不是延续旧阶段流水账，而是把文档重新收口到“当前代码真实存在什么、下一步唯一要做什么”。

## Current Code Status
- CLI 当前有两类入口：
  - `runtime`：支持 `run` / `observe`
  - `sop-compact`：支持多轮 interactive compact session
- 浏览器执行主链仍是单一 shared execution kernel：
  - `AgentLoop -> McpToolBridge -> Playwright MCP`
- `WorkflowRuntime` 仍按 `refinement.enabled` 分流：
  - `false -> RunExecutor`
  - `true -> OnlineRefinementRunExecutor`
- `observe`、`interactive-sop-compact`、`replay-refinement` 代码都仍然存在于当前仓库。
- `replay-refinement` 的代码基线仍在，但这条架构线在本次重启后尚未重新冻结为新的 active spec。
- 当前仓库已接入的验证命令是：
  - `npm --prefix apps/agent-runtime run lint:docs`
  - `npm --prefix apps/agent-runtime run lint:arch`
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run hardgate`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
- 当前基线还没有独立 `npm --prefix apps/agent-runtime run test`；该命令会在 active implementation plan 的 Task 2 引入。

## Active References (L0)
- `PROGRESS.md`
- `NEXT_STEP.md`
- `MEMORY.md`
- `AGENT_INDEX.md`
- `.harness/bootstrap.toml`
- `docs/project/current-state.md`
- `docs/architecture/overview.md`
- `docs/architecture/layers.md`
- `docs/testing/strategy.md`

## Historical Background (Load On Demand)
- `.plan/20260310_interactive_reasoning_sop_compact.md`
- `.plan/20260312_replay_refinement_requirement_v0.md`
- `.plan/20260312_replay_refinement_online_design.md`
- `.plan/20260313_execution_kernel_refine_core_rollout.md`
- `.plan/checklist_interactive_reasoning_sop_compact.md`
- `.plan/checklist_replay_refinement_online.md`
- `.plan/checklist_execution_kernel_refine_core_rollout.md`

说明：
- 以上 `.plan/*` 文档现在只作为历史背景和设计线索，不再视为当前 active 真源。
- 新的 active spec / plan 将在 `docs/superpowers/specs/` 下重建。

## TODO
- `P0-NEXT` review 当前 implementation plan：
  - 当前计划：`docs/superpowers/plans/2026-03-20-refine-agent-react-implementation.md`
  - 需要确认：contract freeze 顺序、HITL resume surface、`AttentionKnowledge` load handshake、runtime cutover 验证门槛
- `P1` plan review 通过后，进入执行阶段，并替换旧 `.plan/20260312_*` / `.plan/20260313_*` 的 active 指针。
- `P1` 在新架构冻结后，重新运行当前需要保留的验证：
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run hardgate`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
  - 必要时重跑 runtime / refinement benchmark，而不是继续沿用旧轮次 artifact 直接宣称完成

## DONE
- 已完成代码基线回滚到 `3c97346`。
- 已完成 Harness migration bootstrap，并补齐仓库级入口文档与模板。
- 已完成第一轮“重启同步”：
  - 当前文档入口已改为以 `.harness/bootstrap.toml`、`docs/project/current-state.md` 和当前代码为准
  - 历史 `.plan/*` 已降级为 background references
- 已完成新的架构草案：
  - `docs/superpowers/specs/2026-03-19-agent-architecture-redesign.md`
  - 当前草案将 refinement 重构为 `refine agent` 主导的 ReAct 体系
- 已完成 spec pre-plan freeze 收紧：
  - 明确 `observe.query` 的结构化约束和反语义劫持边界
  - 明确 `sourceObservationRef` 同源追踪约束
  - 明确最小跨 run knowledge 复用握手（`N promote -> N+1 load`）
  - 明确 `Pre-Plan Gate`：先 subagent review，再 owner review，之后才允许进入 `writing-plans`
- 已完成一次独立 subagent review，结论为可进入 owner review（无 blocking findings）。
- 已完成 pre-plan rollback snapshot：
  - `docs/superpowers/specs/archive/2026-03-20-agent-architecture-redesign-pre-plan-baseline.md`
  - 该快照用于在进入 `writing-plans` 前保留当前 spec 基线，必要时可直接回退
- 已完成 owner review，并进入 `writing-plans` 阶段。
- 已生成 implementation plan：
  - `docs/superpowers/plans/2026-03-20-refine-agent-react-implementation.md`
- 已同步仓库内最新 lint / verification 口径到项目文档：
  - 当前基线明确包含 `lint:docs`、`lint:arch`、`lint`、`hardgate`、`typecheck`、`build`
  - 当前基线尚未包含独立 `test` script；该层会由 active implementation plan 在 Task 2 引入
- 已完成一次新鲜验证：
  - `npm --prefix apps/agent-runtime run lint`：通过，`lint:arch` 保留 2 个 near-limit warning（`runtime/interactive-sop-compact.ts`、`runtime/replay-refinement/refinement-memory-store.ts`）
  - `npm --prefix apps/agent-runtime run hardgate`：通过
  - hardgate report：`artifacts/code-gate/2026-03-20T02-20-34-784Z/report.json`
