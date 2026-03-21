# Backward Capability Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all migration-era backward compatibility code and compatibility-only tests, archive migration docs, and leave only the latest architecture and current product surface.

**Architecture:** This plan is a cleanup pass, not a new redesign. The work proceeds in small green slices: first freeze the new active truth, then delete source compatibility shells, then remove legacy CLI compatibility behavior, then archive migration docs and reset front-door documentation, and finally run full repo gates to close the loop. `runtime/agent-execution-runtime.ts` is explicitly preserved as the remaining real runtime implementation.

**Tech Stack:** TypeScript, Node 20, Node test runner, project-local architecture lint, Harness docs layout.

---

## Scope Notes

- Current supported product surface after cleanup remains:
  - `observe`
  - `refine`
  - `sop-compact`
- External consumers of removed legacy import paths are allowed to break.
- Compatibility-only tests are deleted rather than preserved.
- Historical docs are archived or marked deprecated; they are not deleted.

## File Map

High-churn areas expected across this cleanup:

- `apps/agent-runtime/src/core/**`
- `apps/agent-runtime/src/runtime/**`
- `apps/agent-runtime/src/application/shell/command-router.ts`
- `apps/agent-runtime/src/domain/agent-types.ts`
- `apps/agent-runtime/test/runtime/**`
- `apps/agent-runtime/test/application/**`
- `apps/agent-runtime/scripts/lint-architecture.mjs`
- `apps/agent-runtime/README.md`
- `docs/architecture/overview.md`
- `docs/architecture/layers.md`
- `docs/project/current-state.md`
- `docs/superpowers/specs/2026-03-21-agent-runtime-layer-taxonomy-reorg.md`
- `docs/superpowers/plans/2026-03-21-agent-runtime-layer-taxonomy-reorg-implementation.md`
- `PROGRESS.md`
- `NEXT_STEP.md`
- `MEMORY.md`

## Verification Commands

- `npm --prefix apps/agent-runtime run lint:docs`
- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`
- `git diff --check`

## Tasks

### Task 1: Freeze Active Truth For Cleanup

**Files:**
- Modify: `docs/superpowers/specs/2026-03-21-backward-capability-cleanup-design.md`
- Create: `docs/superpowers/plans/2026-03-21-backward-capability-cleanup-implementation.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `docs/project/current-state.md`

- [ ] Mark the cleanup spec as the active direction and update project pointers away from the stability-track placeholder.
- [ ] Write or update doc-health assertions in docs so the repo truth says cleanup is the active loop.
- [ ] Record explicit pointer evidence that cleanup is the only active loop (active spec, active plan, unique next step).
- [ ] Run `npm --prefix apps/agent-runtime run lint:docs`.
- [ ] Run `git diff --check`.
- [ ] Commit with: `docs: freeze backward capability cleanup plan`

### Task 2: Delete Source Compatibility Shells

**Files:**
- Delete: compatibility-only files under `apps/agent-runtime/src/core/**`
- Delete: compatibility-only files under `apps/agent-runtime/src/runtime/**`
- Modify: any in-repo imports still pointing at deleted shim paths
- Modify/Delete: shim-assertion tests under `apps/agent-runtime/test/**`
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`

- [ ] Write failing tests for the new source-boundary truth:
  - no compatibility re-export shells under `src/core/**`
  - no compatibility re-export shells under `src/runtime/**`
  - canonical imports point directly to `application/`, `kernel/`, or `infrastructure/`
- [ ] Run the focused failing tests and confirm they fail for shim-presence reasons.
- [ ] Delete compatibility-only source shells, leaving `runtime/agent-execution-runtime.ts` intact.
- [ ] Rewrite or remove tests that only assert shim equality or read shim source files directly.
- [ ] Update `lint-architecture.mjs` so deleted shim roots cannot regrow.
- [ ] Run focused tests for affected boundaries.
- [ ] Run repo-wide:
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run lint:arch`
  - `npm --prefix apps/agent-runtime run test`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
- [ ] Run `git diff --check`.
- [ ] Commit with: `refactor: remove compatibility source shells`

### Task 3: Remove Legacy CLI Compatibility Surface

**Files:**
- Modify: `apps/agent-runtime/src/application/shell/command-router.ts`
- Modify: `apps/agent-runtime/src/domain/agent-types.ts`
- Modify/Delete: `apps/agent-runtime/test/runtime/command-router.test.ts`
- Modify: any CLI-facing docs or tests touched by parser simplification

- [ ] Write failing CLI tests for the desired post-cleanup behavior:
  - `observe`, `refine`, and `sop-compact` still parse explicitly
  - bare task invocation is explicitly rejected
  - unknown commands are explicitly rejected
  - archived aliases `sop-compact-hitl` and `sop-compact-clarify` are explicitly rejected without migration-era upgrade messaging
- [ ] Run the focused CLI tests and verify the red phase.
- [ ] Remove legacy compatibility branches for `runtime`, `--mode`, and archived compact aliases.
- [ ] Delete compatibility-only CLI tests that only protect old upgrade guidance.
- [ ] Run focused CLI tests.
- [ ] Run repo-wide:
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run lint:arch`
  - `npm --prefix apps/agent-runtime run test`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
- [ ] Run `git diff --check`.
- [ ] Commit with: `refactor: remove legacy cli compatibility`

### Task 4: Archive Migration Docs And Reset Front-Door Truth

**Files:**
- Modify: `apps/agent-runtime/README.md`
- Modify or replace: `docs/architecture/overview.md`
- Modify: `docs/architecture/layers.md`
- Modify: `docs/superpowers/specs/2026-03-21-agent-runtime-layer-taxonomy-reorg.md`
- Modify: `docs/superpowers/plans/2026-03-21-agent-runtime-layer-taxonomy-reorg-implementation.md`
- Modify: `docs/superpowers/specs/2026-03-21-backward-capability-cleanup-design.md`

- [ ] Archive or downgrade the taxonomy migration spec/plan from active front-door truth.
- [ ] Rewrite `docs/architecture/overview.md` into the single short current-architecture entrypoint.
- [ ] Rewrite `apps/agent-runtime/README.md` so it no longer documents deleted compatibility commands or migration-era grammars.
- [ ] Re-scope `docs/architecture/layers.md` so it does not compete with the single front-door architecture doc.
- [ ] Record explicit doc-health evidence that migration docs are archived and only one short architecture front door remains active.
- [ ] Run `npm --prefix apps/agent-runtime run lint:docs`.
- [ ] Run `npm --prefix apps/agent-runtime run lint`.
- [ ] Run `git diff --check`.
- [ ] Commit with: `docs: archive migration truth and reset front-door docs`

### Task 5: Final Gate Closure

**Files:**
- Modify: `docs/superpowers/plans/2026-03-21-backward-capability-cleanup-implementation.md`
- Modify: `docs/project/current-state.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`
- Modify: any docs or lint file needed only if final gate output requires a small corrective follow-up

- [ ] Run:
  - `npm --prefix apps/agent-runtime run lint:docs`
  - `npm --prefix apps/agent-runtime run lint:arch`
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run test`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
  - `npm --prefix apps/agent-runtime run hardgate`
- [ ] Update `docs/project/current-state.md`, `PROGRESS.md`, `NEXT_STEP.md`, and `MEMORY.md` to the verified post-cleanup baseline only after all gates pass.
- [ ] Record explicit pointer evidence that post-cleanup docs are the only active truth.
- [ ] Record the fresh hardgate report path under `verified_by`.
- [ ] Confirm `git status --short` is clean except intended closure changes.
- [ ] Run `git diff --check`.
- [ ] Commit with: `docs: close backward capability cleanup plan`

## Completion Checklist

- [ ] compatibility-only source shells under `src/runtime/**` are removed
- [ ] compatibility-only source shells under `src/core/**` are removed
- [ ] `runtime/agent-execution-runtime.ts` remains as the real runtime implementation
- [ ] legacy CLI compatibility branches are removed
- [ ] compatibility-only tests are removed
- [ ] `apps/agent-runtime/README.md` documents only the surviving CLI surface
- [ ] there is exactly one short active current-architecture entrypoint
- [ ] full repo verification passes with fresh evidence
