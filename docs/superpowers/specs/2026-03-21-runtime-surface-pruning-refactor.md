---
doc_type: spec
status: superseded
supersedes:
  - docs/superpowers/specs/2026-03-20-executor-bootstrap-boundary-refactor.md
related:
  - docs/superpowers/plans/2026-03-21-runtime-surface-pruning-refactor-implementation.md
  - apps/agent-runtime/src/index.ts
  - apps/agent-runtime/src/runtime/command-router.ts
  - apps/agent-runtime/src/runtime/runtime-composition-root.ts
  - apps/agent-runtime/src/runtime/runtime-config.ts
  - apps/agent-runtime/scripts/lint-architecture.mjs
---

# Runtime Surface Pruning And Layout Refactor Spec

## Why This Is The Next Spec

The repository has already completed the first major structural slices:

- CLI routing was separated from `index.ts`
- a dedicated runtime composition root was introduced
- legacy and refine bootstrap setup were extracted behind providers

Those changes improved boundaries, but they did not yet simplify the product surface. The runtime still carries an old split between:

- observe
- SOP compact
- legacy direct run
- refine run
- future `core agent` discussion in docs

The user-approved product scope for the current stage is narrower:

- `observe`
- `sop-compact` if still supported
- `refine`

This spec starts the cleanup slice that aligns code, folders, config, CLI, lint, tests, and docs with that narrower runtime surface.

## Product Scope Freeze

The repository should keep only these business flows as first-class runtime surfaces:

1. `observe`
2. `sop-compact`
3. `refine`

Everything else should either be removed or archived.

Important terminology note:

- "remove core flow" in this spec means remove the unfinished future product flow that was described as `core agent`
- it does **not** mean deleting `apps/agent-runtime/src/core/`, because the shared execution kernel remains required by `observe`, `sop-compact`, and `refine`

## Problem

### 1. The Runtime Still Models A Legacy Product Surface

The current codebase still treats legacy direct run as a live branch:

- `RuntimeMode` is still `run | observe`
- `runtime-composition-root.ts` still bifurcates `RunExecutor` vs `ReactRefinementRunExecutor`
- `runtime-config.ts` still carries consumption and legacy-run-oriented switches
- tests and docs still describe legacy run as part of the current architecture

That keeps maintainers paying complexity for a path the project no longer wants to preserve.

### 2. Files Are Grouped By Historical Accretion More Than By Flow

The runtime now has better provider seams, but the filesystem still mixes:

- flow files in the root `runtime/` directory
- refine files under `runtime/replay-refinement/`
- shared runtime shell pieces beside flow-specific modules
- compact helpers scattered across multiple root files

That makes it harder for future agents to answer simple questions like:

- where does refine begin and end?
- which files belong to observe only?
- which files are runtime shell vs flow logic?

### 3. Legacy And Future-Only Docs Still Pollute The Current Truth

The active and near-active docs still mention:

- legacy run as a first-class path
- future `core agent` consumption as if it were still part of near-term architecture truth
- older refactor loops that were useful stepping stones but are no longer the right active execution pointer

### 4. Current Lint/Test Gates Protect Boundaries, But Not The New Reduced Surface

The repository has good boundary checks already, but it still lacks hard gates for the new product decision:

- no legacy direct run path
- no `runtime --mode run`
- no `refinement.enabled` bifurcation
- no legacy SOP-consumption path
- no new files added back into the old legacy layout

## Decision

This refactor slice will do four things:

### A. Prune The Runtime Surface

- remove the legacy direct run path
- remove unfinished future `core agent` product-surface references from active docs
- keep `observe`, `sop-compact`, and `refine` only

### B. Make The CLI Match The Product Surface

The CLI should expose explicit commands for the kept flows instead of a generic runtime mode switch.

Target direction:

- `observe`
- `refine`
- `sop-compact`

The old `runtime --mode run|observe` grammar should be treated as legacy and removed or rejected in this slice.

### C. Reorganize Runtime Code By Flow And Shell

Target runtime layout:

- `runtime/shell/` for CLI/runtime shell and composition concerns
- `runtime/observe/` for observe-only execution
- `runtime/compact/` for SOP compact session code
- `runtime/refine/` for refine-only execution, tools, stores, and bootstrap
- `runtime/shared/` only for truly cross-flow runtime utilities that are not product surfaces

The exact folder names may vary slightly if implementation finds a clearer local convention, but the architectural rule is fixed:

- same flow and same layer should live together
- legacy names like `replay-refinement` should not survive the cutover
- root-level `runtime/` should stop accumulating unrelated flow files
- `runtime/providers/` is a temporary migration shape, not an end-state directory

Representative target shape:

```text
apps/agent-runtime/src/runtime/
  shell/{command-router.ts,runtime-composition-root.ts,workflow-runtime.ts}
  config/{runtime-config.ts,runtime-config-loader.ts}
  shared/{artifacts-writer.ts}
  observe/{observe-executor.ts,sop-asset-store.ts}
  compact/{interactive-sop-compact.ts,compact-session-machine.ts,compact-turn-normalizer.ts,interactive-sop-compact-prompts.ts,sop-rule-compact-builder.ts}
  refine/
    app/{react-refinement-run-executor.ts,refine-run-bootstrap.ts,refine-prompt-builder.ts}
    tools/{refine-react-tool-client.ts,refine-browser-tools.ts,refine-runtime-tools.ts,refine-browser-snapshot-parser.ts}
    state/{refine-react-session.ts}
    persistence/{attention-knowledge-store.ts,attention-guidance-loader.ts,refine-hitl-resume-store.ts}
```

This target is intentionally flow-first. It does not require preserving provider-shaped folders once ownership is clear.

### D. Archive Or Delete Obsolete Docs

- archive obsolete specs/plans that still present legacy run or future core flow as active direction
- sync project truth docs so they describe only the kept runtime surface
- delete repository-local docs that are no longer useful after the new active loop is established

## Success Criteria

- `RunExecutor` and the legacy direct run branch are removed from active code.
- `runtime/sop-consumption-context.ts` and legacy SOP-consumption flow are removed if nothing active still depends on them.
- CLI grammar exposes only `observe`, `refine`, and `sop-compact`.
- `runtime-composition-root.ts` no longer branches on `refinement.enabled`.
- flow-specific runtime files are grouped into flow directories instead of being scattered at `runtime/` root.
- active docs no longer describe legacy run or future `core agent` product flow as current architecture.
- repository gates remain green without requiring a fresh e2e run for this slice.

## Out Of Scope

- page-specific Xiaohongshu debugging
- tool-surface behavior tuning for current e2e instability
- new browser actions or prompt semantics
- replacing the shared execution kernel in `apps/agent-runtime/src/core/`
- introducing plugin runtime architecture

## Lint Acceptance

This slice is not accepted by review alone. The reduced runtime surface must be enforced in `lint:arch`.

- no imports of `runtime/run-executor.ts`
- no imports of `runtime/sop-consumption-context.ts`
- no imports from the old `runtime/replay-refinement/` path after cutover
- runtime shell files are the only allowed entrypoints for infrastructure assembly
- new flow directories are not eligible for new legacy size-budget exceptions
- if explicit command modules are introduced, only supported commands may be wired from the CLI entry

Representative lint intent:

- product-surface pruning belongs in import and path boundaries
- folder layout expectations should be enforced by file-path and import-direction rules where feasible

## Test Acceptance

This slice must follow test-first work for each sub-step.

Required regression coverage:

- CLI parsing accepts `observe`, `refine`, and `sop-compact`
- CLI parsing rejects legacy `runtime` and `--mode run`
- composition-root tests no longer model legacy-vs-refine branching
- refine executor behavior tests remain green
- observe execution tests remain green
- compact session tests or existing compact behavior checks remain green
- runtime bootstrap/config tests reflect the reduced config surface after legacy removal

Blocking verification:

- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`

No fresh e2e run is required for this refactor slice.

## Sequencing

Recommended order:

1. freeze the new runtime surface in docs and acceptance criteria
2. cut CLI grammar over to explicit kept flows
3. remove legacy direct run and SOP-consumption codepaths
4. reorganize folders by flow and shell
5. archive/delete obsolete docs and tighten final lint boundaries

## Do / Don't

Do:

- remove dead product paths instead of preserving them behind compatibility flags
- prefer explicit command and folder names that reflect the kept flows
- land the refactor in small, independently verified slices

Don't:

- keep legacy run alive behind `refinement.enabled=false`
- delete `src/core/` just because the future `core agent` product flow is out of scope
- mix e2e behavior tuning into this structural cleanup slice
