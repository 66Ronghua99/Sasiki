---
doc_type: plan
status: superseded
implements:
  - docs/superpowers/specs/2026-03-21-runtime-surface-pruning-refactor.md
verified_by: []
supersedes:
  - docs/superpowers/plans/2026-03-20-executor-bootstrap-boundary-refactor-implementation.md
related:
  - docs/superpowers/specs/2026-03-21-runtime-surface-pruning-refactor.md
  - apps/agent-runtime/src/index.ts
  - apps/agent-runtime/src/runtime/command-router.ts
  - apps/agent-runtime/src/runtime/runtime-composition-root.ts
  - apps/agent-runtime/src/runtime/runtime-config.ts
  - apps/agent-runtime/scripts/lint-architecture.mjs
---

# Runtime Surface Pruning And Layout Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the runtime to `observe`, `sop-compact`, and `refine`, remove legacy direct-run/core-flow clutter, reorganize files by flow, and lock the new structure with lint plus tests.

**Architecture:** Treat this as product-surface pruning first, folder/layout cleanup second. Remove the legacy direct-run branch and its config/docs first, then move surviving code into explicit flow-oriented folders so the runtime shell, observe flow, compact flow, and refine flow are easy to locate and maintain.

**Tech Stack:** TypeScript, Node 20, existing `AgentLoop`, Playwright MCP, project-local architecture lint, Node test runner.

**Allowed Write Scope:** `apps/agent-runtime/src/**`, `apps/agent-runtime/scripts/lint-architecture.mjs`, `apps/agent-runtime/test/**`, `docs/superpowers/specs/**`, `docs/superpowers/plans/**`, `docs/project/**`, `docs/architecture/**`, `docs/testing/**`, `PROGRESS.md`, `NEXT_STEP.md`, `MEMORY.md`, `AGENTS.md`

**Verification Commands:**
- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`

**Evidence Location:** `artifacts/code-gate/<timestamp>/report.json`

---

## Execution Notes

- This slice intentionally pauses e2e-focused stabilization work.
- Existing uncommitted prompt/bootstrap stabilization changes are treated as baseline context, not as the goal of this refactor.
- Each coding task should land as a small slice with tests and a commit before moving on.

## File Map

Expected high-churn files for this slice:

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
- Delete by end-state: `apps/agent-runtime/src/runtime/providers/**`
- Delete or modify: `apps/agent-runtime/src/domain/sop-consumption.ts`
- Move/rename: `apps/agent-runtime/src/runtime/replay-refinement/**`
- Move/rename: `apps/agent-runtime/src/runtime/observe-runtime.ts`
- Move/rename: `apps/agent-runtime/src/runtime/observe-executor.ts`
- Move/rename: `apps/agent-runtime/src/runtime/interactive-sop-compact.ts`
- Move/rename: `apps/agent-runtime/src/runtime/interactive-sop-compact-prompts.ts`
- Move/rename: `apps/agent-runtime/src/runtime/compact-session-machine.ts`
- Move/rename: `apps/agent-runtime/src/runtime/compact-turn-normalizer.ts`
- Move/rename: `apps/agent-runtime/src/runtime/sop-rule-compact-builder.ts`
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`
- Modify: `apps/agent-runtime/test/runtime/command-router.test.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-bootstrap-provider.test.ts`
- Delete or archive tests for removed legacy run files
- Modify: `docs/project/current-state.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/architecture/layers.md`
- Modify: `docs/testing/strategy.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

## Architecture Lint And Test Acceptance

### Architecture Lint Acceptance

- [ ] Extend `apps/agent-runtime/scripts/lint-architecture.mjs` so removed legacy files cannot be re-imported.
- [ ] Add path-boundary rules so the old `runtime/replay-refinement/` path is no longer a legal home after cutover.
- [ ] Keep new flow directories under default size budgets and do not add new legacy-size exceptions.
- [ ] Keep infrastructure assembly inside runtime shell/composition files only.

### Test Acceptance

- [ ] Add failing CLI tests first for explicit `observe` / `refine` / `sop-compact` commands.
- [ ] Add failing composition/bootstrap tests first for the removed legacy branch.
- [ ] Keep refine regression tests green while removing legacy run.
- [ ] Keep full repo `npm --prefix apps/agent-runtime run test` green.
- [ ] No e2e command is required for this slice.

## Tasks

### Task 1: Freeze The New Runtime Surface In Tests And Docs

**Files:**
- Modify: `docs/superpowers/specs/2026-03-21-runtime-surface-pruning-refactor.md`
- Modify: `docs/superpowers/plans/2026-03-21-runtime-surface-pruning-refactor-implementation.md`
- Modify: `apps/agent-runtime/test/runtime/command-router.test.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-bootstrap-provider.test.ts`

- [ ] Write failing tests that express the new product surface:
  - CLI accepts `observe`, `refine`, and `sop-compact`
  - CLI rejects legacy `runtime` command and `--mode run`
  - composition root no longer expects a legacy executor branch
  - runtime bootstrap no longer exposes legacy direct-run toggles as required active config
- [ ] Run the focused red-phase tests and confirm they fail for the expected reasons.
- [ ] Commit the test-and-doc freeze once the failure shape is explicit.

### Task 2: Cut CLI Grammar Over To Explicit Flow Commands

**Files:**
- Modify: `apps/agent-runtime/src/index.ts`
- Modify: `apps/agent-runtime/src/domain/agent-types.ts`
- Modify: `apps/agent-runtime/src/runtime/command-router.ts`
- Modify: `apps/agent-runtime/test/runtime/command-router.test.ts`

- [ ] Implement explicit `observe`, `refine`, and `sop-compact` command parsing.
- [ ] Remove generic `runtime --mode run|observe` parsing from the active path.
- [ ] Keep paused refine resume support through the explicit `refine` command.
- [ ] Re-run `npm --prefix apps/agent-runtime run test -- test/runtime/command-router.test.ts`.
- [ ] Commit the CLI surface cutover.

### Task 3: Remove Legacy Direct Run And SOP Consumption

**Files:**
- Modify: `apps/agent-runtime/src/runtime/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/src/runtime/runtime-config.ts`
- Modify: `apps/agent-runtime/src/runtime/providers/runtime-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/src/runtime/providers/execution-context-provider.ts`
- Delete: `apps/agent-runtime/src/runtime/run-executor.ts`
- Delete: `apps/agent-runtime/src/runtime/providers/legacy-run-bootstrap-provider.ts`
- Delete: `apps/agent-runtime/src/runtime/sop-consumption-context.ts`
- Delete or modify: `apps/agent-runtime/src/domain/sop-consumption.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-bootstrap-provider.test.ts`
- Delete or rewrite: `apps/agent-runtime/test/runtime/legacy-run-bootstrap-provider.test.ts`
- Delete or rewrite: `apps/agent-runtime/test/runtime/run-executor-regression.test.ts`

- [ ] Implement the minimal code changes that make refine the only live run path.
- [ ] Remove legacy direct-run config and SOP-consumption bootstrap state that no longer has an active owner.
- [ ] Preserve observe and compact behavior while simplifying runtime shell wiring.
- [ ] Re-run focused runtime tests, then `npm --prefix apps/agent-runtime run test`.
- [ ] Commit the legacy-removal slice.

### Task 4: Reorganize Runtime Files By Flow

**Files:**
- Move/rename: `apps/agent-runtime/src/runtime/observe-runtime.ts`
- Move/rename: `apps/agent-runtime/src/runtime/observe-executor.ts`
- Move/rename: `apps/agent-runtime/src/runtime/interactive-sop-compact.ts`
- Move/rename: `apps/agent-runtime/src/runtime/interactive-sop-compact-prompts.ts`
- Move/rename: `apps/agent-runtime/src/runtime/compact-session-machine.ts`
- Move/rename: `apps/agent-runtime/src/runtime/compact-turn-normalizer.ts`
- Move/rename: `apps/agent-runtime/src/runtime/sop-rule-compact-builder.ts`
- Move/rename: `apps/agent-runtime/src/runtime/replay-refinement/**`
- Modify: `apps/agent-runtime/src/runtime/workflow-runtime.ts`
- Modify: `apps/agent-runtime/src/runtime/agent-execution-runtime.ts`
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`
- Modify: corresponding tests under `apps/agent-runtime/test/**`

- [ ] Move surviving files into explicit flow/shell directories.
- [ ] Replace `replay-refinement` naming with `refine` naming on active code paths.
- [ ] Move provider-owned code into either `runtime/config/` or the owning flow, then delete `runtime/providers/`.
- [ ] Keep imports and tests green after each move; do not batch all renames without test checkpoints.
- [ ] Re-run focused tests for each moved subsystem, then repo-wide `test`, `typecheck`, and `build`.
- [ ] Commit the layout cutover.

### Task 5: Collapse Thin Runtime Wrappers

**Files:**
- Modify: `apps/agent-runtime/src/runtime/workflow-runtime.ts`
- Modify: `apps/agent-runtime/src/runtime/agent-execution-runtime.ts`
- Modify: `apps/agent-runtime/src/runtime/observe-runtime.ts`
- Delete if unused: `apps/agent-runtime/src/runtime/agent-runtime.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`
- Modify or add: lifecycle-focused runtime tests under `apps/agent-runtime/test/runtime/**`

- [ ] Collapse pass-through wrappers that no longer carry clear ownership after legacy removal.
- [ ] Keep one thin runtime shell facade only where it still improves lifecycle clarity.
- [ ] Add or update focused lifecycle tests for `start`, `run/observe`, interrupt, and `stop`.
- [ ] Re-run focused runtime lifecycle tests, then repo-wide `test`.
- [ ] Commit the wrapper-collapse slice.

### Task 6: Tighten Lint And Clean Obsolete Docs

**Files:**
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`
- Modify: `docs/project/current-state.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/architecture/layers.md`
- Modify: `docs/testing/strategy.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`
- Modify/archive: obsolete docs under `docs/superpowers/specs/**` and `docs/superpowers/plans/**`

- [ ] Add final lint rules that lock the reduced runtime surface and new folder layout.
- [ ] Archive or delete obsolete docs that still present legacy run or future core flow as active direction.
- [ ] Sync top-level docs so only `observe`, `sop-compact`, and `refine` remain as current product flows.
- [ ] Run `npm --prefix apps/agent-runtime run lint:arch`, `lint`, `test`, `typecheck`, `build`, and `hardgate`.
- [ ] Commit the doc-and-gate closure.

## Sequencing Notes

- Recommended order is Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5 -> Task 6.
- Keep CLI cutover separate from legacy-code deletion.
- Keep legacy deletion separate from folder moves.
- Keep folder moves separate from wrapper collapse.
- Do not revive e2e work inside this slice.
- Each coding task should be implemented by a fresh subagent and merged back before the next task begins.

## Completion Checklist

- [ ] active runtime surface is only `observe`, `sop-compact`, and `refine`
- [ ] legacy direct run path is removed
- [ ] future `core agent` product-flow references are no longer active truth
- [ ] runtime files are grouped by flow/shell instead of scattered at the root
- [ ] lint rules lock the new structure
- [ ] repo-wide verification passes without a fresh e2e requirement
