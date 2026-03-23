# Agent Runtime OpenAI-Style Layer Model Phase 4 Hardgate Ratchet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ratchet the repo’s hard gates and front-door docs from the transitional phase model to the strongest architecture truth supported by the code after Phases 2 and 3.

**Architecture:** Phase 4 is the consolidation pass. It should remove stale exceptions, tighten lint rules to match the now-cleaner code structure, expand structural proofs where singleton ownership or role boundaries matter, and sync all front-door docs so the code, docs, and hard gates say the same thing.

**Tech Stack:** TypeScript, Node 20, Node test runner, architecture lint, Harness governance docs.

---

## Scope Freeze

- Run this phase only after Phase 3 lands.
- Do not introduce fresh architectural abstractions in this phase unless a tiny helper is required to support a proof or hardgate.
- Focus on ratcheting, cleanup, and synchronization.

## Allowed Write Scope

- `apps/agent-runtime/scripts/lint-architecture.mjs`
- `apps/agent-runtime/scripts/tests/**`
- `apps/agent-runtime/test/application/**`
- `apps/agent-runtime/test/kernel/**`
- `docs/superpowers/specs/2026-03-23-agent-runtime-openai-style-layer-model-design.md`
- `docs/architecture/layers.md`
- `docs/architecture/overview.md`
- `docs/project/current-state.md`
- `PROGRESS.md`
- `NEXT_STEP.md`
- `MEMORY.md`

## Verification Commands

- `npm --prefix apps/agent-runtime run lint`
- `node --test apps/agent-runtime/scripts/tests/*.test.mjs`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`

## Phase 4 Acceptance

- [ ] stale transition exceptions are removed or explicitly deferred with owners
- [ ] lint rules match current code truth instead of the earlier transitional allowlist
- [ ] structural tests prove the final singleton-owner and role-boundary story
- [ ] front-door docs reflect the post-migration truth
- [ ] repo-wide verification is green with fresh evidence

## Task 1: Audit The Exception Ledger

**Files:**
- Modify: `docs/superpowers/specs/2026-03-23-agent-runtime-openai-style-layer-model-design.md`
- Modify: `docs/project/current-state.md`

- [ ] **Step 1: Re-read the phase-1 exception ledger**
- [ ] **Step 2: Remove entries resolved by Phases 2 and 3**
- [ ] **Step 3: For any remaining exceptions, keep owner, reason, and exit condition explicit**
- [ ] **Step 4: Commit**

## Task 2: Tighten Lint To Post-Migration Truth

**Files:**
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`
- Modify: `apps/agent-runtime/scripts/tests/**`

- [ ] **Step 1: Write failing lint fixtures for now-forbidden transitional cases**
- [ ] **Step 2: Remove phase-1 allowances that are no longer needed**
- [ ] **Step 3: Tighten kernel, application, and refine-tools role checks to match final code truth**
- [ ] **Step 4: Run script-level lint tests and `lint:arch`**
- [ ] **Step 5: Commit**

## Task 3: Expand Structural Proofs

**Files:**
- Modify: `apps/agent-runtime/test/application/layer-boundaries.test.ts`
- Modify: `apps/agent-runtime/test/kernel/**`

- [ ] **Step 1: Add assertions proving the final engine/application split**
- [ ] **Step 2: Add assertions proving shell-only concrete assembly**
- [ ] **Step 3: Add assertions proving refine-tools role isolation where still relevant**
- [ ] **Step 4: Run focused structural tests**
- [ ] **Step 5: Commit**

## Task 4: Final Doc Sync And Verification

**Files:**
- Modify: `docs/architecture/layers.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/project/current-state.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

- [ ] **Step 1: Rewrite front-door docs to reflect the new steady state**
- [ ] **Step 2: Point `NEXT_STEP.md` at the next real product or architecture priority**
- [ ] **Step 3: Run full verification and collect fresh evidence**
- [ ] **Step 4: Commit**
