---
doc_type: plan
status: archived
implements:
  - docs/superpowers/specs/2026-03-20-refine-react-tab-context-consistency.md
verified_by: []
supersedes: []
related:
  - docs/superpowers/specs/2026-03-20-refine-react-tool-surface-hardening.md
  - docs/superpowers/plans/2026-03-20-refine-react-tool-surface-hardening-implementation.md
---

# Refine React Tab Context Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Spec Path:** `docs/superpowers/specs/2026-03-20-refine-react-tab-context-consistency.md`

**Goal:** Remove tab/context drift in refine runtime by adding explicit tab switching, snapshot parser compatibility, and strict action/context semantics.

**Allowed Write Scope:**
- `apps/agent-runtime/src/domain/**`
- `apps/agent-runtime/src/runtime/replay-refinement/**`
- `apps/agent-runtime/test/replay-refinement/**`
- `docs/superpowers/specs/**`
- `docs/superpowers/plans/**`
- `PROGRESS.md`
- `NEXT_STEP.md`
- `MEMORY.md`

**Verification Commands:**
- `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-tool-client.test.ts`
- `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-contracts.test.ts`
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

**Evidence Location:**
- `artifacts/e2e/<run_id>/`
- `artifacts/code-gate/<timestamp>/report.json`

**Rule:** Keep scope limited to tab/context consistency and parser/action correctness. Do not bundle unrelated refactors.

---

## File Map

- Modify: `apps/agent-runtime/src/domain/refine-react.ts`
- Modify: `apps/agent-runtime/src/runtime/replay-refinement/refine-react-session.ts`
- Modify: `apps/agent-runtime/src/runtime/replay-refinement/refine-react-tool-client.ts`
- Modify: `apps/agent-runtime/src/runtime/replay-refinement/refine-browser-tools.ts`
- Add: `apps/agent-runtime/src/runtime/replay-refinement/refine-browser-snapshot-parser.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-contracts.test.ts`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

## Tasks

### Task 1: Reproduce And Lock Failures With Tests

- [x] Add failing tests for markdown `observe.page` parsing (`Page URL` / `Page Title`).
- [x] Add failing tests for YAML `observe.query` element parsing (`- role [ref=e...]`).
- [x] Add failing tests for action error semantics (`success=false` on explicit tool error output).
- [x] Add failing tests for `act.select_tab` exposure and routing.
- [x] Add failing tests for stale `sourceObservationRef` against live active tab mismatch.

### Task 2: Implement Tab-Aware Tool Surface And Parsers

- [x] Extend refine-react contracts/tool list with tab-select action.
- [x] Add schema + dispatch for `act.select_tab` in refine tool client.
- [x] Update `observe.page` parser for current markdown snapshot format and tab metadata extraction.
- [x] Update `observe.query` snapshot parser to support YAML element line shapes while preserving deterministic narrowing.

### Task 3: Enforce Context And Action Semantics

- [x] Validate `sourceObservationRef` existence and live tab consistency before action execution.
- [x] Keep explicit-failure policy for stale context with actionable error messages.
- [x] Set action `success` from actual tool result semantics (`isError` and explicit error markers), not hardcoded `true`.
- [x] Ensure action result page/tab metadata follows real post-action state when observable.

### Task 4: Verify And Sync Docs

- [x] Run focused tests and full verification commands listed above.
- [x] Update `PROGRESS.md` with completed scope and fresh evidence.
- [x] Update `MEMORY.md` with stable lessons from tab/context guardrails.
- [x] Update `NEXT_STEP.md` to the next single executable pointer.

## Completion Checklist

- [x] Spec requirements are covered
- [x] Tab-select capability is exposed and usable via refine-react surface
- [x] Snapshot parsers align with current Playwright markdown/YAML output
- [x] Action success and stale-context checks behave deterministically
- [x] Verification commands were run fresh
- [x] Project state docs are updated
