# Sasiki Project AGENTS

## Project Overview
Sasiki 是一个浏览器任务自动化 agent 系统，核心目标是把“示教一次”沉淀为后续可复用的执行能力，并在真实执行中持续优化。

当前仓库处于“重启同步”阶段：代码基线已经回滚，文档入口已经切到 Harness 格式，旧 `.plan/*` 设计文档默认只作为背景资料。

## Read First
1. `PROGRESS.md`
2. `NEXT_STEP.md`
3. `MEMORY.md`
4. `AGENT_INDEX.md`（项目根优先，缺失时用共享路由）
5. `.harness/bootstrap.toml`
6. `docs/project/current-state.md`
7. `docs/architecture/overview.md`
8. `docs/superpowers/templates/`

## Core Project Rules
1. 最小闭环必须是多轮 agent 对话，不做 heuristic rule-based 过滤拼接主导。
2. MVP 先验证 agent 能力边界，再决定外围约束；不要先堆复杂 structure/contract/fallback。
3. 当前代码事实优先于历史 `.plan/*`；若代码与旧设计冲突，以“当前代码 + 新 spec”重建真源。
3. 统一命名：
- `sop agent`：workflow 提取（已完成阶段）
- `refine agent`：在线流程优化与知识沉淀
- `core agent`：最终任务自动执行

## Key Flows
1. `observe -> sop-compact`：示教录制与流程能力抽取。
2. `run -> replay/refinement`：执行任务、在线复盘、HITL 介入、知识沉淀。
3. `knowledge -> core consumption`：把 refinement 知识压缩为低 token 可消费上下文。

## Module Boundaries
- `apps/agent-runtime/src/index.ts`：CLI 入口，当前支持 `run` / `observe` / `sop-compact`。
- `apps/agent-runtime/src/runtime/interactive-sop-compact.ts`：当前 `sop agent` 主流程。
- `apps/agent-runtime/src/core/agent-loop.ts`：shared execution kernel 的核心执行环。
- `apps/agent-runtime/src/runtime/run-executor.ts`：legacy run 主路径。
- `apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts`：当前 refinement run 入口。
- `apps/agent-runtime/src/runtime/sop-consumption-context.ts`：legacy consumption 注入入口。

## Quality Gates
代码变更交付前至少通过：
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run hardgate`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

## Related Docs
- Bootstrap manifest: `.harness/bootstrap.toml`
- Harness templates: `docs/superpowers/templates/`
- Current state: `docs/project/current-state.md`
- Current architecture summary: `docs/architecture/overview.md`
- Historical compact background: `.plan/20260310_interactive_reasoning_sop_compact.md`
- Historical replay/refinement background: `.plan/20260312_replay_refinement_online_design.md`
- Historical rollout background: `.plan/20260313_execution_kernel_refine_core_rollout.md`
