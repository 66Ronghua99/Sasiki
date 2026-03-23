# Agent Runtime OpenAI-Style Layer Model Phase 2 Kernel Narrowing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Narrow `apps/agent-runtime/src/kernel` toward a pure engine-style layer that no longer depends on product-domain semantics or concrete infrastructure.

**Architecture:** Phase 2 is the first true source refactor in this program. The implementation should treat today’s `kernel` as transitional, extract workflow-specific semantics back into application-owned seams, and replace direct `kernel -> domain` or `kernel -> infrastructure` dependencies with narrower engine-facing contracts. The desired outcome is not a perfect final engine, but a materially smaller and cleaner shared execution layer.

**Tech Stack:** TypeScript, Node 20, Node test runner, architecture lint, existing application/kernel tests.

---

## Scope Freeze

- Focus on `apps/agent-runtime/src/kernel/**` and its closest consumers.
- Do not combine this phase with Phase 3 shell assembly cleanup unless a tiny seam move is required to unblock kernel narrowing.
- Do not rename `contracts/` to `ports/` in this phase.

## Allowed Write Scope

- `apps/agent-runtime/src/kernel/**`
- `apps/agent-runtime/src/application/refine/**`
- `apps/agent-runtime/src/contracts/**`
- `apps/agent-runtime/src/domain/**`
- `apps/agent-runtime/scripts/lint-architecture.mjs`
- `apps/agent-runtime/test/kernel/**`
- `apps/agent-runtime/test/application/refine/**`
- `docs/superpowers/specs/2026-03-23-agent-runtime-openai-style-layer-model-design.md`
- `docs/architecture/layers.md`
- `docs/project/current-state.md`
- `PROGRESS.md`
- `NEXT_STEP.md`
- `MEMORY.md`

## Verification Commands

- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run test -- 'test/kernel/*.test.ts' 'test/application/refine/*.test.ts' 'test/replay-refinement/*.test.ts'`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`

## High-Churn Files

- `apps/agent-runtime/src/kernel/pi-agent-loop.ts`
- `apps/agent-runtime/src/kernel/pi-agent-tool-adapter.ts`
- `apps/agent-runtime/src/kernel/pi-agent-tool-hooks.ts`
- `apps/agent-runtime/src/application/refine/refine-workflow.ts`
- `apps/agent-runtime/src/application/refine/react-refinement-run-executor.ts`
- `apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts`
- tests under `apps/agent-runtime/test/kernel/**` and refine application tests

## Phase 2 Acceptance

- [x] `kernel` no longer imports product domain types directly
- [x] `kernel` no longer imports concrete infrastructure directly
- [x] application-owned code maps product state into engine-facing contracts
- [x] architecture lint reflects the new narrower kernel truth
- [x] focused kernel/refine tests and repo-wide verification are green

## Task 1: Inventory Current Kernel Leakage

**Files:**
- Modify: `docs/project/current-state.md`
- Modify: `PROGRESS.md`

- [x] **Step 1: Record the current `kernel` import leakage**
- [x] **Step 2: Enumerate which imports are product-domain and which are infrastructure**
- [x] **Step 3: Mark the removal target for each leak**
- [ ] **Step 4: Commit**

## Task 2: Extract Engine-Facing Contracts

**Files:**
- Modify: `apps/agent-runtime/src/contracts/**`
- Modify: `apps/agent-runtime/src/kernel/**`
- Test: `apps/agent-runtime/test/kernel/**`

- [x] **Step 1: Write failing kernel tests for contract-based execution state**
- [x] **Step 2: Introduce the minimal engine-facing contracts needed by `kernel`**
- [x] **Step 3: Replace direct domain-shaped kernel inputs with contract-shaped inputs**
- [x] **Step 4: Run focused kernel tests**
- [ ] **Step 5: Commit**

## Task 3: Move Workflow-Specific Semantics Back To Application

**Files:**
- Modify: `apps/agent-runtime/src/application/refine/**`
- Modify: `apps/agent-runtime/src/kernel/**`
- Test: `apps/agent-runtime/test/application/refine/**`

- [ ] **Step 1: Write failing refine workflow/executor tests for app-owned mapping**
- [ ] **Step 2: Move product-specific log/session/knowledge shaping out of kernel**
- [ ] **Step 3: Keep kernel limited to generic execution protocols**
- [ ] **Step 4: Run focused refine tests**
- [ ] **Step 5: Commit**

## Task 4: Remove Concrete Infrastructure Reach From Kernel

**Files:**
- Modify: `apps/agent-runtime/src/kernel/**`
- Modify: `apps/agent-runtime/src/application/refine/**`
- Test: `apps/agent-runtime/test/kernel/**`

- [x] **Step 1: Write failing tests that prove kernel no longer depends on concrete infra**
- [x] **Step 2: Inject infra-backed behavior through contracts and application-owned assembly**
- [x] **Step 3: Update lint rules and the canonical exception ledger in the design spec**
- [x] **Step 4: Run focused tests and `lint:arch`**
- [ ] **Step 5: Commit**

## Task 5: Sync Docs And Verify

**Files:**
- Modify: `docs/architecture/layers.md`
- Modify: `docs/project/current-state.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

- [x] **Step 1: Update docs to reflect the narrowed kernel truth**
- [x] **Step 2: Point `NEXT_STEP.md` at Phase 3 assembly centralization**
- [x] **Step 3: Run full verification**
- [ ] **Step 4: Commit**
