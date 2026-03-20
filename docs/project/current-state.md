# Current State

## Restart Status
- Repository baseline has been rolled back to commit `3c97346`.
- Harness migration bootstrap is complete.
- Active project truth has been reset to the current codebase plus the Harness entry docs.
- Historical `.plan/*` documents remain available as background references, but they are no longer treated as active source of truth.

## Current Entry Commands
- `npm --prefix apps/agent-runtime run lint:docs`
- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`
- `node apps/agent-runtime/dist/index.js "打开小红书，搜索咖啡豆推荐，打开帖子并点赞后截图"`

## Code-Backed Baseline
- CLI entrypoints live in `apps/agent-runtime/src/index.ts`:
  - `runtime` command with `run` / `observe`
  - `sop-compact` command
- Runtime mode selection lives in `apps/agent-runtime/src/runtime/workflow-runtime.ts`:
  - `refinement.enabled=false -> RunExecutor`
  - `refinement.enabled=true -> OnlineRefinementRunExecutor`
- The current shared browser execution kernel remains:
  - `AgentLoop -> McpToolBridge -> Playwright MCP`
- Current major code areas:
  - `observe`: `apps/agent-runtime/src/runtime/observe-runtime.ts`
  - `compact`: `apps/agent-runtime/src/runtime/interactive-sop-compact.ts`
  - `legacy run`: `apps/agent-runtime/src/runtime/run-executor.ts`
  - `replay/refinement`: `apps/agent-runtime/src/runtime/replay-refinement/*`

## Current Documentation Truth
- Active entry docs:
  - `PROGRESS.md`
  - `NEXT_STEP.md`
  - `MEMORY.md`
  - `AGENT_INDEX.md`
  - `.harness/bootstrap.toml`
  - `docs/architecture/overview.md`
- Historical background docs:
  - `.plan/20260310_interactive_reasoning_sop_compact.md`
  - `.plan/20260312_replay_refinement_requirement_v0.md`
  - `.plan/20260312_replay_refinement_online_design.md`
  - `.plan/20260313_execution_kernel_refine_core_rollout.md`

## Follow-Up
- Summarize the restart baseline into a new architecture spec under `docs/superpowers/specs/`.
- Decide which parts of the historical replay/refinement design remain valid and which should be explicitly superseded.
- Keep `.harness/bootstrap.toml` updated if verify or E2E commands change.
