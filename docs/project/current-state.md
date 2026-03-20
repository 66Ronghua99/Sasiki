# Current State

## Restart Status
- Repository baseline has been rolled back to commit `3c97346`.
- Harness migration bootstrap is complete.
- Latest Harness guidance treats `.harness/bootstrap.toml` as governance-only bootstrap metadata, while `harness:doc-health` is the audit standard for checking doc truth.
- Active project truth has been reset to the current codebase plus the Harness entry docs.
- The current active engineering loop is the global layer-taxonomy redesign for `apps/agent-runtime/src`; earlier executor/bootstrap and runtime-surface refactors are now background context.
- Task 5 is complete: the application shell, config, and provider areas now have canonical homes under `apps/agent-runtime/src/application/`, while the old `runtime/*` shell/config/provider paths remain thin shims where applicable.
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
- Fresh refinement flow validation also exists for the current refactor baseline:
  - run id `20260320_231626_543`
  - system Chrome startup, cookie injection, CDP ready, model resolution, and `agent_loop_initialized` were all observed
  - this is the current process-level acceptance signal for the refactor; business-level task completion remains a later stabilization concern
- Fresh provenance-stability validation also exists for the current local route:
  - repo gates passed again with report `artifacts/code-gate/2026-03-20T15-43-32-639Z/report.json`
  - run id `20260320_234009_829` confirmed first-turn bootstrap no longer starts with synthetic symbolic refs, but still exposed one later invented observation ref after navigation
  - run id `20260320_234350_187` no longer shows `unknown sourceObservationRef` or `tab mismatch`; current failure is a real page interaction timeout on `写长文`

## Code-Backed Baseline
- CLI entrypoints live in `apps/agent-runtime/src/index.ts`:
  - `observe`
  - `refine`
  - `sop-compact`
  - legacy `runtime` / `--mode run|observe` only survives as a compatibility error with upgrade guidance
- CLI parsing lives in `apps/agent-runtime/src/runtime/command-router.ts`, so `index.ts` is limited to config loading, lifecycle wiring, and top-level dispatch.
- Runtime assembly lives in `apps/agent-runtime/src/runtime/runtime-composition-root.ts`:
  - active agent runtime surface is now always `ReactRefinementRunExecutor`
  - tool-surface selection is now always `refine-react`
  - application shell ownership for command routing, composition, and config selection is now canonical under `apps/agent-runtime/src/application/`
  - prompt selection goes through `apps/agent-runtime/src/runtime/providers/prompt-provider.ts`
  - tool-surface selection goes through `apps/agent-runtime/src/runtime/providers/tool-surface-provider.ts`
  - bootstrap/config normalization goes through `apps/agent-runtime/src/infrastructure/config/runtime-bootstrap-provider.ts`
  - refine run bootstrap goes through `apps/agent-runtime/src/runtime/providers/refine-run-bootstrap-provider.ts`
- The current shared browser execution kernel now has canonical ownership under `apps/agent-runtime/src/kernel/`:
  - `AgentLoop`
  - `McpToolBridge`
- LLM adapters now have canonical ownership under `apps/agent-runtime/src/infrastructure/llm/`:
  - `ModelResolver`
  - `JsonModelClient`
- SOP observe helpers now have canonical ownership under `apps/agent-runtime/src/runtime/observe-support/`:
  - `SopDemonstrationRecorder`
  - `SopTraceBuilder`
  - `SopTraceGuideBuilder`
- Persistence adapters now have canonical ownership under `apps/agent-runtime/src/infrastructure/persistence/`:
  - `ArtifactsWriter`
  - `SopAssetStore`
  - `AttentionKnowledgeStore`
  - `RefineHitlResumeStore`
- The disconnected stitched refinement subtree has been removed after zero-reference verification, and Task 2 also removed the old direct-run path:
  - deleted `apps/agent-runtime/src/runtime/run-executor.ts`
  - deleted `apps/agent-runtime/src/runtime/providers/legacy-run-bootstrap-provider.ts`
  - deleted `apps/agent-runtime/src/runtime/sop-consumption-context.ts`
- The refine-react tool surface now includes `act.file_upload` with strict `paths` handling and focused tests.
- Current major code areas:
  - `kernel`: `apps/agent-runtime/src/kernel/agent-loop.ts`
  - `observe`: `apps/agent-runtime/src/runtime/observe-runtime.ts`
  - `compact`: `apps/agent-runtime/src/runtime/interactive-sop-compact.ts`
  - `react refinement`: `apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts`
  - `refine tool surface`: `apps/agent-runtime/src/runtime/replay-refinement/refine-react-tool-client.ts`
  - `attention knowledge persistence`: `apps/agent-runtime/src/infrastructure/persistence/attention-knowledge-store.ts`
  - `observe support`: `apps/agent-runtime/src/runtime/observe-support/sop-demonstration-recorder.ts`

## Current Documentation Truth
- Active entry docs:
  - `PROGRESS.md`
  - `NEXT_STEP.md`
  - `MEMORY.md`
  - `AGENT_INDEX.md`
  - `.harness/bootstrap.toml`
  - `docs/architecture/overview.md`
- Active spec / plan:
  - `docs/superpowers/specs/2026-03-21-agent-runtime-layer-taxonomy-reorg.md`
  - `docs/superpowers/plans/2026-03-21-agent-runtime-layer-taxonomy-reorg-implementation.md`
- Historical background docs:
  - `.plan/20260310_interactive_reasoning_sop_compact.md`
  - `.plan/20260312_replay_refinement_requirement_v0.md`
  - `.plan/20260312_replay_refinement_online_design.md`
  - `.plan/20260313_execution_kernel_refine_core_rollout.md`
  - `docs/superpowers/specs/2026-03-20-harness-doc-truth-sync.md`
  - `docs/superpowers/plans/2026-03-20-harness-doc-truth-sync-implementation.md`

## Follow-Up
- The next repository-level task is Task 6 of the active taxonomy plan.
- The next task is to rehome observe and compact by ownership while keeping compact active.
- The key architectural question is now “which observe/compact runtime-root files should move into application-owned flow areas, and which should remain runtime state/execution.”
- Keep `.harness/bootstrap.toml` aligned with governance metadata semantics if the bootstrap contract changes.
