# PROGRESS

## Doc Ownership
- `PROGRESS.md` 只记录当前代码基线、活跃指针、DONE/TODO。
- `MEMORY.md` 只保留跨阶段仍然成立的经验和环境要求。

## Restart Baseline
- 仓库已回滚到 `3c973462158c2cdb22c4cd7fb803db88af8bcbb7`，作为这次重启同步的代码基线。
- 仓库已完成 Harness migration bootstrap，`.harness/bootstrap.toml` 是当前机器可读 governance 入口真源。
- 本次重启同步的目标不是延续旧阶段流水账，而是把文档重新收口到“当前代码真实存在什么、下一步唯一要做什么”。

## Current Code Status
- **Runtime Telemetry Event Stream 任务已完成**: `telemetry` config 已成为显式 contract，composition root 统一注入 run-scoped telemetry，`AgentLoop` / observe / compact 都会发 runtime events，refine 的 canonical artifacts 已收敛为 `event_stream.jsonl`、run summary artifact、`agent_checkpoints/` 与 attention knowledge store。
- **Workflow Host Task 2 已完成**: observe 侧的 workflow 构造已迁入 `src/application/observe/observe-workflow.ts`，`ObserveExecutor` 现在在 observe-owned 代码里自行构造 `SopAssetStore`，`ExecutionContextProvider` 也已收窄为 refine-only。
- **Workflow Host Task 5 已完成**: `src/runtime/agent-execution-runtime.ts` 已删除；`application/shell/runtime-host.ts` 现在是唯一顶层 lifecycle owner；`workflow-runtime.ts` 已收窄为命令到 workflow 的薄协调层；compact service 构造已迁回 `runtime-composition-root.ts`。
- **Workflow registration cleanup 已完成**: `application/observe/observe-runtime.ts` 这个过渡 wrapper 已删除；`RuntimeHost` 只保留 `run(workflow)` 这条活跃宿主接口；未使用的 `createRefineWorkflowFactory` / `createCompactWorkflowFactory` 已移除，workflow 注册链路现在统一收敛为 `workflow-runtime -> runtime-host -> *-workflow`。
- **Refine smoke e2e 已完成**: 真实任务 `打开百度搜索咖啡豆，点开第一条链接` 已在 `run_id=20260322_002735_676` 跑通，最终 `completed`，并产出新的 `artifacts/e2e/20260322_002735_676/run_summary.json` 与 `artifacts/e2e/20260322_002735_676/event_stream.jsonl` 证据；本轮暴露的问题已收敛为“首轮仍会尝试 `initial_navigation`”与“page-changing action 后仍偶发 stale observation 自恢复”。
- **Refine tool surface unification Task 1-3 已完成**: Task 1 已冻结 bridge / bootstrap / facade regression；Task 2 已新增 refine-local `tools/` core abstractions；Task 3 已补上 refine-owned hook observer、provider layer、lifecycle rollback 与 run-scoped provider context seam，并通过重复 observation regression 锁住同一 run 下 observationRef 递增不回退。当前 live refine runtime path 仍保持旧 adapter/registry 接线不变。
- backward capability cleanup 已完成；仓库当前基线只保留最新架构代码与当前产品面。
- **Cleanup Task 2 已完成**: `src/core/**` 与 `src/runtime/**` 下的一行兼容源码壳已经删除；当前连最后的 runtime lifecycle wrapper 也已去掉，对应边界测试与 `lint:arch` 断言已同步切到“禁止回生”。
- **Cleanup Task 3 已完成**: legacy CLI compatibility surface 已移除；CLI 现在只保留 `observe` / `refine` / `sop-compact` 的显式解析语义，bare task / unknown command / archived alias 都走明确失败，不再保留迁移升级提示。
- **Cleanup Task 4 已完成**: taxonomy migration docs 已归档；`docs/architecture/overview.md` 现在是唯一前台架构入口，`docs/architecture/layers.md` 降级为 supporting reference，`apps/agent-runtime/README.md` 也已切到当前 CLI surface。
- **Cleanup Task 5 已完成**: 早前 post-cleanup gates 已通过；本轮 workflow-host clarification 的 fresh hardgate evidence 已记录为 `artifacts/code-gate/2026-03-21T06-29-23-232Z/report.json`。
- **Task 9 已完成**: 文档清理、lint 硬边界最终确认、门禁闭环完成。全局 taxonomy 重组计划正式收尾。
- **Task 8 已被当前真相取代**: 顶层 runtime lifecycle wrapper 已删除；shell front door 现在直接以 `application/shell/runtime-host.ts` 承接 workflow lifecycle。
- **Task 7 已完成**: `application/refine/` 现在是 refine bootstrap、prompts、tooling、orchestration 和 executor 的 canonical home；旧 `runtime/replay-refinement/*` 已被移除，不再作为活跃目录语义存在。
- **Task 6 已完成**: `application/observe/` 与 `application/compact/` 现在是 observe orchestration/recording support 和 SOP compact 的 canonical home；旧 runtime-era 路径不再作为活跃目录语义存在。
- **Task 5 已完成**: `application/shell/` 与 `application/config/` 现在是 shell/composition 和 runtime-config loader/types 的 canonical home；旧 provider 层已经退场，不再作为长期目录边界保留。
- **Task 4 已完成**: `kernel/` 现在是 true execution kernel 的 canonical home（`agent-loop.ts`, `mcp-tool-bridge.ts`）；`core/` 仅保留为迁移期 shim。
- **Task 3 已完成**: LLM adapters (`infrastructure/llm/`), config loading (`infrastructure/config/`), persistence adapters (`infrastructure/persistence/`) 已迁移到 infrastructure 层。
- **Task 2 已完成**: legacy direct run 作为活跃产品面已移除；CLI 外部契约冻结为 `observe` / `refine` / `sop-compact`；legacy `runtime` / `--mode run|observe` 只保留为显式 upgrade error。
- **Task 1 已完成**: 活跃架构文档已冻结为全局 taxonomy spec 和 implementation plan。

## Active Architecture Truth

当前已验证的 canonical truth：

```
apps/agent-runtime/src/
  domain/           - 产品概念、状态schema、跨层契约
  contracts/        - 能力接口（logger, tool-client, HITL等）
  kernel/           - 可复用执行内核（agent-loop, mcp-tool-bridge）
  application/      - 用例编排层
    shell/          - CLI shell, command-router, runtime-host, composition-root
    config/         - runtime-config loader/types
    observe/        - observe orchestration + recording support
    compact/        - SOP compact workflow
    refine/         - refine bootstrap, prompts, tooling, orchestration, executor
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
- `docs/testing/strategy.md`

## Active Spec / Plan
- `docs/superpowers/specs/2026-03-22-refine-tool-surface-unification-design.md`
- `docs/superpowers/plans/2026-03-22-refine-tool-surface-unification-implementation.md`

## Historical Background (Load On Demand)
- `.plan/20260310_interactive_reasoning_sop_compact.md`
- `.plan/20260312_replay_refinement_requirement_v0.md`
- `.plan/20260312_replay_refinement_online_design.md`
- `.plan/20260313_execution_kernel_refine_core_rollout.md`
- `.plan/checklist_interactive_reasoning_sop_compact.md`
- `.plan/checklist_replay_refinement_online.md`
- `.plan/checklist_execution_kernel_refine_core_rollout.md`
- `docs/superpowers/specs/2026-03-21-workflow-host-boundary-clarification.md`
- `docs/superpowers/plans/2026-03-21-workflow-host-boundary-clarification-implementation.md`
- `docs/testing/refine-e2e-xiaohongshu-long-note-runbook.md`

说明：
- 以上 `.plan/*` 文档现在只作为历史背景和设计线索，不再视为当前 active 真源。
- 旧 refinement / e2e 文档、`harness doc-truth-sync`、`executor/bootstrap boundary refactor`、`runtime surface pruning`、taxonomy reorg 和 backward capability cleanup 计划文档都已降级为历史背景。

## TODO
- `P0` 执行 `docs/superpowers/plans/2026-03-22-refine-tool-surface-unification-implementation.md` Task 4：先把 runtime tools 迁成 first-class definitions，并继续保持 live refine client path 还未整体切换到新 surface。

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
  - fresh hardgate report：`artifacts/code-gate/2026-03-20T19-31-13-753Z/report.json`
- 已完成 backward capability cleanup：
  - 删除了全部 compatibility source shells
  - 删除了 legacy CLI compatibility surface
  - 归档了 migration truth，并重置了前门架构文档
  - fresh hardgate report：`artifacts/code-gate/2026-03-21T03-24-45-657Z/report.json`
- 已完成 workflow-host boundary clarification Task 5：
  - 删除了 `src/runtime/agent-execution-runtime.ts`
  - 明确了 `runtime-host.ts` 是唯一顶层 lifecycle owner
  - 将 compact service 构造移回 composition root
  - 收紧了 lint / boundary tests / front-door docs
  - fresh hardgate report：`artifacts/code-gate/2026-03-21T06-09-17-280Z/report.json`
- 已完成 runtime telemetry event stream pass：
  - 新增 `telemetry` config contract 与 run-scoped telemetry registry
  - `AgentLoop`、observe、compact 都接入统一 telemetry 注入
  - refine canonical artifacts 收敛为 `event_stream.jsonl`、run summary artifact、`agent_checkpoints/`
  - 旧 steps / assistant turns / `refine_*` 平行 artifacts 不再作为 refine 主真源
  - fresh hardgate report：`artifacts/code-gate/2026-03-21T14-38-44-019Z/report.json`
- 已完成 workflow registration cleanup：
  - 删除 `apps/agent-runtime/src/application/observe/observe-runtime.ts`
  - 删除未使用的 `createRefineWorkflowFactory` / `createCompactWorkflowFactory`
  - 将 `RuntimeHost` 收敛为只承载 `run(workflow)` 的共享 host 契约
  - fresh hardgate report：`artifacts/code-gate/2026-03-21T16-10-40-375Z/report.json`
- 已完成 refine smoke e2e：
  - 任务：`打开百度搜索咖啡豆，点开第一条链接`
  - run id：`20260322_002735_676`
  - 结果：`completed`
  - 关键证据：
    - `artifacts/e2e/20260322_002735_676/run_summary.json`
    - `artifacts/e2e/20260322_002735_676/event_stream.jsonl`
- 已完成 refine tool surface unification Task 1 regression freeze：
  - 新增 `apps/agent-runtime/test/kernel/mcp-tool-bridge.test.ts`
  - 补强 `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
  - 补强 `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
  - fresh verification：`npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-tool-client.test.ts test/runtime/refine-run-bootstrap-provider.test.ts test/kernel/mcp-tool-bridge.test.ts`
- 已完成 refine tool surface unification Task 2 core abstractions：
  - 新增 `apps/agent-runtime/src/application/refine/tools/` 下的 core contracts / order / registry / surface / lifecycle
  - 新增 `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
  - 将 tool order contract 从 `apps/agent-runtime/src/domain/refine-react.ts` 移至 `apps/agent-runtime/src/application/refine/tools/refine-tool-order.ts`
  - fresh verification：`npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-contracts.test.ts`
- 已完成 refine tool surface unification Task 3 provider / hook scaffolding：
  - 新增 `apps/agent-runtime/src/application/refine/tools/refine-tool-hook-observer.ts`
  - 新增 `apps/agent-runtime/src/application/refine/tools/providers/refine-browser-provider.ts`
  - 新增 `apps/agent-runtime/src/application/refine/tools/providers/refine-runtime-provider.ts`
  - `RefineBrowserTools` / `RefineRuntimeTools` 已显式暴露 `setProviderContext(...)` seam
  - 新增 bridge observer adapter regression 与 monotonic observation regression
  - fresh verification：
    - `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts`
    - `npm --prefix apps/agent-runtime run test -- test/kernel/mcp-tool-bridge.test.ts`
