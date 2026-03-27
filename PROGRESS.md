# PROGRESS

## Doc Ownership
- `PROGRESS.md` 是项目状态面板，只记录当前代码基线、活跃主线、项目级风险、最近完成闭环与参考入口。
- `PROGRESS.md` 不再承接 append-only 执行流水、每次方向转向、或细粒度尝试过程；这些内容改记到 `PROJECT_LOGS.md`。
- `PROJECT_LOGS.md` 是 append-only 项目流水账，记录决策、尝试、推翻、转向与验证轨迹。
- `MEMORY.md` 只保留跨阶段仍然成立的经验和环境要求。

## Transition Note
- 2026-03-27 已将旧 `PROGRESS.md` 中符合流水账职责的 `Current Code Status` 与 `DONE` 历史迁移到 `PROJECT_LOGS.md`。
- 从这次迁移开始，`PROGRESS.md` 只保留项目状态面板信息；过程性更新默认直接追加到 `PROJECT_LOGS.md`。

## Restart Baseline
- 仓库已回滚到 `3c973462158c2cdb22c4cd7fb803db88af8bcbb7`，作为这次重启同步的代码基线。
- 仓库已完成 Harness migration bootstrap，`.harness/bootstrap.toml` 是当前机器可读 governance 入口真源。
- 本次重启同步的目标不是延续旧阶段流水账，而是把文档重新收口到“当前代码真实存在什么、下一步唯一要做什么”。

## Active Mainline
- 当前唯一直接执行指针以 [`NEXT_STEP.md`](/Users/cory/codes/Sasiki-dev/NEXT_STEP.md) 为准；当前 P0 是拆清 TikTok refine-only rerun `20260326_200513_031` 里的 metrics 语义。
- 当前主线不是继续扩 retrieval surface，而是先拆开 bootstrap/start prompt 注入数与 runtime `observe.page` page-knowledge hit 次数的语义。
- 在 metrics 语义拆清之前，不应把 `loadedKnowledgeCount` 当成 runtime page-knowledge hit 的替代指标。

## Project Status
- 当前活跃代码基线已经包含 refine page-level retrieval cues slice；retrieval gate 已切到 exact `page.origin + page.normalizedPath`，`observe.page` 会在稳定 capture 后返回 agent-facing `pageKnowledge`。
- 最近完成的闭环是 refine page-level retrieval cues delivery；fresh verification 为 `npm --prefix apps/agent-runtime run lint`、`test`、`typecheck`、`build`、`hardgate` 全绿，对应 report 为 `artifacts/code-gate/2026-03-26T09-45-42-193Z/report.json`。
- 最新运行时证据显示 TikTok rerun `20260326_200513_031` 已在 `/chat/inbox/current` 真实命中非空 `pageKnowledge`，说明 page-level knowledge 已进入真实 refine 运行链路。
- 当前前门架构真相仍是 OpenAI-style layer model + narrowed shell/application/kernel split；`runtime-host.ts` 是唯一顶层 workflow lifecycle owner，`kernel/*` 已不再 direct import `domain/*` / `infrastructure/*`。

## Active Risks
- `loadedKnowledgeCount` 当前只代表 bootstrap/start prompt guidance 注入数，和 runtime page-knowledge hit 次数可能分离。
- TikTok customer-service refine e2e 里仍存在 URL literal fidelity 问题：模型会把 `&register_libra=` 污染成 `®ister_libra=`，降低 `act.navigate` 可预测性。
- start prompt 的 finish policy 仍可能偏保守；即使 empty-state knowledge 与 DOM 证据已经互相印证，agent 仍可能继续做一轮等价复核。

## Active Architecture Truth

当前已验证的 canonical truth：

```text
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

## Active References
- Default task-entry docs:
  - `NEXT_STEP.md`
  - `MEMORY.md`
  - `AGENT_INDEX.md`
  - `.harness/bootstrap.toml`
- Project-state docs:
  - `PROGRESS.md`
  - `docs/project/current-state.md`
  - `docs/architecture/overview.md`
- On-demand historical trace:
  - `PROJECT_LOGS.md`
  - `docs/testing/strategy.md`

## Active Spec / Plan
- `docs/superpowers/specs/2026-03-24-refine-tiktok-customer-service-e2e-design.md`
- `docs/superpowers/plans/2026-03-24-refine-tiktok-customer-service-e2e-implementation.md`
- `docs/testing/refine-e2e-tiktok-shop-customer-service-runbook.md`
- `docs/project/refine-observe-page-surface-analysis.md`
- `docs/project/refine-observation-enhancement-decision-matrix.md`
- `docs/superpowers/specs/2026-03-24-refine-observation-stabilization-design.md`
- `docs/superpowers/plans/2026-03-24-refine-observation-stabilization-implementation.md`

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
