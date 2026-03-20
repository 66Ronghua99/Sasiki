---
doc_type: plan
status: active
implements:
  - docs/superpowers/specs/2026-03-21-agent-runtime-layer-taxonomy-reorg.md
verified_by: []
supersedes:
  - docs/superpowers/plans/2026-03-21-runtime-surface-pruning-refactor-implementation.md
  - docs/superpowers/plans/2026-03-20-executor-bootstrap-boundary-refactor-implementation.md
related:
  - docs/superpowers/specs/2026-03-21-agent-runtime-layer-taxonomy-reorg.md
  - apps/agent-runtime/src/index.ts
  - apps/agent-runtime/src/core/agent-loop.ts
  - apps/agent-runtime/src/runtime/runtime-composition-root.ts
  - apps/agent-runtime/scripts/lint-architecture.mjs
---

# Agent Runtime Layer Taxonomy Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `apps/agent-runtime/src` around a stable global taxonomy (`domain / contracts / kernel / application / runtime / infrastructure / utils`), remove the current layer/flow mixing, and land the migration as small green slices with lint and test gates.

**Architecture:** This is a topology refactor, not an e2e stabilization effort. The implementation should first freeze docs and hard boundaries, then prune the legacy product surface, then relocate code by ownership: infrastructure adapters out of `core/` and `runtime/`, application shell and flow orchestration out of the generic `runtime/` root, and only then narrow the remaining `runtime/` to session/state semantics. Temporary re-export shims are allowed during the migration, but provider-pattern folders are not a valid end-state.

**Tech Stack:** TypeScript, Node 20, Node test runner, Playwright MCP integration, project-local architecture lint.

**Allowed Write Scope:** `apps/agent-runtime/src/**`, `apps/agent-runtime/scripts/lint-architecture.mjs`, `apps/agent-runtime/test/**`, `docs/superpowers/specs/**`, `docs/superpowers/plans/**`, `docs/project/**`, `docs/architecture/**`, `docs/testing/**`, `PROGRESS.md`, `NEXT_STEP.md`, `MEMORY.md`, `AGENTS.md`

**Verification Commands:**
- `npm --prefix apps/agent-runtime run lint:docs`
- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`

**Evidence Location:** `artifacts/code-gate/<timestamp>/report.json`

---

## Scope Freeze

- This plan keeps only the currently approved business flows:
  - `observe`
  - `sop-compact`
  - `refine`
- `sop-compact` is retained in this refactor series; its removal is not part of this plan.
- Legacy direct run and future `core agent` product flow are out of scope as active surfaces and should be retired from code/docs during the migration.
- CLI replacement contract for legacy run:
  - end-state CLI is explicit `observe`, `refine`, and `sop-compact`
  - legacy `runtime` / `--mode run|observe` may exist only as a temporary compatibility shim that fails with a clear upgrade message
- This plan does **not** require a fresh e2e run; it is a structure-and-boundary refactor plan.

## Execution Rules

- Every implementation task must finish in a green, mergeable state.
- Red-phase TDD is required inside each task, but the committed boundary for a task must be green.
- Each task should be executed by a fresh subagent, with focused tests plus repo gates before commit.
- Do not combine directory renames, layer moves, and behavior changes into one patch if they can be separated.

## File Map

Likely high-churn areas across this plan:

- `apps/agent-runtime/src/index.ts`
- `apps/agent-runtime/src/contracts/**`
- `apps/agent-runtime/src/core/**`
- `apps/agent-runtime/src/runtime/**`
- `apps/agent-runtime/src/infrastructure/**`
- `apps/agent-runtime/test/**`
- `apps/agent-runtime/scripts/lint-architecture.mjs`
- `docs/architecture/layers.md`
- `docs/testing/strategy.md`
- `docs/project/current-state.md`
- `PROGRESS.md`
- `NEXT_STEP.md`
- `MEMORY.md`

Planned target areas introduced during the migration:

- `apps/agent-runtime/src/kernel/**`
- `apps/agent-runtime/src/application/**`
- `apps/agent-runtime/src/runtime/**` (narrowed meaning only)
- `apps/agent-runtime/src/infrastructure/llm/**`
- `apps/agent-runtime/src/infrastructure/config/**`
- `apps/agent-runtime/src/infrastructure/persistence/**`
- optionally `apps/agent-runtime/src/utils/**`

## Architecture Lint And Test Acceptance

### Architecture Lint Acceptance

- [ ] Encode the new top-level taxonomy in `lint:arch` with explicit allowed roots and import directions.
- [ ] Prevent new long-term additions under `src/runtime/providers/`.
- [ ] Prevent LLM/config/persistence adapters from remaining under `src/core/` after their migration slices land.
- [ ] Prevent observe-owned SOP recorder/trace code from remaining under `src/core/` after the observe slice lands.
- [ ] Prevent refine-owned application code from remaining split between root `runtime/`, `runtime/providers/`, and `runtime/replay-refinement/` after the refine slice lands.
- [ ] Keep new files under default size budgets; do not add new legacy-size exceptions for migrated modules.

### Test Acceptance

- [ ] Add or update focused tests at each slice boundary before moving files.
- [ ] Keep CLI parsing tests green while grammar and directory ownership evolve.
- [ ] Keep composition-root and config-loading tests green during shell/config moves.
- [ ] Keep refine tool-client / bootstrap / executor tests green during refine subtree moves.
- [ ] Keep compact and observe behavior checks green during their ownership moves.
- [ ] Keep full repo `npm --prefix apps/agent-runtime run test` green throughout.
- [ ] No fresh e2e run is required for completion of this plan.

## Tasks

### Task 1: Freeze Active Truth And Acceptance Around The New Taxonomy

**Files:**
- Modify: `docs/superpowers/specs/2026-03-21-agent-runtime-layer-taxonomy-reorg.md`
- Create: `docs/superpowers/plans/2026-03-21-agent-runtime-layer-taxonomy-reorg-implementation.md`
- Modify: `docs/architecture/layers.md`
- Modify: `docs/testing/strategy.md`
- Modify: `docs/project/current-state.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

- [x] Update docs so the only active architectural direction is the global taxonomy spec plus this plan.
- [x] Resolve ownership ambiguities in the active spec before any code task starts:
  - config source loading is infrastructure-owned
  - persistence adapters are infrastructure-owned
  - observe/refine application slices own orchestration, not the persistence adapters beneath them
  - legacy CLI replacement contract is explicit and no longer ambiguous
- [x] Rewrite `docs/architecture/layers.md` to reflect `domain / contracts / kernel / application / runtime / infrastructure / utils`.
- [x] Update `docs/testing/strategy.md` with new taxonomy-oriented lint/test expectations.
- [x] Run `npm --prefix apps/agent-runtime run lint:docs` and `git diff --check`.
- [ ] Commit the green docs-and-acceptance freeze.

### Task 2: Prune The Legacy Product Surface Before Directory Reorganization

**Files:**
- Modify: `apps/agent-runtime/src/index.ts`
- Modify: `apps/agent-runtime/src/domain/agent-types.ts`
- Modify: `apps/agent-runtime/src/runtime/command-router.ts`
- Modify: `apps/agent-runtime/src/runtime/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/src/runtime/runtime-config.ts`
- Modify: `apps/agent-runtime/src/runtime/providers/runtime-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/src/runtime/providers/execution-context-provider.ts`
- Delete: `apps/agent-runtime/src/runtime/run-executor.ts`
- Delete: `apps/agent-runtime/src/runtime/providers/legacy-run-bootstrap-provider.ts`
- Delete: `apps/agent-runtime/src/runtime/sop-consumption-context.ts`
- Delete or rewrite: `apps/agent-runtime/test/runtime/legacy-run-bootstrap-provider.test.ts`
- Delete or rewrite: `apps/agent-runtime/test/runtime/run-executor-regression.test.ts`
- Modify: `apps/agent-runtime/test/runtime/command-router.test.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-bootstrap-provider.test.ts`

- [x] Write or update failing tests that express the reduced product surface:
  - explicit kept flows only
  - no live legacy direct-run branch
  - legacy `runtime` / `--mode run|observe` produces a clear compatibility error
  - no required legacy SOP-consumption config path
- [x] Implement the minimal code changes that remove legacy direct run as an active runtime surface.
- [x] Keep `observe`, `sop-compact`, and `refine` working while pruning the old branch.
- [x] Run focused runtime tests, then repo-wide `test`, `typecheck`, and `build`.
- [x] Commit the legacy-surface removal slice in a green state.

### Task 3: Extract LLM / Config / Persistence Adapters Into Infrastructure

**Files:**
- Move/rename: `apps/agent-runtime/src/core/model-resolver.ts`
- Move/rename: `apps/agent-runtime/src/core/json-model-client.ts`
- Move/rename: `apps/agent-runtime/src/runtime/providers/runtime-bootstrap-provider.ts`
- Move/rename: `apps/agent-runtime/src/runtime/artifacts-writer.ts`
- Move/rename: `apps/agent-runtime/src/runtime/sop-asset-store.ts`
- Move/rename: `apps/agent-runtime/src/runtime/replay-refinement/attention-knowledge-store.ts`
- Move/rename: `apps/agent-runtime/src/runtime/replay-refinement/refine-hitl-resume-store.ts`
- Modify: import sites and corresponding tests
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`

- [x] Move LLM helpers to `infrastructure/llm/`.
- [x] Move config source loading to `infrastructure/config/`, while keeping application-facing config contracts separate.
- [x] Move stores and artifact adapters to `infrastructure/persistence/`.
- [x] Use temporary re-export shims only where they reduce migration risk; do not leave permanent duplicates.
- [x] Run focused tests for model/config/persistence boundaries, then repo-wide `lint:arch`, `test`, `typecheck`, and `build`.
- [x] Commit the infrastructure-extraction slice.

### Task 4: Narrow Core Into Kernel

**Files:**
- Move/rename: `apps/agent-runtime/src/core/agent-loop.ts`
- Move/rename: `apps/agent-runtime/src/core/mcp-tool-bridge.ts`
- Move out: `apps/agent-runtime/src/core/sop-demonstration-recorder.ts`
- Move out: `apps/agent-runtime/src/core/sop-trace-builder.ts`
- Move out: `apps/agent-runtime/src/core/sop-trace-guide-builder.ts`
- Modify: imports across runtime/application code and tests
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`

- [x] Create the narrowed `kernel/` area and migrate only true execution-kernel code into it.
- [x] Move SOP recorder/trace builders out of current `core/`; do not keep non-kernel code in the renamed layer.
- [x] Update lint so `core/` is no longer treated as the long-term architectural root.
- [x] Run focused tests for `agent-loop` consumers plus repo-wide `lint:arch`, `test`, `typecheck`, and `build`.
- [x] Commit the kernel-narrowing slice.

### Task 5: Build The Application Layer Skeleton

**Files:**
- Move/rename: `apps/agent-runtime/src/index.ts`
- Move/rename: `apps/agent-runtime/src/runtime/command-router.ts`
- Move/rename: `apps/agent-runtime/src/runtime/workflow-runtime.ts`
- Move/rename: `apps/agent-runtime/src/runtime/runtime-composition-root.ts`
- Move/rename: `apps/agent-runtime/src/runtime/runtime-config.ts`
- Move/rename: `apps/agent-runtime/src/runtime/providers/tool-surface-provider.ts`
- Move/rename: `apps/agent-runtime/src/runtime/providers/execution-context-provider.ts`
- Modify: `apps/agent-runtime/test/runtime/command-router.test.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-bootstrap-provider.test.ts`
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`

- [x] Introduce `application/` with `shell/`, `providers-or-services/`, and config-facing ownership.
- [x] Move shell and composition code out of the generic `runtime/` root.
- [x] Keep provider abstractions only as internal application organization, not as a long-term top-level taxonomy claim.
- [x] Run focused shell/config/composition tests, then repo-wide `lint:arch`, `test`, `typecheck`, and `build`.
- [x] Commit the application-skeleton slice.

Task 5 completed in commits `e57d644` and `2ca3d8d`.

### Task 6: Rehome Observe And Compact By Ownership

**Files:**
- Move/rename: `apps/agent-runtime/src/runtime/observe-executor.ts`
- Move/rename: `apps/agent-runtime/src/runtime/observe-runtime.ts`
- Move/rename: `apps/agent-runtime/src/runtime/interactive-sop-compact.ts`
- Move/rename: `apps/agent-runtime/src/runtime/interactive-sop-compact-prompts.ts`
- Move/rename: `apps/agent-runtime/src/runtime/compact-session-machine.ts`
- Move/rename: `apps/agent-runtime/src/runtime/compact-turn-normalizer.ts`
- Move/rename: `apps/agent-runtime/src/runtime/sop-rule-compact-builder.ts`
- Modify: corresponding tests and imports
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`

- [x] Create explicit `application/observe/` ownership for observe orchestration and recording support.
- [x] Create explicit `application/compact/` ownership for SOP compact.
- [x] Keep compact retained as an active workflow; do not mix this task with compact removal.
- [x] Run focused observe/compact tests, then repo-wide `lint:arch`, `test`, `typecheck`, and `build`.
- [x] Commit the observe-and-compact ownership slice.

Task 6 completed in commits `541c653`, `bc22787`, `3b0614b`, and `84595d1`.

### Task 7: Rehome Refine Into One Application Subtree

**Files:**
- Move/rename: `apps/agent-runtime/src/runtime/replay-refinement/**`
- Move/rename: `apps/agent-runtime/src/runtime/providers/refine-run-bootstrap-provider.ts`
- Move/rename or split: `apps/agent-runtime/src/runtime/providers/prompt-provider.ts`
- Modify: refine imports and refine tests
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`

- [ ] Replace `replay-refinement` with a refine-owned application subtree.
- [ ] Move refine bootstrap, prompts, tooling, orchestration, and persistence-facing callers under one refine application area.
- [ ] Keep refine runtime state separate from refine application orchestration where needed.
- [ ] Run focused refine tests:
  - `test/replay-refinement/refine-react-contracts.test.ts`
  - `test/replay-refinement/refine-react-tool-client.test.ts`
  - `test/replay-refinement/refine-react-run-executor.test.ts`
  - `test/runtime/refine-run-bootstrap-provider.test.ts`
- [ ] Then run repo-wide `lint:arch`, `test`, `typecheck`, and `build`.
- [ ] Commit the refine-ownership slice.

### Task 8: Narrow Runtime To Session / State / Execution Semantics

**Files:**
- Modify or move: live-session/state files that remain under the old runtime bucket
- Modify: `apps/agent-runtime/src/runtime/agent-execution-runtime.ts`
- Delete if unused: `apps/agent-runtime/src/runtime/agent-runtime.ts`
- Modify: lifecycle-focused tests
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`

- [ ] Decide which remaining files are true runtime state and which are still application shell wrappers.
- [ ] Collapse or delete thin pass-through wrappers that no longer justify their existence.
- [ ] Ensure the surviving `runtime/` area means live execution state only.
- [ ] Run focused lifecycle tests, then repo-wide `lint:arch`, `test`, `typecheck`, and `build`.
- [ ] Commit the runtime-narrowing slice.

### Task 9: Final Docs, Lint Hardening, And Gate Closure

**Files:**
- Modify: `docs/architecture/layers.md`
- Modify: `docs/testing/strategy.md`
- Modify: `docs/project/current-state.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`
- Modify/archive: superseded specs and plans
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`

- [ ] Remove stale references to old directory semantics (`core`, catch-all `runtime`, top-level `providers`) from project docs.
- [ ] Finalize lint boundaries so the new taxonomy is enforceable and regressions are blocked.
- [ ] Run:
  - `npm --prefix apps/agent-runtime run lint:docs`
  - `npm --prefix apps/agent-runtime run lint:arch`
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run test`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
  - `npm --prefix apps/agent-runtime run hardgate`
- [ ] Record the final report path under `verified_by`.
- [ ] Commit the closure slice.

## Sequencing Notes

- Recommended order is Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5 -> Task 6 -> Task 7 -> Task 8 -> Task 9.
- Keep docs/pointer sync first so subagents do not execute against stale active truth. This intentionally comes before code pruning, even though the spec's migration principles talk about pruning early.
- Keep legacy product-surface removal separate from directory-wide file moves.
- Keep infrastructure extraction separate from `core -> kernel` narrowing.
- Keep application regrouping separate from runtime narrowing.
- Preserve behavior with temporary compatibility re-exports when useful, but delete them once the destination layer is stable.

## Completion Checklist

- [ ] active architecture truth is the global taxonomy, not the old runtime-only layout
- [ ] legacy direct run is removed as an active product surface
- [ ] `core/` is narrowed or replaced by `kernel/`
- [ ] `runtime/` no longer acts as a catch-all application layer
- [ ] provider-pattern files are owned by application/config/flow areas, not by a fake top-level `providers` layer
- [ ] LLM/config/persistence adapters live under infrastructure-owned areas
- [ ] repo-wide verification passes with fresh evidence
