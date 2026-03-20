# Current State

## Restart Status
- Repository baseline has been rolled back to commit `3c97346`.
- Harness migration bootstrap is complete.
- Latest Harness guidance treats `.harness/bootstrap.toml` as governance-only bootstrap metadata, while `harness:doc-health` is the audit standard for checking doc truth.
- Active project truth has been reset to the current codebase plus the Harness entry docs.
- **Task 9 is complete**: Final documentation cleanup, lint hardening, and gate closure done. The global layer-taxonomy reorganization plan is fully closed.
- **Task 8 is complete**: `runtime/` has been narrowed to session/state/execution semantics; `runtime/agent-execution-runtime.ts` is the remaining real runtime implementation.
- **Task 7 is complete**: refine bootstrap, prompts, tooling, orchestration, and executor ownership now live under `apps/agent-runtime/src/application/refine/`; the old `runtime/replay-refinement/*` and moved provider paths are shim-only compatibility paths.
- **Task 6 is complete**: observe orchestration / recording support now live under `apps/agent-runtime/src/application/observe/`, and SOP compact now lives under `apps/agent-runtime/src/application/compact/`; old `runtime/*` paths remain thin shims where applicable.
- **Task 5 is complete**: the application shell, config, and provider areas now have canonical homes under `apps/agent-runtime/src/application/`, while the old `runtime/*` shell/config/provider paths remain thin shims where applicable.
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
- `node apps/agent-runtime/dist/index.js "打开小红书，搜索咖啡豆推荐，打开帖子并点赞后截图"`

## Canonical Architecture

```
apps/agent-runtime/src/
  domain/           - Product concepts, state schemas, cross-layer contracts
  contracts/        - Capability interfaces (logger, tool-client, HITL, etc.)
  kernel/           - Reusable execution kernel (CANONICAL)
    - agent-loop.ts
    - mcp-tool-bridge.ts
  application/      - Use-case orchestration layer
    shell/          - CLI shell, command-router, composition-root
    config/         - Application-facing config contracts
    providers/      - Tool-surface, execution-context providers
    observe/        - Observe orchestration + recording support
    compact/        - SOP compact workflow
    refine/         - Refine bootstrap, prompts, tooling, orchestration, executor
  runtime/          - Narrowed to live execution/session/state semantics
    - agent-execution-runtime.ts  - Remaining real runtime implementation
    # Other runtime/* files are migration shims
  infrastructure/   - External adapters
    llm/            - model-resolver.ts, json-model-client.ts
    config/         - runtime-bootstrap-provider.ts
    persistence/    - artifacts-writer, sop-asset-store, attention-knowledge-store, refine-hitl-resume-store
    mcp/            - mcp-stdio-client.ts
    browser/        - cdp-browser-launcher.ts, cookie-loader.ts
    hitl/           - terminal-hitl-controller.ts
  utils/            - Pure helper functions

# Migration shims (re-export only):
- core/* → kernel/*
- runtime/providers/* → application/providers/* or application/refine/*
- runtime/replay-refinement/* → application/refine/*
- runtime/observe-executor.ts, runtime/observe-runtime.ts → application/observe/*
- runtime/interactive-sop-compact.ts → application/compact/*
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
  - `docs/architecture/layers.md`
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
- The taxonomy reorganization plan (Tasks 1-9) is **complete**.
- The next phase moves to a **separate stability / e2e / tooling optimization track** (not more taxonomy refactoring).
- See `NEXT_STEP.md` for the post-plan next actions.
