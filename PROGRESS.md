# PROGRESS

## Doc Ownership
- `PROGRESS.md` 只记录当前代码基线、活跃指针、DONE/TODO。
- `MEMORY.md` 只保留跨阶段仍然成立的经验和环境要求。

## Restart Baseline
- 仓库已回滚到 `3c973462158c2cdb22c4cd7fb803db88af8bcbb7`，作为这次重启同步的代码基线。
- 仓库已完成 Harness migration bootstrap，`.harness/bootstrap.toml` 是当前机器可读 governance 入口真源。
- 本次重启同步的目标不是延续旧阶段流水账，而是把文档重新收口到“当前代码真实存在什么、下一步唯一要做什么”。

## Current Code Status
- **Phase 1 layer-model hardgate baseline 已完成**: `apps/agent-runtime/src` 的 OpenAI-style layer model 已冻结到当前前门文档与架构门禁；`lint:arch` 现在显式拒绝未知 top-level root、任何新 `src/runtime/*` / `src/core/*`、workflow horizontal edges、以及 refine-tools role drift；当前仍未收窄完的 `kernel/*` / non-shell `application/* -> infrastructure/*` / `application/refine/tools/runtime|providers/*` 只允许通过显式 exception ledger 留存，不能静默扩张；本轮 fresh hardgate report 为 `artifacts/code-gate/2026-03-23T04-23-38-903Z/report.json`。
- **Phase 2 kernel narrowing Task 1 文档盘点已完成**: 当前 `kernel/*` 的 import leakage 已按代码真相登记到前门文档；今天只有 `src/kernel/pi-agent-loop.ts` 仍带 Phase 2 removal target，其中 `../domain/agent-types.js` 和 `../domain/high-level-log.js` 属于 product-domain leakage，`../infrastructure/llm/model-resolver.js` 属于 infrastructure leakage；`pi-agent-tool-adapter.ts` 与 `pi-agent-tool-hooks.ts` 当前只依赖 `contracts/*` / `kernel/*` / 外部库，不带额外 domain 或 infrastructure import。
- **Phase 2 kernel narrowing contract/injection slice 已完成**: `src/contracts/agent-loop-records.ts` 已成为 `PiAgentLoop` 的 run-state truth，新增 `src/contracts/pi-agent-model.ts` 作为 engine-facing model contract；`application/shell/runtime-composition-root.ts` 现在先解析 refine model 再注入 loop，`src/kernel/**` 已无 direct `domain/*` 或 `infrastructure/*` imports。fresh verification: `npm --prefix apps/agent-runtime run lint`, `test`, `typecheck`, `build`, `hardgate` 均通过；fresh hardgate report 为 `artifacts/code-gate/2026-03-23T05-08-12-656Z/report.json`。
- **Phase 4 hardgate ratchet 已完成**: refine-tools service-owned model 已成为 active truth；`lint-architecture.mjs` 与 script-level ratchet tests 已删掉 stale allowances；`observe-workflow-factory.ts`、`attention-guidance-loader.ts`、`refine-run-bootstrap-provider.ts` 的 type-level infrastructure edges 已改为 application-owned contracts/ports；结构性 tests 现在冻结 shell-only concrete assembly 与 narrowed kernel/application split。fresh verification: `npm --prefix apps/agent-runtime run lint`, `cd apps/agent-runtime && node --test scripts/tests/*.test.mjs`, `npm --prefix apps/agent-runtime run test`, `typecheck`, `build` 全部通过；fresh hardgate（lint + script tests + full test）report 为 `artifacts/code-gate/2026-03-23T11-17-46-430Z/report.json`。
- **Refine tools service consolidation Task 2 已完成**: `refine-tool-context.ts` / `refine-tool-composition.ts` / `definitions/*` 已切到 `browserService` / `runService` service-owned context，`RefineReactToolClient` 现在在无 service owner 时显式失败而不再回退到 raw session scalar mutation，`layer-boundaries.test.ts` 与 refine tool surface / refine-react-tool-client / bootstrap focused tests 已改成 service-owned proof；fresh verification: `npm --prefix apps/agent-runtime run test -- test/application/layer-boundaries.test.ts test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts test/replay-refinement/refine-react-run-executor.test.ts test/runtime/refine-run-bootstrap-provider.test.ts` 通过（94 tests, 0 failures）。
- **Phase 3 Task 1 盘点已完成**: non-shell concrete adapter instantiation 已按 bucket 收口。`observe` bucket 包含 `observe-workflow-factory.ts` 的 `PlaywrightDemonstrationRecorder`，以及 `observe-executor.ts` 的 `ArtifactsWriter` / `SopAssetStore`；`compact` bucket 包含 `interactive-sop-compact.ts` 的 `JsonModelClient` / `TerminalCompactHumanLoopTool` / `ArtifactsWriter`；`refine` bucket 包含 `refine-run-bootstrap-provider.ts` 的 `AttentionKnowledgeStore` / `RefineHitlResumeStore`，以及 `react-refinement-run-executor.ts` 的 `ArtifactsWriter`；`config` bucket 只剩 `application/config/runtime-config-loader.ts` 的 `RuntimeBootstrapProvider`。其中 observe / compact / refine 的 concrete adapters 都是 move-now；config loader seam 仍作为 canonical temporary exception，留待 Phase 3 Task 4。
- **Phase 3 Task 2 observe/compact assembly centralization 已完成**: `runtime-composition-root.ts` 现在统一构造 observe / compact 的 concrete adapters；`observe-workflow-factory.ts`、`observe-executor.ts` 与 `interactive-sop-compact.ts` 已改为消费 injected collaborators/factories，不再在 application 内直接 new `PlaywrightDemonstrationRecorder`、`ArtifactsWriter`、`SopAssetStore`、`JsonModelClient` 或 `TerminalCompactHumanLoopTool`。fresh focused verification: `npm --prefix apps/agent-runtime run test -- test/application/layer-boundaries.test.ts test/application/observe/observe-workflow-factory.test.ts test/application/observe/observe-executor.test.ts test/application/compact/interactive-sop-compact.test.ts` 通过（85 tests, 0 failures）。
- **Phase 3 Task 3 refine bootstrap / artifact assembly centralization 已完成**: `runtime-composition-root.ts` 现在直接构造 refine bootstrap 的 persistence-backed collaborators 与 refine run artifacts writer factory；`refine-workflow.ts` 与 `react-refinement-run-executor.ts` 已改为消费 injected bootstrap/artifact seams，不再在 refine-owned assembly 里创建 bootstrap stores 或 `ArtifactsWriter`。fresh focused verification: `npm --prefix apps/agent-runtime run test -- test/application/layer-boundaries.test.ts test/application/refine/refine-workflow.test.ts test/application/refine/refine-telemetry-artifacts.test.ts test/replay-refinement/refine-react-run-executor.test.ts test/runtime/runtime-composition-root.test.ts` 通过（84 tests, 0 failures）。
- **Phase 3 Task 4 config ownership cleanup 已完成**: `application/config/runtime-config-loader.ts` 现在只保留 normalized config policy；`infrastructure/config/runtime-bootstrap-provider.ts` 只负责 raw env/fs source discovery；新加的 `application/shell/runtime-config-bootstrap.ts` 成为 shell-owned bootstrap seam，负责把 raw bootstrap sources 交给 config loader 归一化。fresh focused verification: `npm --prefix apps/agent-runtime run lint:arch` 通过（0 errors, 2 warnings）；`npm --prefix apps/agent-runtime run test -- test/runtime/runtime-config-loader.test.ts test/runtime/runtime-bootstrap-provider.test.ts test/application/layer-boundaries.test.ts` 通过（79 tests, 0 failures）。
- **Phase 3 closeout verification 已完成**: fresh `npm --prefix apps/agent-runtime run lint`、`lint:arch`、`test -- 'test/application/**/*.test.ts' 'test/runtime/*.test.ts'`、full `test`、`typecheck`、`build`、`hardgate` 全部通过；fresh hardgate report 为 `artifacts/code-gate/2026-03-23T06-18-23-543Z/report.json`。
- **Runtime Telemetry Event Stream 任务已完成**: `telemetry` config 已成为显式 contract，composition root 统一注入 run-scoped telemetry，`PiAgentLoop` / observe / compact 都会发 runtime events，refine 的 canonical artifacts 已收敛为 `event_stream.jsonl`、run summary artifact、`agent_checkpoints/` 与 attention knowledge store。
- **Workflow Host Task 2 已完成**: observe 侧的 workflow 构造已迁入 `src/application/observe/observe-workflow.ts`；随着 Phase 3 Task 2 收口，observe 的 concrete persistence / recorder assembly 已迁回 shell-owned composition，`ExecutionContextProvider` 也已收窄为 refine-only。
- **Workflow Host Task 5 已完成**: `src/runtime/agent-execution-runtime.ts` 已删除；`application/shell/runtime-host.ts` 现在是唯一顶层 lifecycle owner；`workflow-runtime.ts` 已收窄为命令到 workflow 的薄协调层；compact service 构造已迁回 `runtime-composition-root.ts`。
- **Workflow registration cleanup 已完成**: `application/observe/observe-runtime.ts` 这个过渡 wrapper 已删除；`RuntimeHost` 只保留 `run(workflow)` 这条活跃宿主接口；未使用的 `createRefineWorkflowFactory` / `createCompactWorkflowFactory` 已移除，workflow 注册链路现在统一收敛为 `workflow-runtime -> runtime-host -> *-workflow`。
- **Refine smoke e2e 已完成**: 新默认 runbook `打开百度搜索咖啡豆，点击第一条搜索结果链接` 已在 `run_id=20260323_211349_564` 跑通，最终 `completed`；bridge / hook telemetry 健康，事件流中可见 `observe.page -> act.navigate -> act.type -> act.click -> act.select_tab -> run.finish` 完整闭环。最新证据位于 `artifacts/e2e/20260323_211349_564/run_summary.json` 与 `artifacts/e2e/20260323_211349_564/event_stream.jsonl`。当前剩余噪声已收敛为“首轮仍会先错误尝试 `act.navigate` with `initial_navigation`，随后自恢复”。
- **Refine tool surface unification Task 1-8 已完成**: Task 1 已冻结 bridge / bootstrap / facade regression；Task 2 已新增 refine-local `tools/` core abstractions；Task 3 已补上 hook/provider/lifecycle scaffolding；Task 4 已把 `hitl.request`、`knowledge.record_candidate`、`run.finish` 迁成 first-class definitions，并通过 production-side runtime registry seam 把它们注册到新 surface 侧；Task 5 已把 `observe.page`、`observe.query`、`act.click`、`act.type`、`act.press`、`act.navigate`、`act.select_tab` 迁成 first-class browser definitions；Task 6 已把 `act.screenshot`、`act.file_upload` 迁成 first-class browser definitions，同时保持 screenshot capability negotiation 与 file-upload compatibility 行为不变；Task 7 已把 `RefineReactToolClient` 重建为基于 `refine-tool-composition.ts` 的 compatibility facade，并删除旧 adapter-centric registry/files；Task 8 已完成 refine-focused slice 与全项目门禁，并把前门文档同步到新架构真源。
- **Pi-agent hook adapter refactor Task 1-6 已完成**: `kernel/` 的 canonical execution entrypoints 已重命名为 `pi-agent-loop.ts` 和 `pi-agent-tool-adapter.ts`；tool hooks 现在按精确 `toolName` 注册，并且只在 pi-agent tool execution path 上运行；`RefineToolComposition` 改为导出 adapter-compatible `toolHooks`；`RefineToolSurface.callTool(...)` / `RefineReactToolClient.callTool(...)` / bootstrap direct calls 已不再触发 hook；旧 `agent-loop.ts`、`mcp-tool-bridge.ts`、`refine-tool-hook-observer.ts` seam 已删除。
- **Pi-agent hook adapter refactor fresh gates 已完成**: `lint`、`test`、`typecheck`、`build`、`hardgate` 与 `git diff --check` 已通过；fresh hardgate report 为 `artifacts/code-gate/2026-03-23T01-06-37-424Z/report.json`。
- **Doc health sync 已完成**: `docs/project/current-state.md` 已移除虚假 `utils/` 层与过期 active spec/plan 指针；`apps/agent-runtime/README.md` 的 artifact 真相已同步到 `event_stream.jsonl`、run summary artifact、`agent_checkpoints/` 与当前 observe / compact 工件；`MEMORY.md` 与相关 spec/plan metadata 已收口到当前 baseline。
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
- **Task 4 已完成**: `kernel/` 现在是 true execution kernel 的 canonical home（`pi-agent-loop.ts`, `pi-agent-tool-adapter.ts`）；`src/core/**` compatibility shells 已删除，`core/` 不再是活跃层。
- **Task 3 已完成**: LLM adapters (`infrastructure/llm/`), config loading (`infrastructure/config/`), persistence adapters (`infrastructure/persistence/`) 已迁移到 infrastructure 层。
- **Task 2 已完成**: legacy direct run 作为活跃产品面已移除；CLI 外部契约冻结为 `observe` / `refine` / `sop-compact`；legacy `runtime` / `--mode run|observe` 只保留为显式 upgrade error。
- **Task 1 已完成**: 活跃架构文档已冻结为全局 taxonomy spec 和 implementation plan。

## Active Architecture Truth

当前已验证的 canonical truth：

```
apps/agent-runtime/src/
  domain/           - 产品概念、状态schema、跨层契约
  contracts/        - 能力接口（logger, tool-client, HITL等）
  kernel/           - 可复用执行内核（pi-agent-loop, pi-agent-tool-adapter）
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
```

- Phase 2 当前 kernel boundary truth：
  - `apps/agent-runtime/src/kernel/pi-agent-loop.ts`
    current state: 仅依赖 `contracts/*`、`kernel/*`、Node 与 pi-agent libraries；resolved model 通过 shell-owned composition 注入，不再直接引用 `ModelResolver`。
  - `apps/agent-runtime/src/kernel/pi-agent-tool-adapter.ts`
    current state: 无 product-domain / infrastructure import，保留在 narrowed kernel subset。
  - `apps/agent-runtime/src/kernel/pi-agent-tool-hooks.ts`
    current state: 无 product-domain / infrastructure import，保留在 narrowed kernel subset。

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
- `docs/superpowers/specs/2026-03-23-refine-tools-service-consolidation-design.md`
- `docs/superpowers/plans/2026-03-23-refine-tools-service-consolidation-implementation.md`
- `docs/testing/refine-e2e-baidu-search-runbook.md`

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
- `docs/testing/refine-e2e-baidu-search-runbook.md`

说明：
- 以上 `.plan/*` 文档现在只作为历史背景和设计线索，不再视为当前 active 真源。
- 旧 refinement / e2e 文档、`harness doc-truth-sync`、`executor/bootstrap boundary refactor`、`runtime surface pruning`、taxonomy reorg 和 backward capability cleanup 计划文档都已降级为历史背景。

## TODO
- `P0` 修掉 refine smoke 首轮 `act.navigate` 携带 `sourceObservationRef=initial_navigation` 的噪声，让百度 smoke run 在第一步就走合法 bootstrap / observation 路径，而不是依赖一次失败后的自恢复。

## DONE
- 已完成 Phase 2 Task 1（kernel leakage inventory docs sync）：
  - 记录了今天 `kernel/*` 的实际泄漏清单
  - 区分了 product-domain 与 infrastructure imports
  - 为每个 leak 标记了对应 removal target
- 已完成 Phase 2 kernel narrowing direct-import cleanup slice：
  - `PiAgentLoop` 改为消费 injected `resolvedModel` 与 engine-facing run-state contracts
  - `runtime-composition-root.ts` 负责 refine model resolution，并把结果注入 loop
  - `src/kernel/**` direct `domain/*` / `infrastructure/*` imports 已清零
  - fresh gates：`npm --prefix apps/agent-runtime run lint`
  - fresh gates：`npm --prefix apps/agent-runtime run test`
  - fresh gates：`npm --prefix apps/agent-runtime run typecheck`
  - fresh gates：`npm --prefix apps/agent-runtime run build`
  - fresh gates：`npm --prefix apps/agent-runtime run hardgate`
  - fresh hardgate report：`artifacts/code-gate/2026-03-23T05-08-12-656Z/report.json`
- 已完成 Phase 3 Task 1 盘点：
  - `observe` bucket：`PlaywrightDemonstrationRecorder`, `ArtifactsWriter`, `SopAssetStore`
  - `compact` bucket：`JsonModelClient`, `TerminalCompactHumanLoopTool`, `ArtifactsWriter`
  - `refine` bucket：`AttentionKnowledgeStore`, `RefineHitlResumeStore`, `ArtifactsWriter`
  - `config` bucket：`RuntimeBootstrapProvider`
  - move-now：observe / compact / refine 的 concrete adapters
  - temporary exception：config loader seam，留到 Phase 3 Task 4
- 已完成 Phase 3 Task 2 observe/compact assembly centralization：
  - shell-owned composition 现在构造 observe / compact 的 concrete adapters
  - `observe-executor.ts` 已改为消费 injected artifacts writer / asset store / recorder factory
  - `interactive-sop-compact.ts` 已改为消费 injected model client / human loop tool / artifacts writer factory
  - `layer-boundaries.test.ts` 与 observe/compact focused tests 已同步到新的 ownership truth
  - focused verification：`npm --prefix apps/agent-runtime run test -- test/application/layer-boundaries.test.ts test/application/observe/observe-workflow-factory.test.ts test/application/observe/observe-executor.test.ts test/application/compact/interactive-sop-compact.test.ts`
  - result：85 tests passed, 0 failures
- 已完成 Phase 3 Task 3 refine bootstrap assembly centralization：
  - shell-owned composition 现在直接构造 `AttentionKnowledgeStore`、`AttentionGuidanceLoader`、`RefineHitlResumeStore` 与 refine run artifacts writer factory
  - `refine-workflow.ts` 与 `react-refinement-run-executor.ts` 已改为消费 injected `persistenceContext` / `createArtifactsWriter`，不再自己组装 bootstrap persistence context 或 `ArtifactsWriter`
  - `layer-boundaries.test.ts` 与 refine focused tests 已同步到新的 ownership truth
  - focused verification：`npm --prefix apps/agent-runtime run test -- test/application/layer-boundaries.test.ts test/application/refine/refine-workflow.test.ts test/application/refine/refine-telemetry-artifacts.test.ts test/replay-refinement/refine-react-run-executor.test.ts test/runtime/runtime-composition-root.test.ts`
  - result：84 tests passed, 0 failures
- 已完成 Phase 3 Task 4 config ownership cleanup：
  - `runtime-config-loader.ts` 已去掉对 infrastructure config loader 的直接依赖，只保留 `fromBootstrapSources(...)` 归一化入口
  - `runtime-config-bootstrap.ts` 已成为新的 shell-owned config bootstrap seam
  - `runtime-bootstrap-provider.ts` 已收窄为 raw bootstrap source discovery
  - `lint-architecture.mjs` 已删掉 `application/config -> infrastructure/config` 的 Phase 1 exception ledger 条目
  - focused verification：`npm --prefix apps/agent-runtime run lint:arch`
  - focused verification：`npm --prefix apps/agent-runtime run test -- test/runtime/runtime-config-loader.test.ts test/runtime/runtime-bootstrap-provider.test.ts test/application/layer-boundaries.test.ts`
  - result：79 tests passed, 0 failures
- 已完成 Phase 3 closeout verification：
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run lint:arch`
  - `npm --prefix apps/agent-runtime run test -- 'test/application/**/*.test.ts' 'test/runtime/*.test.ts'`
  - `npm --prefix apps/agent-runtime run test`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
  - `npm --prefix apps/agent-runtime run hardgate`
  - fresh hardgate report：`artifacts/code-gate/2026-03-23T06-18-23-543Z/report.json`
- 已完成代码基线回滚到 `3c97346`。
- 已完成 Harness migration bootstrap，并补齐仓库级入口文档与模板。
- 已完成第一轮“重启同步”。
- 已完成新的 Phase 3 governance spec 与 active plan：
  - `docs/superpowers/specs/2026-03-23-agent-runtime-openai-style-layer-model-design.md`
  - `docs/superpowers/plans/2026-03-23-agent-runtime-openai-style-layer-model-phase-3-assembly-centralization-implementation.md`
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
  - `PiAgentLoop`、observe、compact 都接入统一 telemetry 注入
  - refine canonical artifacts 收敛为 `event_stream.jsonl`、run summary artifact、`agent_checkpoints/`
  - 旧 steps / assistant turns / `refine_*` 平行 artifacts 不再作为 refine 主真源
  - fresh hardgate report：`artifacts/code-gate/2026-03-21T14-38-44-019Z/report.json`
- 已完成 workflow registration cleanup：
  - 删除 `apps/agent-runtime/src/application/observe/observe-runtime.ts`
  - 删除未使用的 `createRefineWorkflowFactory` / `createCompactWorkflowFactory`
  - 将 `RuntimeHost` 收敛为只承载 `run(workflow)` 的共享 host 契约
  - fresh hardgate report：`artifacts/code-gate/2026-03-21T16-10-40-375Z/report.json`
- 已完成 refine smoke e2e：
  - 任务：`打开百度搜索咖啡豆，点击第一条搜索结果链接`
  - run id：`20260323_211349_564`
  - 结果：`completed`
  - 关键证据：
    - `artifacts/e2e/20260323_211349_564/run_summary.json`
    - `artifacts/e2e/20260323_211349_564/event_stream.jsonl`
  - 关键观察：
    - bridge / hook telemetry 记录了 `observe.page -> act.navigate -> act.type -> act.click -> act.select_tab -> run.finish`
    - 首轮仍会先错误调用一次 `act.navigate` with `initial_navigation`，随后由 agent 自恢复
- 已完成 refine tool surface unification Task 1 regression freeze：
  - 新增 refine bootstrap / facade / adapter regression freeze coverage（后续已由 `apps/agent-runtime/test/kernel/pi-agent-tool-adapter.test.ts` 取代）
  - 补强 `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
  - 补强 `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
  - fresh verification：`npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-tool-client.test.ts test/runtime/refine-run-bootstrap-provider.test.ts`
- 已完成 refine tool surface unification Task 2 core abstractions：
  - 新增 `apps/agent-runtime/src/application/refine/tools/` 下的 core contracts / registry / surface / lifecycle
  - 新增 `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
  - refine tool list order 现在直接跟随 registry definition insertion order，不再维护独立 order 文件
  - fresh verification：`npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-contracts.test.ts`
- 已完成 refine tool surface unification Task 3 provider / hook scaffolding：
  - 新增 `apps/agent-runtime/src/application/refine/tools/providers/refine-browser-provider.ts`
  - 新增 `apps/agent-runtime/src/application/refine/tools/providers/refine-runtime-provider.ts`
  - `RefineBrowserTools` / `RefineRuntimeTools` 已显式暴露 `setProviderContext(...)` seam
  - 新增 bridge-era hook adapter regression 与 monotonic observation regression（后续 observer seam 已在 pi-agent hook refactor 中删除）
  - fresh verification：
    - `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts`
- 已完成 refine tool surface unification Task 4 runtime definitions：
  - 新增 `apps/agent-runtime/src/application/refine/tools/definitions/hitl-request-tool.ts`
  - 新增 `apps/agent-runtime/src/application/refine/tools/definitions/knowledge-record-candidate-tool.ts`
  - 新增 `apps/agent-runtime/src/application/refine/tools/definitions/run-finish-tool.ts`
  - 新增 production-side registration seam：`apps/agent-runtime/src/application/refine/tools/refine-runtime-tool-registry.ts`
  - fresh verification：`npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts`
- 已完成 refine tool surface unification Task 5 core browser definitions：
  - 新增 `apps/agent-runtime/src/application/refine/tools/definitions/observe-page-tool.ts`
  - 新增 `apps/agent-runtime/src/application/refine/tools/definitions/observe-query-tool.ts`
  - 新增 `apps/agent-runtime/src/application/refine/tools/definitions/act-click-tool.ts`
  - 新增 `apps/agent-runtime/src/application/refine/tools/definitions/act-type-tool.ts`
  - 新增 `apps/agent-runtime/src/application/refine/tools/definitions/act-press-tool.ts`
  - 新增 `apps/agent-runtime/src/application/refine/tools/definitions/act-navigate-tool.ts`
  - 新增 `apps/agent-runtime/src/application/refine/tools/definitions/act-select-tab-tool.ts`
  - 新增 production-side browser registry seam：`apps/agent-runtime/src/application/refine/tools/refine-browser-tool-registry.ts`
  - fresh verification：`npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts`
- 已完成 refine tool surface unification Task 6 screenshot/file-upload definitions：
  - 新增 `apps/agent-runtime/src/application/refine/tools/definitions/act-screenshot-tool.ts`
  - 新增 `apps/agent-runtime/src/application/refine/tools/definitions/act-file-upload-tool.ts`
  - `apps/agent-runtime/src/application/refine/tools/refine-browser-tool-registry.ts` 已将 screenshot/file-upload 纳入 first-class browser order
  - fresh verification：`npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-tool-client.test.ts`
- 已完成 refine tool surface unification Task 7 compatibility facade migration：
  - 新增 `apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts`
  - `RefineReactToolClient` 现在通过 explicit composition/surface/context facade 驱动
  - `createRefineWorkflowAssembly(...)` 现在在 workflow 侧拥有 composition，并把 tool hook registry 注入 loop
  - `ReactRefinementRunExecutor` 现在会在 bootstrap 后回写 loop hook context
  - 已删除 `apps/agent-runtime/src/application/refine/refine-react-tool-registry.ts`
  - 已删除 `apps/agent-runtime/src/application/refine/refine-react-browser-tool-adapter.ts`
  - 已删除 `apps/agent-runtime/src/application/refine/refine-react-runtime-tool-adapter.ts`
  - fresh verification：`npm --prefix apps/agent-runtime run test -- test/application/refine/refine-workflow.test.ts test/runtime/refine-run-bootstrap-provider.test.ts test/replay-refinement/refine-react-tool-client.test.ts test/replay-refinement/refine-react-run-executor.test.ts test/application/refine/refine-telemetry-artifacts.test.ts`
- 已完成 pi-agent hook adapter refactor：
  - 新增 `apps/agent-runtime/src/kernel/pi-agent-loop.ts`
  - 新增 `apps/agent-runtime/src/kernel/pi-agent-tool-adapter.ts`
  - 新增 `apps/agent-runtime/src/kernel/pi-agent-tool-hooks.ts`
  - 新增 `apps/agent-runtime/src/application/refine/tools/refine-pi-agent-tool-hooks.ts`
  - direct `RefineToolSurface.callTool(...)` / `RefineReactToolClient.callTool(...)` / bootstrap observe 已改为 hook-free
  - 已删除 legacy `agent-loop.ts` / `mcp-tool-bridge.ts` / `refine-tool-hook-observer.ts` seam
  - fresh hardgate report：`artifacts/code-gate/2026-03-23T01-06-37-424Z/report.json`
- 已完成 refine tool surface unification Task 8 final verification / doc sync：
  - refine-focused slice：`npm --prefix apps/agent-runtime run test -- 'test/application/refine/*.test.ts' 'test/replay-refinement/*.test.ts' test/runtime/refine-run-bootstrap-provider.test.ts 'test/kernel/*.test.ts'`
  - full gates：`npm --prefix apps/agent-runtime run lint`
  - full gates：`npm --prefix apps/agent-runtime run test`
  - full gates：`npm --prefix apps/agent-runtime run typecheck`
  - full gates：`npm --prefix apps/agent-runtime run build`
  - full gates：`npm --prefix apps/agent-runtime run hardgate`
  - fresh hardgate report：`artifacts/code-gate/2026-03-22T14-24-10-690Z/report.json`
- 已完成 Phase 1 layer-model hardgate baseline：
  - 前门文档与 handoff docs 已统一收口到 2026-03-23 layer-model spec / phase-1 implementation plan
  - `lint:arch` 现已把 exception ledger 作为当前过渡偏差的唯一合法登记面，不再允许 silent widening
  - full gates：`npm --prefix apps/agent-runtime run lint`
  - full gates：`npm --prefix apps/agent-runtime run test`
  - full gates：`npm --prefix apps/agent-runtime run typecheck`
  - full gates：`npm --prefix apps/agent-runtime run build`
  - full gates：`npm --prefix apps/agent-runtime run hardgate`
  - fresh hardgate report：`artifacts/code-gate/2026-03-23T04-23-38-903Z/report.json`
