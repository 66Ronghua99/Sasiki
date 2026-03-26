# Sasiki Project AGENTS

## Project Overview
Sasiki 是一个浏览器任务自动化 agent 系统，核心目标是把“示教一次”沉淀为后续可复用的执行能力，并在真实执行中持续优化。

当前仓库处于 workflow-host boundary clarification 已完成后的基线：代码与前门文档已经重新收口，旧 `.plan/*` 设计文档默认只作为背景资料。

## Read First
1. `PROGRESS.md`
2. `NEXT_STEP.md`
3. `MEMORY.md`
4. `AGENT_INDEX.md`（项目根优先，缺失时用共享路由）
5. `.harness/bootstrap.toml`
6. `docs/project/current-state.md`
7. `docs/architecture/overview.md`
8. `docs/superpowers/templates/`

## Sandbox E2E 路由（主路径）
1. **Seed bootstrap**
   - 先在种子仓库执行 `bootstrap`（如有需要保留 `profile/cookie`）。
   - 新 worktree 通过 `--source` 或 `SASIKI_SANDBOX_SOURCE` 执行 bootstrap 继承。
   - feature worktree 不应只同步代码；当前 front-door docs（至少 `PROGRESS.md`、`NEXT_STEP.md`、`MEMORY.md`、`docs/project/current-state.md`）与 `.sandbox/runtime.config.json` 也应一并同步，保证 worktree 自己就是可执行、可验真的完整上下文。

2. **统一端到端执行**
   - 优先使用 `flow`/`selfcheck` 作为主路径，不建议直接绕开走 observe/compact/refine 单点命令。
   - 推荐命令：
     - `node .sandbox/bin/sandbox-workflow.mjs flow --observe-task "..."`
     - `node .sandbox/bin/sandbox-selfcheck.mjs --source <seed>`

3. **观测与归档**
   - 开启 `--inspect` 获取 observe/compact/refine 阶段 CDP 快照。
   - 产物主归档到 `.sandbox/artifacts/...`，便于回放与 diff。

4. **默认 profile/cookie**
   - 当前默认目录为 `~/.sasiki/chrome_profile` 与 `~/.sasiki/cookies`，可在 `.sandbox/runtime.config.json` 改回 `.sandbox` 路径。

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
2. `refine`：执行任务、在线复盘、HITL 介入、知识沉淀。
3. `knowledge -> core consumption`：把 refinement 知识压缩为低 token 可消费上下文。

## Module Boundaries
- `apps/agent-runtime/src/index.ts`：CLI 入口，当前支持 `observe` / `refine` / `sop-compact`。
- `apps/agent-runtime/src/application/shell/command-router.ts`：CLI 参数解析与 archived command 拒绝。
- `apps/agent-runtime/src/application/shell/runtime-host.ts`：唯一顶层 workflow lifecycle owner。
- `apps/agent-runtime/src/application/shell/workflow-runtime.ts`：command -> workflow 选择与 host handoff 的薄协调层。
- `apps/agent-runtime/src/application/shell/runtime-composition-root.ts`：shell 级 composition root，负责 browser/MCP 与 workflow factory 装配。
- `apps/agent-runtime/src/application/observe/`：observe workflow 与 recording support。
- `apps/agent-runtime/src/application/compact/`：sop-compact workflow。
- `apps/agent-runtime/src/application/refine/`：refine bootstrap、tooling、executor、workflow。
- `apps/agent-runtime/src/kernel/pi-agent-loop.ts`：shared execution kernel 的核心执行环。

## Quality Gates
代码变更交付前至少通过：
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
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
