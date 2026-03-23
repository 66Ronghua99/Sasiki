# Refine Tools Service Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec Path:** `docs/superpowers/specs/2026-03-23-refine-tools-service-consolidation-design.md`

**Goal:** Remove the remaining refine-tools exception-ledger seam by collapsing `definitions -> providers -> runtime` into `definitions -> services`, while preserving the frozen refine tool contracts and the `RefineReactToolClient` rebinding behavior.

**Architecture:** The implementation introduces `browserService` and `runService` as the only durable owners of refine tool behavior and run-scoped rebinding. `definitions/*` will call services directly through typed context access, `providers/*` will be deleted, old `runtime/*` active-path behavior will be renamed into `services/*`, and lint plus structural tests will ratchet the new ownership model so the old seam cannot regrow.

**Tech Stack:** TypeScript, Node 20, Node test runner, architecture lint, Harness governance docs.

---

## Scope Freeze

- Do not change the 12 refine-agent-facing tool names or their schemas.
- Do not change prompt semantics, HITL policy, knowledge ranking policy, screenshot compatibility fallback, or run success semantics.
- Do not broaden the work into observe, compact, shell, or kernel refactors beyond the refine-tools seam and the tests/docs needed to prove it.
- Keep direct refine tool calls hook-free and keep pi-agent hook execution scoped to `PiAgentToolAdapter`.

## Allowed Write Scope

- `apps/agent-runtime/src/application/refine/tools/**`
- `apps/agent-runtime/src/application/refine/refine-react-tool-client.ts`
- `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
- `apps/agent-runtime/test/application/refine/**`
- `apps/agent-runtime/test/application/layer-boundaries.test.ts`
- `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
- `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`
- `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
- `apps/agent-runtime/scripts/lint-architecture.mjs`
- `apps/agent-runtime/scripts/tests/**`
- `docs/superpowers/specs/2026-03-23-refine-tools-service-consolidation-design.md`
- `docs/architecture/overview.md`
- `docs/architecture/layers.md`
- `docs/project/current-state.md`
- `PROGRESS.md`
- `NEXT_STEP.md`
- `MEMORY.md`

## Verification Commands

- `npm --prefix apps/agent-runtime run lint`
- `cd apps/agent-runtime && node --test scripts/tests/*.test.mjs`
- `npm --prefix apps/agent-runtime run test -- test/application/layer-boundaries.test.ts test/application/refine/**/*.test.ts test/replay-refinement/refine-react-tool-client.test.ts test/replay-refinement/refine-react-run-executor.test.ts test/runtime/refine-run-bootstrap-provider.test.ts`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`

## Evidence Location

- `artifacts/code-gate/<timestamp>/report.json`
- test runner output from the focused refine tool suite and full project suite

## File Map

- Create:
  - `apps/agent-runtime/src/application/refine/tools/services/refine-browser-service.ts`
  - `apps/agent-runtime/src/application/refine/tools/services/refine-run-service.ts`
  - `apps/agent-runtime/test/application/refine/refine-browser-service.test.ts`
  - `apps/agent-runtime/test/application/refine/refine-run-service.test.ts`
- Modify:
  - `apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts`
  - `apps/agent-runtime/src/application/refine/tools/refine-tool-context.ts`
  - `apps/agent-runtime/src/application/refine/refine-react-tool-client.ts`
  - `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
  - `apps/agent-runtime/src/application/refine/tools/definitions/*.ts`
  - `apps/agent-runtime/src/application/refine/tools/refine-browser-tool-registry.ts`
  - `apps/agent-runtime/src/application/refine/tools/refine-runtime-tool-registry.ts`
  - `apps/agent-runtime/test/application/layer-boundaries.test.ts`
  - `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
  - `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
  - `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`
  - `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
  - `apps/agent-runtime/scripts/lint-architecture.mjs`
  - `apps/agent-runtime/scripts/tests/**`
  - `docs/architecture/overview.md`
  - `docs/architecture/layers.md`
  - `docs/project/current-state.md`
  - `PROGRESS.md`
  - `NEXT_STEP.md`
  - `MEMORY.md`
- Delete:
  - `apps/agent-runtime/src/application/refine/tools/providers/refine-browser-provider.ts`
  - `apps/agent-runtime/src/application/refine/tools/providers/refine-runtime-provider.ts`
  - active-path `apps/agent-runtime/src/application/refine/tools/runtime/*.ts` once behavior has been moved and tests are green

## Task 1: Freeze The Rebinding Contract Around Services

**Files:**
- Create: `apps/agent-runtime/test/application/refine/refine-browser-service.test.ts`
- Create: `apps/agent-runtime/test/application/refine/refine-run-service.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- Modify: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-react-tool-client.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/services/refine-browser-service.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/services/refine-run-service.ts`

- [ ] **Step 1: Write the failing tests for service-owned rebinding**
  - Cover that browser-side behavior sees the latest session after `setSession(...)`.
  - Cover that run-side behavior sees the latest session after `setSession(...)`.
  - Cover that run-side HITL behavior sees the latest provider after `setHitlAnswerProvider(...)`.
  - Cover that `getSession()` still returns the latest session through the new service-owned model.
  - Extend existing refine-tool behavior coverage so the move from `runtime/*` into `services/*` still protects observation/action semantics while rebinding changes land.
  - Extend bootstrap-provider coverage so `RefineRunBootstrapProvider` no longer depends on a `tools/runtime/*` import for the HITL answer provider contract.

- [ ] **Step 2: Run the focused tests to verify the expected red state**
  - Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-browser-service.test.ts test/application/refine/refine-run-service.test.ts test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts test/runtime/refine-run-bootstrap-provider.test.ts`
  - Expected: failures because services or client delegation are not implemented yet.

- [ ] **Step 3: Introduce `refine-browser-service.ts` and `refine-run-service.ts` with explicit rebinding APIs**
  - Move current behavior from `tools/runtime/*` into the new services without changing tool semantics.
  - Add explicit service APIs for rebinding session and HITL answer provider.
  - Keep `RefineReactToolClient.setSession(...)`, `setHitlAnswerProvider(...)`, and `getSession()` as the stable external surface, but have them delegate to the services.
  - Replace the `HitlAnswerProvider` type dependency in `RefineRunBootstrapProvider` so bootstrap no longer points at the retiring `tools/runtime/*` path.

- [ ] **Step 4: Run focused verification**
  - Re-run the focused tests from Step 2 and confirm green so both rebinding and frozen refine-tool behavior stay intact.

- [ ] **Step 5: Commit**
  - Suggested message: `refactor: introduce refine tool services and rebinding contract`

## Task 2: Move Definitions And Context To Services

**Files:**
- Modify: `apps/agent-runtime/src/application/refine/tools/refine-tool-context.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/definitions/*.ts`
- Modify: `apps/agent-runtime/test/application/layer-boundaries.test.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`
- Modify: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`

- [ ] **Step 1: Write the failing tests or boundary proofs for direct service access**
  - Cover that definitions read `browserService` or `runService` directly from context.
  - Cover that tool-surface direct calls remain hook-free after the context shape change.
  - Cover that the executor/bootstrap path still receives the latest service-owned rebinding state.
  - Update `layer-boundaries.test.ts` so it fails while composition and tests still hard-freeze the old `providers -> runtime` shape.

- [ ] **Step 2: Run the focused tests to confirm the red state**
  - Run: `npm --prefix apps/agent-runtime run test -- test/application/layer-boundaries.test.ts test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts test/replay-refinement/refine-react-run-executor.test.ts test/runtime/refine-run-bootstrap-provider.test.ts`
  - Expected: failures due to stale provider-based context and definition lookups.

- [ ] **Step 3: Update context, composition, and definitions to the service-owned model**
  - Change the context shape from provider refs to stable service refs.
  - Update definitions to read services directly.
  - Keep argument parsing in definitions; do not let definitions call raw MCP or mutate session directly.
  - Keep `refine-tool-composition.ts` as the single service assembly point.

- [ ] **Step 4: Run focused verification**
  - Re-run the focused tests from Step 2 and confirm green.

- [ ] **Step 5: Commit**
  - Suggested message: `refactor: move refine tool definitions onto services`

## Task 3: Delete Providers And Retire The Active `runtime/*` Path

**Files:**
- Delete: `apps/agent-runtime/src/application/refine/tools/providers/refine-browser-provider.ts`
- Delete: `apps/agent-runtime/src/application/refine/tools/providers/refine-runtime-provider.ts`
- Delete/rename: `apps/agent-runtime/src/application/refine/tools/runtime/*.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts`
- Modify: `apps/agent-runtime/test/application/layer-boundaries.test.ts`
- Modify: `apps/agent-runtime/test/application/refine/**/*.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`

- [ ] **Step 1: Write the failing structural and behavior checks for provider removal**
  - Add or tighten tests so the active refine path fails if it still imports providers.
  - Add or tighten tests so the active refine path fails if it still relies on `tools/runtime/*` instead of `tools/services/*`.
  - Tighten `layer-boundaries.test.ts` so it proves the new `composition -> services` model and catches any lingering bootstrap/runtime-path imports.

- [ ] **Step 2: Run the focused tests to confirm the red state**
  - Run: `npm --prefix apps/agent-runtime run test -- test/application/layer-boundaries.test.ts test/application/refine/**/*.test.ts test/replay-refinement/refine-react-tool-client.test.ts test/runtime/refine-run-bootstrap-provider.test.ts`
  - Expected: failures due to provider/runtime references still present.

- [ ] **Step 3: Remove providers and switch all active imports to `services/*`**
  - Delete provider files.
  - Remove provider-only wiring from composition.
  - Remove or archive the active `runtime/*` path after behavior has been fully moved.
  - Confirm `RefineRunBootstrapProvider` and any remaining refine-owned consumers now reference stable service-owned contracts instead of `tools/runtime/*`.

- [ ] **Step 4: Run focused verification**
  - Re-run the focused tests from Step 2 and confirm green.

- [ ] **Step 5: Commit**
  - Suggested message: `refactor: remove refine tool providers`

## Task 4: Ratchet Lint, Proofs, And Docs To The New Steady State

**Files:**
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`
- Modify: `apps/agent-runtime/scripts/tests/**`
- Modify: `apps/agent-runtime/test/application/layer-boundaries.test.ts`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/architecture/layers.md`
- Modify: `docs/project/current-state.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

- [ ] **Step 1: Write failing lint fixtures and doc/proof updates for the old seam**
  - Add script-level lint fixtures that fail if provider/runtime split edges return.
  - Tighten structure proofs so the active refine path cannot depend on `providers/*` or old `runtime/*`.
  - Tighten structure proofs so they also fail if behavior ownership drifts back out of `services/*` or if composition stops being the only service assembly owner.

- [ ] **Step 2: Run the red-state verification**
  - Run: `cd apps/agent-runtime && node --test scripts/tests/*.test.mjs`
  - Run: `npm --prefix apps/agent-runtime run test -- test/application/layer-boundaries.test.ts`
  - Expected: failures until the lint rules and proofs match the new service-owned model.

- [ ] **Step 3: Tighten the hard gates and sync front-door docs**
  - Remove the refine-tools exception ledger allowance from architecture lint once code is clean.
  - Update docs to say the remaining refine-tools seam is gone.
  - Point `NEXT_STEP.md` at the next real product or architecture priority after this consolidation.

- [ ] **Step 4: Run full verification**
  - Run all commands listed in the Verification Commands section.
  - Record the fresh hardgate report path under `artifacts/code-gate/`.

- [ ] **Step 5: Commit**
  - Suggested message: `chore: ratchet refine tool service boundaries`

## Completion Checklist

- [ ] Spec requirements are covered
- [ ] `providers/*` is removed from the active refine path
- [ ] active-path `runtime/*` behavior has been renamed or replaced by `services/*`
- [ ] `RefineReactToolClient` rebinding contract is preserved with focused tests
- [ ] verification commands were run fresh
- [ ] evidence location is populated or explicitly noted
- [ ] repository state docs are updated
