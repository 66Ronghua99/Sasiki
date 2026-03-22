# Current State

## Restart Status
- Repository baseline has been rolled back to commit `3c97346`.
- Harness migration bootstrap is complete.
- Latest Harness guidance treats `.harness/bootstrap.toml` as governance-only bootstrap metadata, while `harness:doc-health` is the audit standard for checking doc truth.
- Active project truth has been reset to the current codebase plus the Harness entry docs.
- The workflow-host boundary clarification pass is now the active front-door truth for the current baseline.
- **Runtime telemetry event stream pass is complete in the current branch baseline**: telemetry policy now resolves from canonical config, shell composition injects run-scoped telemetry up front, refine writes canonical `event_stream.jsonl` plus a run summary artifact and `agent_checkpoints/`, and observe / compact no longer maintain separate runtime-log style write paths.
- Fresh hardgate evidence for this pass: `artifacts/code-gate/2026-03-21T14-38-44-019Z/report.json`.
- **Refine tool surface unification Tasks 1-8 are complete**: Task 1 froze the current bridge/bootstrap/facade regression behavior, Task 2 introduced refine-owned `tools/` core abstractions, Task 3 added provider/hook/lifecycle scaffolding, Task 4 migrated the runtime-facing refine tools into first-class definitions registered through a production-side runtime registry seam, Task 5 migrated the core browser-facing refine tools into first-class definitions registered through a production-side browser registry seam, Task 6 migrated screenshot/file-upload into first-class browser definitions while preserving capability negotiation behavior, Task 7 rebuilt `RefineReactToolClient` into a compatibility facade over explicit refine tool composition and removed the old adapter-centric registry path, and Task 8 completed refine-focused verification plus full project gates. Fresh hardgate evidence for this pass: `artifacts/code-gate/2026-03-22T14-24-10-690Z/report.json`.
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
  kernel/           - Reusable execution kernel (CANONICAL)
    - agent-loop.ts
    - mcp-tool-bridge.ts
  application/      - Use-case orchestration layer
    shell/          - CLI shell, command-router, runtime-host, composition-root
    config/         - Application-facing config loader entry
    observe/        - Observe orchestration + recording support
    compact/        - SOP compact workflow
    refine/         - Refine bootstrap, prompts, tooling, orchestration, executor
  infrastructure/   - External adapters
    llm/            - model-resolver.ts, json-model-client.ts
    config/         - runtime-bootstrap-provider.ts
    persistence/    - artifacts-writer, runtime-event-stream-writer, agent-checkpoint-writer, sop-asset-store, attention-knowledge-store, refine-hitl-resume-store
    logging/        - runtime-logger, terminal-telemetry-sink
    mcp/            - mcp-stdio-client.ts
    browser/        - cdp-browser-launcher.ts, cookie-loader.ts
    hitl/           - terminal-hitl-controller.ts
  utils/            - Pure helper functions

```

## Project Verification Notes
- `npm --prefix apps/agent-runtime run lint:docs` remains a project-local doc alignment check where needed, but it is not a latest-Harness requirement.
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
- Active spec / plan:
  - `docs/superpowers/specs/2026-03-22-refine-tool-surface-unification-design.md`
  - `docs/superpowers/plans/2026-03-22-refine-tool-surface-unification-implementation.md`
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
- The workflow-host boundary clarification pass is now the current baseline.
- The active next step is to run one fresh real-browser refine smoke e2e against the new tool-surface facade and inspect hook/context telemetry artifacts for any remaining runtime drift.
- See `NEXT_STEP.md` for the exact current task pointer.
