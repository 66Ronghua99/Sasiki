# PROGRESS

## Doc Ownership
- `PROGRESS.md` 只记录当前代码基线、活跃指针、DONE/TODO。
- `MEMORY.md` 只保留跨阶段仍然成立的经验和环境要求。

## Restart Baseline
- 仓库已回滚到 `3c973462158c2cdb22c4cd7fb803db88af8bcbb7`，作为这次重启同步的代码基线。
- 仓库已完成 Harness migration bootstrap，`.harness/bootstrap.toml` 是当前机器可读 governance 入口真源。
- 本次重启同步的目标不是延续旧阶段流水账，而是把文档重新收口到“当前代码真实存在什么、下一步唯一要做什么”。

## Current Code Status
- 当前活跃闭环已经切换为 `agent runtime global layer taxonomy`，之前的 `executor/bootstrap boundary refactor` 与 `runtime surface pruning` 只保留为已完成或已被更大方向覆盖的历史背景。
- **Task 9 已完成**: 文档清理、lint 硬边界最终确认、门禁闭环完成。全局 taxonomy 重组计划正式收尾。
- **Task 8 已完成**: `runtime/` 已收窄到 session/state/execution semantics；`runtime/agent-execution-runtime.ts` 是剩余的真实 runtime 实现，其余 `runtime/` 路径为兼容 shim。
- **Task 7 已完成**: `application/refine/` 现在是 refine bootstrap、prompts、tooling、orchestration 和 executor 的 canonical home；`runtime/replay-refinement/*` 以及已迁出的 `runtime/providers/{prompt-provider,refine-run-bootstrap-provider}.ts` 仅保留为适用处的 shim-only compatibility paths。
- **Task 6 已完成**: `application/observe/` 与 `application/compact/` 现在是 observe orchestration/recording support 和 SOP compact 的 canonical home，旧 `runtime/*` 路径只在适用处保留薄 shim。
- **Task 5 已完成**: `application/shell/`、`application/config/` 与 `application/providers/` 现在是 shell/composition、runtime-config loader/types 和 tool-surface/execution-context providers 的 canonical home，旧 `runtime/*` 路径只保留薄 shim where applicable。
- **Task 4 已完成**: `kernel/` 现在是 true execution kernel 的 canonical home（`agent-loop.ts`, `mcp-tool-bridge.ts`）；`core/` 仅保留为迁移期 shim。
- **Task 3 已完成**: LLM adapters (`infrastructure/llm/`), config loading (`infrastructure/config/`), persistence adapters (`infrastructure/persistence/`) 已迁移到 infrastructure 层。
- **Task 2 已完成**: legacy direct run 作为活跃产品面已移除；CLI 外部契约冻结为 `observe` / `refine` / `sop-compact`；legacy `runtime` / `--mode run|observe` 只保留为显式 upgrade error。
- **Task 1 已完成**: 活跃架构文档已冻结为全局 taxonomy spec 和 implementation plan。

## Active Architecture Truth

新的全局层级taxonomy已经是 canonical truth：

```
apps/agent-runtime/src/
  domain/           - 产品概念、状态schema、跨层契约
  contracts/        - 能力接口（logger, tool-client, HITL等）
  kernel/           - 可复用执行内核（agent-loop, mcp-tool-bridge）
  application/      - 用例编排层
    shell/          - CLI shell, command-router, composition-root
    config/         - runtime-config loader/types
    providers/      - tool-surface, execution-context providers
    observe/        - observe orchestration + recording support
    compact/        - SOP compact workflow
    refine/         - refine bootstrap, prompts, tooling, orchestration, executor
  runtime/          - 执行态/session/state（收窄语义）
    agent-execution-runtime.ts  - 剩余的真实 runtime 实现
    # 其余 runtime/ 文件为迁移期兼容 shim
  infrastructure/   - 外部适配器
    llm/            - model-resolver, json-model-client
    config/         - runtime-bootstrap-provider
    persistence/    - artifacts-writer, sop-asset-store, attention-knowledge-store, refine-hitl-resume-store
    mcp/            - mcp-stdio-client
    browser/        - cdp-browser-launcher, cookie-loader
    hitl/           - terminal-hitl-controller
  utils/            - 纯工具函数
```

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
- `docs/superpowers/specs/2026-03-21-agent-runtime-layer-taxonomy-reorg.md`
- `docs/superpowers/plans/2026-03-21-agent-runtime-layer-taxonomy-reorg-implementation.md`

## Historical Background (Load On Demand)
- `.plan/20260310_interactive_reasoning_sop_compact.md`
- `.plan/20260312_replay_refinement_requirement_v0.md`
- `.plan/20260312_replay_refinement_online_design.md`
- `.plan/20260313_execution_kernel_refine_core_rollout.md`
- `.plan/checklist_interactive_reasoning_sop_compact.md`
- `.plan/checklist_replay_refinement_online.md`
- `.plan/checklist_execution_kernel_refine_core_rollout.md`
- `docs/testing/refine-e2e-xiaohongshu-long-note-runbook.md`

说明：
- 以上 `.plan/*` 文档现在只作为历史背景和设计线索，不再视为当前 active 真源。
- 旧 refinement / e2e 文档、`harness doc-truth-sync`、`executor/bootstrap boundary refactor` 和 `runtime surface pruning` 文档都已降级为历史背景；当前 active spec 是全局 layer taxonomy 重组。

## TODO
- 当前 taxonomy reorganization plan 已全部完成。
- 后续工作将转入 stability / e2e / tooling optimization 轨道（与 taxonomy 重组是独立工作流）。

## DONE
- 已完成代码基线回滚到 `3c97346`。
- 已完成 Harness migration bootstrap，并补齐仓库级入口文档与模板。
- 已完成第一轮“重启同步”。
- 已完成新的全局 taxonomy spec 与 active plan：
  - `docs/superpowers/specs/2026-03-21-agent-runtime-layer-taxonomy-reorg.md`
  - `docs/superpowers/plans/2026-03-21-agent-runtime-layer-taxonomy-reorg-implementation.md`
- 已完成 Task 1 (Docs Freeze)。
- 已完成 Task 2 (Legacy Surface Pruning)。
- 已完成 Task 3 (Infrastructure Extraction)。
- 已完成 Task 4 (Kernel Narrowing)。
- 已完成 Task 5 (Application Skeleton)。
- 已完成 Task 6 (Observe & Compact Rehome)。
- 已完成 Task 7 (Refine Rehome)。
- 已完成 Task 8 (Runtime Narrowing)。
- 已完成 Task 9 (Final Closure)：
  - 更新了所有活跃文档，移除旧目录语义引用
  - 确认了最终 taxonomy 状态
  - 通过了全部 repo gates
