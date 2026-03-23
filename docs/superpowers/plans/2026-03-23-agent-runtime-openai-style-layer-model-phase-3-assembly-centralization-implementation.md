# Agent Runtime OpenAI-Style Layer Model Phase 3 Assembly Centralization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize concrete adapter assembly under `application/shell` so workflow modules stop directly owning browser, MCP, persistence, and config-source construction.

**Architecture:** Phase 3 takes the narrower engine from Phase 2 and fixes the top-level ownership story around concrete assembly. The desired code shape is that shell-owned composition builds concrete collaborators, application workflows consume prepared collaborators, and config source loading remains an infrastructure concern rather than an application concern.

**Tech Stack:** TypeScript, Node 20, Node test runner, architecture lint, workflow integration tests.

---

## Scope Freeze

- Focus on shell composition, workflow factories, and config ownership.
- Do not reopen Phase 2 kernel design unless a missing seam blocks assembly centralization.
- Do not attempt the final hardgate ratchet in this phase; keep temporary exceptions if they are still needed.

## Allowed Write Scope

- `apps/agent-runtime/src/application/shell/**`
- `apps/agent-runtime/src/application/observe/**`
- `apps/agent-runtime/src/application/compact/**`
- `apps/agent-runtime/src/application/refine/**`
- `apps/agent-runtime/src/application/config/**`
- `apps/agent-runtime/src/infrastructure/**`
- `apps/agent-runtime/scripts/lint-architecture.mjs`
- `apps/agent-runtime/test/application/**`
- `apps/agent-runtime/test/runtime/**`
- `docs/superpowers/specs/2026-03-23-agent-runtime-openai-style-layer-model-design.md`
- `docs/architecture/overview.md`
- `docs/project/current-state.md`
- `PROGRESS.md`
- `NEXT_STEP.md`
- `MEMORY.md`

## Verification Commands

- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run test -- 'test/application/**/*.test.ts' 'test/runtime/*.test.ts'`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`

## High-Churn Files

- `apps/agent-runtime/src/application/shell/runtime-composition-root.ts`
- `apps/agent-runtime/src/application/shell/workflow-runtime.ts`
- `apps/agent-runtime/src/application/observe/observe-workflow-factory.ts`
- `apps/agent-runtime/src/application/compact/interactive-sop-compact.ts`
- `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
- `apps/agent-runtime/src/application/config/runtime-config-loader.ts`
- corresponding workflow and runtime tests

## Phase 3 Acceptance

- [ ] shell is the only top-level concrete assembly owner
- [ ] non-shell application modules stop instantiating concrete adapters directly, except approved transitional seams
- [ ] config source loading remains outside application policy modules
- [ ] structural tests prove the new assembly ownership
- [ ] repo-wide verification is green

## Task 1: Inventory Non-Shell Concrete Assembly

**Files:**
- Modify: `docs/project/current-state.md`
- Modify: `PROGRESS.md`

- [ ] **Step 1: Record each non-shell concrete adapter instantiation**
- [ ] **Step 2: Group them into observe, compact, refine, and config ownership buckets**
- [ ] **Step 3: Decide which ones move now versus remain temporary exceptions in the canonical exception ledger**
- [ ] **Step 4: Commit**

## Task 2: Centralize Observe And Compact Assembly

**Files:**
- Modify: `apps/agent-runtime/src/application/shell/**`
- Modify: `apps/agent-runtime/src/application/observe/**`
- Modify: `apps/agent-runtime/src/application/compact/**`
- Test: `apps/agent-runtime/test/application/observe/**`
- Test: `apps/agent-runtime/test/application/compact/**`

- [ ] **Step 1: Write failing tests that require shell-owned collaborator injection**
- [ ] **Step 2: Move concrete recorder and related adapter creation behind shell-provided collaborators**
- [ ] **Step 3: Keep workflow semantics inside application while removing direct adapter ownership**
- [ ] **Step 4: Run focused observe/compact tests**
- [ ] **Step 5: Commit**

## Task 3: Centralize Refine Bootstrap Assembly

**Files:**
- Modify: `apps/agent-runtime/src/application/shell/**`
- Modify: `apps/agent-runtime/src/application/refine/**`
- Test: `apps/agent-runtime/test/application/refine/**`
- Test: `apps/agent-runtime/test/runtime/*.test.ts`

- [ ] **Step 1: Write failing tests for prepared refine collaborators**
- [ ] **Step 2: Move persistence-backed bootstrap collaborator creation into shell-owned composition**
- [ ] **Step 3: Leave refine workflow consuming prepared seams instead of constructing concrete stores**
- [ ] **Step 4: Run focused refine/runtime tests**
- [ ] **Step 5: Commit**

## Task 4: Clean Up Config Ownership

**Files:**
- Modify: `apps/agent-runtime/src/application/config/**`
- Modify: `apps/agent-runtime/src/infrastructure/config/**`
- Test: `apps/agent-runtime/test/runtime/runtime-config-loader.test.ts`
- Test: `apps/agent-runtime/test/runtime/runtime-bootstrap-provider.test.ts`

- [ ] **Step 1: Write failing config-boundary tests**
- [ ] **Step 2: Keep normalized config policy in application and raw source discovery in infrastructure**
- [ ] **Step 3: Update lint/structural assertions for config ownership**
- [ ] **Step 4: Run focused config/runtime tests**
- [ ] **Step 5: Commit**

## Task 5: Sync Docs And Verify

**Files:**
- Modify: `docs/architecture/overview.md`
- Modify: `docs/project/current-state.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

- [ ] **Step 1: Update docs to reflect shell-owned assembly**
- [ ] **Step 2: Point `NEXT_STEP.md` at Phase 4 hardgate ratchet**
- [ ] **Step 3: Run full verification**
- [ ] **Step 4: Commit**
