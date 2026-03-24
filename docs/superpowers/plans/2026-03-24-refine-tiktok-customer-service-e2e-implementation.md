---
doc_type: plan
status: completed
implements:
  - docs/superpowers/specs/2026-03-24-refine-tiktok-customer-service-e2e-design.md
verified_by:
  - npm --prefix apps/agent-runtime run test -- test/application/refine/prompt-provider.test.ts test/application/refine/refine-tool-surface.test.ts test/runtime/refine-run-bootstrap-provider.test.ts
  - npm --prefix apps/agent-runtime run lint
  - npm --prefix apps/agent-runtime run test
  - npm --prefix apps/agent-runtime run typecheck
  - npm --prefix apps/agent-runtime run build
  - npm --prefix apps/agent-runtime run hardgate
supersedes: []
related:
  - docs/testing/refine-e2e-tiktok-shop-customer-service-runbook.md
---

# Refine TikTok Customer Service E2E Implementation Plan

**Spec Path:** `docs/superpowers/specs/2026-03-24-refine-tiktok-customer-service-e2e-design.md`

**Goal:** Promote the TikTok Global Shop customer-service check to the active refine e2e baseline, then harden prompt and tool semantics so the agent stays grounded across navigation, tab switches, and empty inbox states.

**Allowed Write Scope:** `apps/agent-runtime/src/application/refine/**`, `apps/agent-runtime/test/application/refine/**`, `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`, `docs/testing/**`, `docs/superpowers/specs/**`, `docs/superpowers/plans/**`, `docs/project/current-state.md`, `PROGRESS.md`, `MEMORY.md`, `NEXT_STEP.md`

**Verification Commands:** `npm --prefix apps/agent-runtime run test -- test/application/refine/prompt-provider.test.ts test/application/refine/refine-tool-surface.test.ts test/runtime/refine-run-bootstrap-provider.test.ts`, `npm --prefix apps/agent-runtime run lint`, `npm --prefix apps/agent-runtime run test`, `npm --prefix apps/agent-runtime run typecheck`, `npm --prefix apps/agent-runtime run build`, `npm --prefix apps/agent-runtime run hardgate`

**Evidence Location:** `artifacts/e2e/<run_id>/`, focused test output, `artifacts/code-gate/<timestamp>/report.json`

## File Map

- Create: `docs/testing/refine-e2e-tiktok-shop-customer-service-runbook.md`
- Create: `docs/superpowers/specs/2026-03-24-refine-tiktok-customer-service-e2e-design.md`
- Create: `docs/superpowers/plans/2026-03-24-refine-tiktok-customer-service-e2e-implementation.md`
- Modify: `apps/agent-runtime/src/application/refine/prompt-provider.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/src/application/refine/system-prompts.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/definitions/*.ts`
- Modify: `apps/agent-runtime/test/application/refine/prompt-provider.test.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- Modify: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
- Modify: `docs/project/current-state.md`
- Modify: `PROGRESS.md`
- Modify: `MEMORY.md`
- Modify: `NEXT_STEP.md`

## Tasks

### Task 1: Freeze The New E2E Baseline

- [x] Write the TikTok customer-service runbook and active spec/plan.
- [x] Record the current baseline evidence and the known stale-observation confusion pattern.

### Task 2: Harden Prompt And Tool Semantics

- [x] Expose bootstrap initial observation metadata to the start prompt.
- [x] Add explicit re-observe and tab-switch rules.
- [x] Clarify verified empty-state completion.
- [x] Tighten tool descriptions to mirror those semantics.
- [x] Update focused tests.

### Task 3: Verify And Sync

- [x] Run focused verification.
- [x] Run fresh TikTok customer-service refine e2e.
- [x] Sync state docs and set the next P0 pointer.

## Completion Checklist

- [x] Spec requirements are covered
- [x] Verification commands were run fresh
- [x] Evidence location is populated or explicitly noted
- [x] Repository state docs are updated

## Outcome

- First baseline run `20260324_085500_941` exposed the stale-snapshot confusion pattern after `act.navigate`.
- Improved run `20260324_090514_720` completed against the same TikTok task with cleaner sequencing:
  - no stale `observe.query` loop on `about:blank`
  - explicit `act.select_tab` then fresh `observe.page` after new-tab open
  - verified empty inbox completion with `assistantTurnCount: 10`, `candidateKnowledgeCount: 1`, `promotedKnowledgeCount: 1`
- Fresh verification evidence:
  - `artifacts/e2e/20260324_090514_720/`
  - `artifacts/code-gate/2026-03-24T01-07-44-994Z/report.json`
