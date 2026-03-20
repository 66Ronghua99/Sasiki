# Current State

## Restart Status
- Repository baseline has been rolled back to commit `3c97346`.
- Harness migration bootstrap is complete.
- Latest Harness guidance treats `.harness/bootstrap.toml` as governance-only bootstrap metadata, while `harness:doc-health` is the audit standard for checking doc truth.
- Active project truth has been reset to the current codebase plus the Harness entry docs.
- Historical `.plan/*` documents remain available as background references, but they are no longer treated as active source of truth.

## Current Entry Commands
- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`
- `node apps/agent-runtime/dist/index.js "打开小红书，搜索咖啡豆推荐，打开帖子并点赞后截图"`

## Project Verification Notes
- `npm --prefix apps/agent-runtime run lint:docs` remains a project-local doc alignment check where needed, but it is not a latest-Harness requirement.
- `npm --prefix apps/agent-runtime run lint:arch`, `lint`, `test`, `typecheck`, `build`, and `hardgate` remain the current project verification commands.
- Current local refine e2e baseline is:
  - system Chrome binary
  - `~/.sasiki/chrome_profile`
  - `~/.sasiki/cookies/*.json`
  - proxy-disabled launch command with `NO_PROXY` / `no_proxy`
- Fresh focused verification for the new refine-react slice passed:
  - `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-contracts.test.ts test/replay-refinement/refine-react-tool-client.test.ts`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`

## Code-Backed Baseline
- CLI entrypoints live in `apps/agent-runtime/src/index.ts`:
  - `runtime` command with `run` / `observe`
  - `runtime --resume-run-id <run_id>` for paused refinement resume
  - `sop-compact` command
- CLI parsing now lives in `apps/agent-runtime/src/runtime/command-router.ts`, so `index.ts` is limited to config loading, lifecycle wiring, and top-level dispatch.
- Runtime assembly now lives in `apps/agent-runtime/src/runtime/runtime-composition-root.ts`:
  - `refinement.enabled=false -> RunExecutor`
  - `refinement.enabled=true -> ReactRefinementRunExecutor`
  - prompt selection goes through `apps/agent-runtime/src/runtime/providers/prompt-provider.ts`
  - tool-surface selection goes through `apps/agent-runtime/src/runtime/providers/tool-surface-provider.ts`
  - bootstrap/config normalization goes through `apps/agent-runtime/src/runtime/providers/runtime-bootstrap-provider.ts`
  - legacy run bootstrap goes through `apps/agent-runtime/src/runtime/providers/legacy-run-bootstrap-provider.ts`
  - refine run bootstrap goes through `apps/agent-runtime/src/runtime/providers/refine-run-bootstrap-provider.ts`
- The current shared browser execution kernel remains:
  - legacy run path: `AgentLoop -> McpToolBridge -> Playwright MCP`
  - refinement path: `AgentLoop -> RefineReactToolClient -> Playwright MCP`
- The disconnected stitched refinement subtree has been removed after zero-reference verification; the active refinement runtime is now the React refinement path only.
- The refine-react tool surface now includes `act.file_upload` with strict `paths` handling and focused tests.
- Current major code areas:
  - `observe`: `apps/agent-runtime/src/runtime/observe-runtime.ts`
  - `compact`: `apps/agent-runtime/src/runtime/interactive-sop-compact.ts`
  - `legacy run`: `apps/agent-runtime/src/runtime/run-executor.ts`
  - `react refinement`: `apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts`
  - `refine tool surface`: `apps/agent-runtime/src/runtime/replay-refinement/refine-react-tool-client.ts`
  - `attention knowledge persistence`: `apps/agent-runtime/src/runtime/replay-refinement/attention-knowledge-store.ts`

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
- Current code baseline now has the new file-upload slice plus green focused tests and core repo gates, but the latest fresh refinement e2e still failed before useful execution.
- The latest e2e used system Chrome with `.sasiki/chrome_profile` and cookies, and the first turn attempted `act.navigate` with invented `sourceObservationRef` values before any valid observation existed.
- System Chrome observation can begin on `about:blank` or extra blank / omnibox tabs, so first-turn bootstrap must explicitly handle that state.
- The next change must be a smaller focused slice around first-turn navigation bootstrap and invalid synthetic `sourceObservationRef` behavior before broader e2e stabilization continues.
- Keep `.harness/bootstrap.toml` aligned with governance metadata semantics if the bootstrap contract changes.
