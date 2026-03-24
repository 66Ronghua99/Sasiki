---
doc_type: spec
status: completed
supersedes: []
related:
  - docs/project/refine-observe-page-surface-analysis.md
  - docs/project/refine-observation-enhancement-decision-matrix.md
  - apps/agent-runtime/src/application/refine/refine-browser-snapshot-parser.ts
  - apps/agent-runtime/src/application/refine/tools/services/refine-browser-service.ts
  - apps/agent-runtime/src/application/refine/tools/definitions/observe-page-tool.ts
  - apps/agent-runtime/src/application/refine/tools/definitions/observe-query-tool.ts
---

# Refine Observation Stabilization Design

## Problem

The current `observe.page` path is still an MVP surface:

- it captures one raw `browser_snapshot`
- it extracts only light page/tab metadata
- it returns the snapshot immediately without a stabilization pass
- it gives the agent the full raw snapshot but no explicit readiness signal

This causes two different failure modes to get mixed together:

- the page is still changing, so the observation is too early
- the page has stopped changing, but the captured structure is still too thin to reason on safely

The current system also exposes too much raw browser noise for task execution, especially in `tabs`, while still lacking a small agent-facing signal for "is this observation ready enough to trust".

## Goal

Make `observe.page` produce a more trustworthy observation by adding a bounded stabilization pass in the adapter layer, while keeping the agent-facing contract small.

## Non-Goals

- No OCR or screenshot fusion in this pass.
- No task-specific page summarizers in this pass.
- No automatic refresh inside `observe.query`.
- No strong semantic region model as a required truth source in this pass.
- No hidden runtime fallback that silently pretends an incomplete observation is ready.

## Chosen Direction

Use a `Hybrid gate` inside `observe.page`:

1. a short pre-gate wait
2. a bounded multi-snapshot settle loop
3. a hard timeout that still returns truthfully

The gate should be driven primarily by convergence and structural density, not by strong region heuristics.

## Snapshot Corpus Freeze

Before finalizing the new parser assumptions, freeze a small corpus of real Playwright MCP `browser_snapshot` outputs.

The initial corpus should cover at least:

- a stable single-page content view
- a multi-tab view
- a stale `Page URL` / correct active tab view
- a modal or overlay view
- a shell-only or thin-content view
- a partial page where the business page is correct but the snapshot is still weak

The purpose of this phase is to define what raw snapshot shapes are safe for the parser to depend on.

## Parser-Safe Assumptions

The parser may safely depend on:

- `### Open tabs` as raw tab provenance
- `### Page` as a page identity hint
- `### Snapshot` as the main structural surface
- YAML-like lines with `[ref=...]`
- text markers such as `text:` and state markers such as `<changed>` / `[unchanged]` as real snapshot syntax, not exceptional noise

The parser must not assume:

- a fixed region schema from Playwright MCP
- that `Page URL` is always the true live page
- that every useful text node has its own `ref`
- that one snapshot is sufficient to judge readiness

## Hybrid Gate Flow

`observe.page` should execute in three stages:

1. `pre-gate`
   - wait briefly for a generic load milestone
   - prefer `domcontentloaded`
   - timeout is non-fatal and only records internal diagnostics
2. `settle loop`
   - capture up to three snapshots
   - parse each snapshot into a stable set of internal signals
   - stop early if the signals converge
3. `return`
   - if converged, mark the observation ready
   - if the hard timeout is reached first, return the best available observation truthfully as incomplete

## Stability Model

`stability` is a time-axis judgment:

- has the snapshot stopped changing materially across the bounded settle loop

It is an internal concept used by the adapter to determine whether the observation is ready.

## Completeness Model

`completeness` is a content-axis judgment:

- even if the page is no longer changing much, is the observed structure still too thin to trust

It is also an internal concept used by the adapter to determine whether the observation is ready.

## Agent-Visible Contract

The agent-facing payload should stay intentionally small.

Keep exposing:

- `observationRef`
- `snapshot`
- `page`
- `tabs`
- `activeTabIndex`
- `activeTabMatchesPage`

Add only:

- `observationReadiness`
  - `ready`
  - `incomplete`
- `pageTab`
- `taskRelevantTabs`

`observationReadiness` is the only new health signal the agent should reason over directly.

## Internal Diagnostics

The adapter should keep richer internal diagnostics for decision-making, verification, and later tuning, but should not expose them directly to the agent by default.

Examples of internal-only signals:

- settle attempts
- settle duration
- convergence metrics
- structural density metrics
- page/tab reconciliation details

## Convergence Signals

The settle loop should compare conservative, mechanical signals instead of relying on strong semantic parsing.

Suggested internal signals:

- page identity
- active tab identity
- tab count
- snapshot line count
- ref-bearing element count
- text-bearing line count
- changed-marker count

The gate should consider the observation converged when these key signals stop changing materially across successive captures.

## Observation Readiness

`observationReadiness` should be derived from the internal stabilization judgment.

- `ready`
  - the bounded settle loop converged to a structurally trustworthy observation
- `incomplete`
  - the observation is still too early, too thin, or failed to converge within the hard timeout

This is intentionally simpler than exposing separate stability and completeness fields to the agent.

## Tabs Model

Raw `tabs` remain the provenance truth.

Add two derived, agent-visible views:

- `pageTab`
  - the adapter's best match for the current page represented by this observation
- `taskRelevantTabs`
  - a lighter execution-oriented subset of tabs with obvious browser noise removed

This derived view must not replace raw `tabs`; it exists to reduce browser noise at execution time while preserving debuggability.

## Invariants

- `observe.page` remains the only tool that mints a new observationRef.
- `observe.query` remains latest-snapshot-only and does not refresh the page.
- Adapter stabilization must fail truthfully instead of silently pretending readiness.
- Raw `snapshot` remains the provenance source of truth.
- Agent-visible health must remain small and stable.

## Acceptance

- A written snapshot corpus exists for the initial parser baseline.
- The new design keeps agent-visible health to a single field: `observationReadiness`.
- The gate is defined primarily by convergence and density, not strong region heuristics.
- Raw `tabs` are preserved while `pageTab` and `taskRelevantTabs` are added as derived views.
- The design clearly separates agent-visible payload from internal diagnostics.

## Deferred Decisions

- Whether to later promote region summaries into a stable contract.
- Whether to later expand `observe.query` over additional deterministic text buckets.
- Whether to later fuse additional capture sources such as DOM evaluate or screenshot/OCR.
