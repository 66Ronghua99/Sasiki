# Sasiki Project AGENTS

## Project Overview
Sasiki 是一个浏览器任务自动化 agent 系统，核心目标是把“示教一次”沉淀为后续可复用的执行能力，并在真实执行中持续优化。

## Read First
1. `PROGRESS.md`
2. `NEXT_STEP.md`
3. `MEMORY.md`
4. `AGENT_INDEX.md`（项目根优先，缺失时用共享路由）

## Core Project Rules
1. 最小闭环必须是多轮 agent 对话，不做 heuristic rule-based 过滤拼接主导。
2. MVP 先验证 agent 能力边界，再决定外围约束；不要先堆复杂 structure/contract/fallback。
3. 统一命名：
- `sop agent`：workflow 提取（已完成阶段）
- `refine agent`：在线流程优化与知识沉淀
- `core agent`：最终任务自动执行

## Key Flows
1. `observe -> sop-compact`：示教录制与流程能力抽取。
2. `run -> replay/refinement`：执行任务、在线复盘、HITL 介入、知识沉淀。
3. `knowledge -> core consumption`：把 refinement 知识压缩为低 token 可消费上下文。

## Module Boundaries
- `apps/agent-runtime/src/runtime/interactive-sop-compact.ts`：`sop agent` 主流程。
- `apps/agent-runtime/src/core/agent-loop.ts`：浏览器执行 agent（后续由 core/refine 复用）。
- `apps/agent-runtime/src/runtime/run-executor.ts`：当前 run 编排（后续接 replay+refinement sidecar）。
- `apps/agent-runtime/src/runtime/sop-consumption-context.ts`：当前消费注入入口（后续接 refinement knowledge bundle）。

## Quality Gates
代码变更交付前至少通过：
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

## Related Docs
- Active compact design: `.plan/20260310_interactive_reasoning_sop_compact.md`
- Active compact checklist: `.plan/checklist_interactive_reasoning_sop_compact.md`
- Next stage (replay + refinement) 需求与架构文档见 `.plan/20260312_*`
