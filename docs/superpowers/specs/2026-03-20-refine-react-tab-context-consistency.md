---
doc_type: spec
status: archived
supersedes: []
related:
  - docs/superpowers/specs/2026-03-20-refine-react-tool-surface-hardening.md
  - docs/superpowers/plans/2026-03-20-refine-react-tab-context-consistency-implementation.md
---

# Refine React Tab Context Consistency Spec

## Problem

Recent refine-runtime runs show a compound failure pattern that causes page-context drift:

- Refine tool surface has no explicit tab-select action, so when a click opens a new tab, the agent cannot deterministically switch to that tab.
- `observe.page` page identity parsing does not match Playwright snapshot markdown format (`Page URL` / `Page Title`), so page metadata degrades to `about:blank` fallback.
- `observe.query` element parsing does not match YAML snapshot element format (`- role [ref=e123]: ...`), producing false-empty matches.
- Action result semantics currently hardcode `success=true`, even when tool output is an explicit error (`### Error`, timeout, viewport failure).
- `sourceObservationRef` is accepted but not context-validated against current active tab/page, so stale observations can drive actions after tab/context changes.

## Success

- Refine-react exposes explicit tab selection capability for deterministic tab switching.
- `observe.page` returns correct page identity from current snapshot format and includes tab context metadata.
- `observe.query` returns non-empty deterministic matches for YAML snapshot lines with `ref`.
- Action execution reports `success=false` for explicit tool-level errors.
- Action calls validate `sourceObservationRef` against live tab context and fail fast on stale-tab mismatch.
- After navigate/tab switch transitions, action/observation metadata remains context-consistent in artifacts.

## Out Of Scope

- Refactor of non-refine runtime path (`RunExecutor` legacy path).
- Prompt-only policy changes without runtime/tool contract changes.
- Broad redesign of knowledge store or HITL architecture.

## Critical Paths

1. Extend refine-react tool surface with tab-select action.
2. Align snapshot parser with markdown + YAML formats now emitted by Playwright MCP.
3. Correct action success semantics and provenance validation gates.
4. Cover regression with focused tests on parser, tab switch, and stale context checks.

## Frozen Contracts

- Refine-react tool list includes `act.select_tab`.
- `observe.page` must emit parseable page identity (`url`, `origin`, `normalizedPath`, `title`) from markdown snapshot page section.
- `sourceObservationRef` remains required for all `act.*` tools and is validated before action execution.
- Action result success semantics must reflect actual tool execution outcome, not constant success.

## Architecture Invariants

- Refinement execution remains `AgentLoop -> RefineReactToolClient -> RefineBrowserTools -> raw MCP`.
- Runtime prefers explicit failure for stale context or parse mismatch over silent fallback behavior.
- Agent remains the decision maker; runtime enforces grounding, provenance, and consistency boundaries.

## Failure Policy

- If `sourceObservationRef` is missing/unknown/stale against current active tab, action fails with explicit error and guidance to re-observe or switch tab.
- If live tool output contains explicit error marker, action result is recorded with `success=false`.
- If tab listing capability is unavailable, observation still succeeds with available page data but must not fabricate tab state.

## Acceptance

- Focused tests pass for:
  - `observe.page` parsing of markdown `Page URL` / `Page Title`.
  - `observe.query` parsing of YAML element refs.
  - `act.select_tab` tool schema and routing.
  - stale `sourceObservationRef` tab mismatch rejection.
  - action failure semantics (`success=false`) on explicit tool error output.
- Fresh verification gate passes:
  - `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-tool-client.test.ts`
  - `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-contracts.test.ts`
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`

## Deferred Decisions

- Whether to enforce strict page-URL consistency (not only tab consistency) before every action.
- Whether to auto-inject synthetic post-action observations for every mutation step in a future iteration.
