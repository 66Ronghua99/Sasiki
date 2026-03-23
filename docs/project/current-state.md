# Current State

## Restart Status
- Repository baseline has been rolled back to commit `3c97346`.
- Harness migration bootstrap is complete.
- Latest Harness guidance treats `.harness/bootstrap.toml` as governance-only bootstrap metadata, while `harness:doc-health` is the audit standard for checking doc truth.
- Active project truth has been reset to the current codebase plus the Harness entry docs.
- **Active governance slice (2026-03-23) is Phase 1 of the OpenAI-style layer-model program**: this is a docs-and-hardgate pass that freezes a narrower end-state `src/` model, adds an explicit exception-ledger story for current mismatches, and aligns front-door docs before any larger refactor is attempted.
- **What Phase 1 changes**: `lint:arch` is being tightened around approved top-level roots, blanket bans for new `src/runtime/*` and `src/core/*`, workflow horizontal isolation, non-shell `application/* -> infrastructure/*` imports unless they are on the explicit Phase 1 ledger, and refine-tools role edges. `lint:docs` is part of the verification set for this governance slice.
- **What Phase 1 does not promise**: `kernel/` is still transitional, current non-shell assembly seams are still present as named exceptions, `application/refine/tools/runtime/*` keeps its transitional role for now, and neither the `contracts/` rename nor the full shell-centralization refactor is part of this phase.
- The current front-door truth is the post-pi-agent-hook-adapter baseline, with workflow-host clarification and telemetry/event-stream changes already absorbed.
- **Runtime telemetry event stream pass is complete in the current branch baseline**: telemetry policy now resolves from canonical config, shell composition injects run-scoped telemetry up front, refine writes canonical `event_stream.jsonl` plus a run summary artifact and `agent_checkpoints/`, and observe / compact no longer maintain separate runtime-log style write paths.
- Fresh hardgate evidence for this pass: `artifacts/code-gate/2026-03-21T14-38-44-019Z/report.json`.
- **Refine tool surface unification Tasks 1-8 are complete**: Task 1 froze the current bridge/bootstrap/facade regression behavior, Task 2 introduced refine-owned `tools/` core abstractions, Task 3 added provider/hook/lifecycle scaffolding, Task 4 migrated the runtime-facing refine tools into first-class definitions registered through a production-side runtime registry seam, Task 5 migrated the core browser-facing refine tools into first-class definitions registered through a production-side browser registry seam, Task 6 migrated screenshot/file-upload into first-class browser definitions while preserving capability negotiation behavior, Task 7 rebuilt `RefineReactToolClient` into a compatibility facade over explicit refine tool composition and removed the old adapter-centric registry path, and Task 8 completed refine-focused verification plus full project gates. Fresh hardgate evidence for this pass: `artifacts/code-gate/2026-03-22T14-24-10-690Z/report.json`.
- **Pi-agent hook adapter refactor Tasks 1-6 are complete**: canonical kernel entrypoints are now `pi-agent-loop.ts` and `pi-agent-tool-adapter.ts`; tool hooks run only through exact `toolName` registrations on the pi-agent execution path; direct `RefineToolSurface` / `RefineReactToolClient` / bootstrap calls are hook-free; legacy `agent-loop.ts` / `mcp-tool-bridge.ts` / `refine-tool-hook-observer.ts` seam has been removed. Fresh hardgate evidence for this pass: `artifacts/code-gate/2026-03-23T01-06-37-424Z/report.json`.
- **Workflow Host Task 5 is complete**: `runtime/agent-execution-runtime.ts` has been removed, `application/shell/runtime-host.ts` is the only top-level lifecycle owner, and compact service construction now happens in `runtime-composition-root.ts` instead of `workflow-runtime.ts`.
- **Cleanup Task 2 remains complete**: compatibility-only source shells under `src/core/**` and `src/runtime/**` have been deleted, and the final runtime wrapper has now been removed as well.
- **Cleanup Task 3 is complete**: legacy CLI compatibility behavior has been removed; only explicit `observe`, `refine`, and `sop-compact` commands remain, and unsupported grammar now fails without migration-era upgrade messaging.
- **Cleanup Task 4 is complete**: migration docs are archived, `docs/architecture/overview.md` is now the single short architecture front door, and `apps/agent-runtime/README.md` documents only the surviving CLI surface.
- **Cleanup Task 5 is complete**: the earlier post-cleanup gate set passed, and the workflow-host clarification pass now has fresh hardgate evidence at `artifacts/code-gate/2026-03-21T06-29-23-232Z/report.json`.
- **Task 9 is complete**: Final documentation cleanup, lint hardening, and gate closure done. The global layer-taxonomy reorganization plan is fully closed.
- **Task 8 is superseded by the current front door**: the remaining runtime lifecycle wrapper has been deleted, so top-level workflow lifecycle now lives in `application/shell/runtime-host.ts`.
- **Task 7 is complete**: refine bootstrap, prompts, tooling, orchestration, and executor ownership now live under `apps/agent-runtime/src/application/refine/`; the old runtime-era refine paths are no longer part of the active front door.
- **Task 6 is complete**: observe orchestration / recording support now live under `apps/agent-runtime/src/application/observe/`, and SOP compact now lives under `apps/agent-runtime/src/application/compact/`; old runtime-era paths are no longer part of the active front door.
- **Task 5 is complete**: the application shell and config areas now have canonical homes under `apps/agent-runtime/src/application/`; the old runtime-era shell/config/provider paths are no longer active architecture truth.
- **Task 4 is complete**: `kernel/` is now the canonical home for the true execution kernel; `core/` is shim-only.
- **Task 3 is complete**: LLM adapters (`infrastructure/llm/`), config loading (`infrastructure/config/`), and persistence adapters (`infrastructure/persistence/`) are now in their canonical infrastructure homes.
- **Task 2 is complete**: legacy direct run has been removed as an active product surface; CLI contract is now `observe` / `refine` / `sop-compact`.
- Historical `.plan/*` documents remain available as background references, but they are no longer treated as active source of truth.

## Current Entry Commands
- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`
- `node apps/agent-runtime/dist/index.js observe "打开小红书，搜索咖啡豆推荐，打开帖子并点赞后截图"`
- `node apps/agent-runtime/dist/index.js refine "打开小红书创作服务平台，创建一条长文笔记草稿（不要发布），填写任意标题后点击暂存离开；正文可留空。"`

## Canonical Architecture

```
apps/agent-runtime/src/
  domain/           - Product concepts, state schemas, cross-layer contracts
  contracts/        - Capability interfaces plus shared runtime config / telemetry contracts
  kernel/           - Reusable execution kernel candidate (TRANSITIONAL in Phase 1)
    - pi-agent-loop.ts
    - pi-agent-tool-adapter.ts
  application/      - Use-case orchestration layer
    shell/          - CLI shell, command-router, runtime-host, top-level composition owner
    config/         - Application-facing config semantics plus current bootstrap bridge seam
    observe/        - Observe orchestration + recording support, with current recorder/persistence exceptions
    compact/        - SOP compact workflow, with current model/HITL/artifact exceptions
    refine/         - Refine bootstrap, prompts, tooling, orchestration, executor, with current persistence/loop exceptions
  infrastructure/   - External adapters
    llm/            - model-resolver.ts, json-model-client.ts
    config/         - runtime-bootstrap-provider.ts
    persistence/    - artifacts-writer, runtime-event-stream-writer, agent-checkpoint-writer, sop-asset-store, attention-knowledge-store, refine-hitl-resume-store
    logging/        - runtime-logger, terminal-telemetry-sink
    mcp/            - mcp-stdio-client.ts
    browser/        - cdp-browser-launcher.ts, cookie-loader.ts
    hitl/           - terminal-hitl-controller.ts
```

## Project Verification Notes
- `npm --prefix apps/agent-runtime run lint:docs` is required for the active Phase 1 governance/doc-sync slice.
- `npm --prefix apps/agent-runtime run lint:arch`, `lint`, `test`, `typecheck`, `build`, and `hardgate` remain the current project verification commands.
- Current local refine e2e baseline is:
  - system Chrome binary
  - `~/.sasiki/chrome_profile`
  - `~/.sasiki/cookies/*.json`
  - proxy-disabled launch command with `NO_PROXY` / `no_proxy`

## Current Documentation Truth
- Active entry docs:
  - `PROGRESS.md`
  - `NEXT_STEP.md`
  - `MEMORY.md`
  - `AGENT_INDEX.md`
  - `.harness/bootstrap.toml`
  - `docs/project/current-state.md`
  - `docs/architecture/overview.md`
- Active execution pointer:
  - `NEXT_STEP.md`
- Active governance spec / plan for the current worktree slice:
  - `docs/superpowers/specs/2026-03-23-agent-runtime-openai-style-layer-model-design.md`
  - `docs/superpowers/plans/2026-03-23-agent-runtime-openai-style-layer-model-phase-1-implementation.md`
- Latest completed implementation chain before this governance slice:
  - `docs/superpowers/specs/2026-03-22-pi-agent-hook-adapter-refactor-design.md`
  - `docs/superpowers/plans/2026-03-22-pi-agent-hook-adapter-refactor-implementation.md`
- Historical background docs:
  - `.plan/20260310_interactive_reasoning_sop_compact.md`
  - `.plan/20260312_replay_refinement_requirement_v0.md`
  - `.plan/20260312_replay_refinement_online_design.md`
  - `.plan/20260313_execution_kernel_refine_core_rollout.md`
  - `docs/superpowers/specs/2026-03-20-harness-doc-truth-sync.md`
  - `docs/superpowers/plans/2026-03-20-harness-doc-truth-sync-implementation.md`
  - `docs/superpowers/specs/2026-03-21-agent-runtime-layer-taxonomy-reorg.md`
  - `docs/superpowers/plans/2026-03-21-agent-runtime-layer-taxonomy-reorg-implementation.md`
  - `docs/superpowers/specs/2026-03-21-runtime-telemetry-event-stream-design.md`
  - `docs/superpowers/plans/2026-03-21-runtime-telemetry-event-stream-implementation.md`
  - `docs/superpowers/specs/2026-03-21-workflow-host-boundary-clarification.md`
  - `docs/superpowers/plans/2026-03-21-workflow-host-boundary-clarification-implementation.md`
  - `docs/superpowers/specs/2026-03-21-backward-capability-cleanup-design.md`
  - `docs/superpowers/plans/2026-03-21-backward-capability-cleanup-implementation.md`
  - `docs/architecture/layers.md`

## Follow-Up
- The taxonomy reorganization plan is complete and now serves as migration background.
- The current baseline is the post-pi-agent-hook-adapter front door.
- The active repo-wide product next step remains a fresh real-browser refine smoke e2e against the new pi-agent hook boundary and telemetry artifacts.
- The active governance next step in this worktree is to finish Phase 1 hardgate encoding after the docs/ledger truth is frozen.
- See `NEXT_STEP.md` for the exact current task pointer.
