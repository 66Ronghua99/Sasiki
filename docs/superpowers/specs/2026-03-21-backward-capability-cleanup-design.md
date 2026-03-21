---
doc_type: spec
status: completed
supersedes: []
related:
  - docs/superpowers/specs/2026-03-21-agent-runtime-layer-taxonomy-reorg.md
  - docs/superpowers/plans/2026-03-21-agent-runtime-layer-taxonomy-reorg-implementation.md
  - docs/architecture/overview.md
  - docs/architecture/layers.md
  - apps/agent-runtime/src/runtime/agent-execution-runtime.ts
---

# Backward Capability Cleanup Design

> Completed cleanup record. The current front-door architecture truth lives in `docs/architecture/overview.md`.

## Why This Exists

The taxonomy reorganization is complete, but the repository still keeps a large compatibility surface:

- `runtime/*` compatibility re-export files
- `core/*` compatibility re-export files
- legacy CLI compatibility branches that only emit upgrade errors
- compatibility-focused tests that protect migration-era behavior rather than the current architecture
- active docs that still describe shim-era structure instead of the final post-cleanup baseline

Those files were useful during the migration, but they now preserve an outdated topology, increase search noise, and keep dead import paths alive.

This spec defines the cleanup pass that removes backward capability code and leaves only the latest architecture.

## Scope

This cleanup keeps only the current product surfaces:

- `observe`
- `refine`
- `sop-compact`

This cleanup removes:

- one-line compatibility re-export files under `src/runtime/**`
- one-line compatibility re-export files under `src/core/**`
- legacy CLI compatibility branches that only fail with upgrade guidance
- compatibility-only tests that assert old paths or old CLI migration messages

In practice, the legacy CLI compatibility surface explicitly includes:

- old `runtime` command parsing branches
- old `--mode run|observe` compatibility handling
- archived compact aliases such as `sop-compact-hitl` and `sop-compact-clarify`

This cleanup keeps:

- the canonical implementation files under `application/`, `kernel/`, and `infrastructure/`
- `runtime/agent-execution-runtime.ts` as the remaining real runtime implementation
- historical documents as archived background

## Non-Goals

- no new e2e work
- no behavioral redesign of observe / refine / sop-compact
- no new topology redesign beyond removing compatibility leftovers
- no preservation of external imports that still depend on removed legacy paths

## End State

After this cleanup:

- `src/runtime/` contains only real runtime-state code, not compatibility re-export shells
- `src/core/` no longer exists as a compatibility facade layer
- old `runtime` / `--mode run|observe` CLI compatibility branches are removed instead of returning upgrade errors
- tests only protect the latest architecture and current product behavior
- the taxonomy redesign docs are archived as completed migration history
- a shorter current-architecture document becomes the front-door truth for current code layout and core workflow responsibilities

## Cleanup Strategy

The cleanup should land as three small green slices.

### Slice 1: Delete Source Compatibility Shells

Remove compatibility-only source files while keeping canonical code untouched.

Expected targets include:

- `src/runtime/` re-export shells for shell/config/providers/observe/compact/refine
- `src/core/` re-export shells that point to `kernel/`, `application/observe/support/`, or `infrastructure/llm/`

Rules:

- delete files only after all in-repo imports are cut to canonical paths
- update or delete lint/test fixtures that read shim source files directly in the same slice as deletion
- if a file contains real implementation, it is not part of this slice
- `runtime/agent-execution-runtime.ts` stays

Important note:

- deletion safety is not only about production imports
- this repository also has architecture lint and tests that directly read shim files or import runtime wrappers
- those fixtures must be rewritten or removed atomically with shim deletion, not deferred

### Slice 2: Remove Legacy CLI Compatibility Surface

Delete the retired CLI compatibility behavior rather than preserving explicit upgrade-error branches.

Expected targets include:

- old `runtime` command parsing branches
- old `--mode run|observe` compatibility handling
- archived compact aliases `sop-compact-hitl` and `sop-compact-clarify`
- tests that only assert migration guidance for those retired entrypoints

Rules:

- the supported CLI surface after cleanup is only:
  - `observe`
  - `refine`
  - `sop-compact`
- unsupported legacy argv shapes no longer need migration-specific upgrade text, but parser behavior must stay explicit and testable
- post-cleanup CLI acceptance must pin at least:
  - explicit support for `observe`, `refine`, and `sop-compact`
  - explicit rejection of archived aliases such as `sop-compact-hitl` and `sop-compact-clarify`
  - explicit rejection of bare task invocation and unknown commands

### Slice 3: Archive Migration Docs And Reset Front-Door Truth

Archive migration-era architecture truth and replace it with shorter current-state documentation.

Expected changes:

- mark the taxonomy cleanup spec/plan as archived or completed history
- add a short post-cleanup architecture summary doc describing:
  - current layer ownership
  - current product flows
  - current canonical code homes
- rewrite or replace `docs/architecture/overview.md` so it becomes the single short current-architecture front door
- rewrite `apps/agent-runtime/README.md` so shipped command documentation matches the cleaned CLI surface
- update `PROGRESS.md`, `NEXT_STEP.md`, `MEMORY.md`, `docs/project/current-state.md`, and architecture docs to stop speaking in shim-era terms

Rules:

- historical docs are kept, not deleted
- historical docs must be clearly marked as no longer active truth
- there should be exactly one short active current-architecture front door after cleanup
- `docs/architecture/layers.md` must either be rewritten as supporting reference only or explicitly downgraded from front-door truth so it does not compete with the single short architecture entrypoint
- current front-door docs should describe what exists now, not the migration process that produced it

## Lint And Test Expectations

### Lint

Architecture lint should be tightened so that:

- compatibility roots under `src/runtime/` and `src/core/` cannot silently grow back after cleanup
- application code must import canonical paths directly
- removed legacy CLI compatibility surfaces are not reintroduced

### Tests

The cleanup intentionally removes compatibility-only tests.

Tests that remain should cover:

- current CLI grammar for `observe`, `refine`, and `sop-compact`
- current canonical module ownership
- current runtime lifecycle semantics

Tests that should be deleted or rewritten:

- tests whose only purpose is to assert old CLI migration guidance
- tests whose only purpose is to assert old compatibility re-export shells

## Risks

### 1. Hidden In-Repo Imports

Deleting re-export shells too early can break overlooked internal imports.

Mitigation:

- cut imports to canonical homes first
- verify with focused tests and repo-wide gates after each slice

### 2. Over-Cleaning Runtime

There is a risk of deleting the last real runtime implementation together with the shims.

Mitigation:

- explicitly preserve `runtime/agent-execution-runtime.ts`
- treat any non-trivial runtime lifecycle implementation as out of scope for deletion in this cleanup pass

### 3. Doc Truth Drift

If migration docs remain active after compatibility code is gone, the repository truth becomes confusing again.

Mitigation:

- archive migration docs in the final slice
- replace them with a smaller current-architecture explainer

## Acceptance

This cleanup is complete when all of the following are true:

- compatibility-only source files under `src/runtime/**` and `src/core/**` are removed
- canonical imports are used throughout the repository
- legacy CLI compatibility branches are removed
- compatibility-only tests are removed
- `apps/agent-runtime/README.md` no longer documents deleted compatibility commands or migration-era grammars
- `docs/architecture/overview.md` is rewritten or replaced as the single short active current-architecture entrypoint
- active docs no longer describe shim-era structure as current truth
- `npm --prefix apps/agent-runtime run lint:arch` passes
- repo gates pass:
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run test`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
- final closure also passes:
  - `npm --prefix apps/agent-runtime run hardgate`
