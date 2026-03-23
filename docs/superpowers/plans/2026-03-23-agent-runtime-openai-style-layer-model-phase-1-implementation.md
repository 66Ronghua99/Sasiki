# Agent Runtime OpenAI-Style Layer Model Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the `apps/agent-runtime/src` end-state layer model into repo-local docs, architecture lint, and structural proof so future work can ratchet toward a narrower OpenAI Harness-style dependency graph without attempting the full refactor in one pass.

**Architecture:** Phase 1 is a governance-and-hardgate slice, not a source-tree migration slice. The work should encode the new target layer model, introduce a phase-1 exception ledger instead of silently widening rules, strengthen `lint:arch` around top-level roots and sublayer edges, and add focused baseline tests that prove the current transitional singleton owners and lint behavior. The current `kernel` remains transitional in this phase; the code is not yet required to satisfy the full end state as long as every known mismatch is either enforced, explicitly exempted, or documented.

**Tech Stack:** TypeScript, Node 20, project-local architecture lint (`apps/agent-runtime/scripts/lint-architecture.mjs`), Node test runner, Markdown docs, Harness governance docs.

---

## Scope Freeze

- This plan implements **Phase 1 only** from [`2026-03-23-agent-runtime-openai-style-layer-model-design.md`](/Users/cory/codes/Sasiki-dev/docs/superpowers/specs/2026-03-23-agent-runtime-openai-style-layer-model-design.md).
- This plan does **not** perform the Phase 2 kernel narrowing refactor.
- This plan does **not** centralize all concrete adapter assembly into shell if the current code still needs transition seams.
- This plan does **not** rename `contracts/` to `ports/`.
- This plan does **not** move `application/refine/tools/runtime/*` out of application yet; it only freezes and guards the role as a transitional seam.

## Allowed Write Scope

- `apps/agent-runtime/scripts/lint-architecture.mjs`
- `apps/agent-runtime/scripts/tests/**`
- `apps/agent-runtime/test/application/layer-boundaries.test.ts`
- `docs/superpowers/specs/2026-03-23-agent-runtime-openai-style-layer-model-design.md`
- `docs/superpowers/plans/2026-03-23-agent-runtime-openai-style-layer-model-phase-1-implementation.md`
- `docs/architecture/layers.md`
- `docs/architecture/overview.md`
- `docs/project/current-state.md`
- `PROGRESS.md`
- `NEXT_STEP.md`
- `MEMORY.md`

## Verification Commands

- `npm --prefix apps/agent-runtime run lint:docs`
- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run test -- test/application/layer-boundaries.test.ts`
- `node --test apps/agent-runtime/scripts/tests/*.test.mjs`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`

## Evidence Location

- `artifacts/code-gate/<timestamp>/report.json`

## File Map

### Docs and governance truth

- Modify: `docs/superpowers/specs/2026-03-23-agent-runtime-openai-style-layer-model-design.md`
  - Add current-to-target mapping and initial exception ledger
- Modify: `docs/architecture/layers.md`
  - Align front-door dependency direction with the new end-state model and phase-1 caveats
- Modify: `docs/architecture/overview.md`
  - Clarify that `kernel` is still transitional in phase 1 and that shell is the intended end-state concrete assembly owner while specific non-shell assembly seams remain explicit phase-1 exceptions
- Modify: `docs/project/current-state.md`
  - Record the active governance initiative and what phase 1 actually changes
- Modify: `PROGRESS.md`
  - Record the phase-1 layer-model hardgate effort
- Modify: `NEXT_STEP.md`
  - Point to the next direct action after phase 1 lands
- Modify: `MEMORY.md`
  - Capture stable rules about end-state model vs phase-1 enforcement

### Lint and proof

- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`
  - Add top-level root allowlist
  - Add blanket bans for `src/runtime/*` and `src/core/*`
  - Add phase-1 rule matrix for `application/*` sublayers
  - Add rule matrix for `application/refine/tools/*`
  - Add explicit exception ledger support for known transitional files
- Modify: `apps/agent-runtime/scripts/tests/lint-architecture.cycle.test.mjs`
  - Keep existing cycle proof green while adapting to the new allowlist if needed
- Create: `apps/agent-runtime/scripts/tests/lint-architecture.roots.test.mjs`
  - Prove unknown top-level roots fail
- Create: `apps/agent-runtime/scripts/tests/lint-architecture.layer-edges.test.mjs`
  - Prove forbidden layer edges fail and allowed edges pass
- Create: `apps/agent-runtime/scripts/tests/lint-architecture.refine-tools.test.mjs`
  - Prove `definitions/runtime/composition` role edges
- Modify: `apps/agent-runtime/test/application/layer-boundaries.test.ts`
  - Add singleton-owner and transition-proof assertions that fit phase 1

## Phase 1 Acceptance

- [ ] End-state `src` model is documented and explicitly marked as a multi-phase migration target
- [ ] Phase-1 exception ledger exists and lists current known mismatches rather than widening rules silently
- [ ] `lint:arch` rejects unknown top-level roots, new `src/runtime/*`, new `src/core/*`, forbidden workflow horizontal edges, and forbidden refine-tools role edges
- [ ] `lint:arch` keeps existing cycle detection and file size budgets intact
- [ ] Structural tests prove shell singleton ownership and workflow-runtime handoff boundaries at the phase-1 level
- [ ] Front-door docs and progress docs are synchronized with the phase-1 governance effort
- [ ] Full project verification is green with fresh evidence

## Task 1: Freeze Phase 1 Governance Truth

**Files:**
- Modify: `docs/superpowers/specs/2026-03-23-agent-runtime-openai-style-layer-model-design.md`
- Modify: `docs/architecture/layers.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/project/current-state.md`

- [ ] **Step 1: Extend the design spec with current-to-target mapping and an initial exception ledger**

Add sections that enumerate:
- current transitional `kernel` files
- non-shell application files still touching infrastructure
- refine-tool runtime seams that remain transitional in phase 1

- [ ] **Step 2: Align front-door architecture docs with phase-1 wording**

Update `docs/architecture/layers.md` and `docs/architecture/overview.md` so they explicitly say:
- the end state is narrower than current code
- phase 1 hardens the model without promising the full refactor
- shell remains the intended singleton assembly owner in the end state
- current non-shell assembly seams remain transitional exceptions until Phase 3

- [ ] **Step 3: Sync current-state doc**

Add a short entry describing:
- phase-1 objective
- what hard gates will change
- what is deliberately deferred to later phases

- [ ] **Step 4: Run doc lint**

Run: `npm --prefix apps/agent-runtime run lint:docs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-03-23-agent-runtime-openai-style-layer-model-design.md docs/architecture/layers.md docs/architecture/overview.md docs/project/current-state.md
git commit -m "docs: freeze phase 1 layer model governance"
```

## Task 2: Encode Top-Level Roots And Phase-1 Layer Rules In Lint

**Files:**
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`

- [ ] **Step 1: Enumerate the failing cases the new lint must reject**

Before modifying lint logic, explicitly list the cases to support in Task 3 fixture tests:
- `src/shared/foo.ts`
- `src/runtime/new-file.ts`
- `application/observe/foo.ts -> ../refine/bar.js`
- `application/refine/tools/definitions/foo.ts -> ../runtime/bar.js`

- [ ] **Step 2: Add top-level root allowlist**

Teach `lint-architecture.mjs` to reject any top-level directory outside the approved set for phase 1:
- `application`
- `contracts`
- `domain`
- `infrastructure`
- `kernel`
- `utils`

Root-level `index.ts` should remain allowed.

- [ ] **Step 3: Add blanket bans for deprecated roots**

Add hard failures for any `src/runtime/*` or `src/core/*` path, not just a finite historical list.

- [ ] **Step 4: Add `application/*` sublayer edge checks**

Encode at least these phase-1 rules:
- `shell` may depend on `config`, workflow modules, and infrastructure
- `config` may not depend on shell or infrastructure source loaders
- `observe`, `compact`, and `refine` may not import each other
- non-shell application files may not import direct infrastructure unless covered by an explicit phase-1 exception

- [ ] **Step 5: Add `application/refine/tools/*` role checks**

Encode:
- `definitions` cannot import `runtime`
- `definitions` cannot import infrastructure
- `runtime` cannot import `definitions`
- composition-core files may connect the roles

- [ ] **Step 6: Add explicit exception-ledger plumbing**

Represent known phase-1 exceptions in one place inside `lint-architecture.mjs` with:
- file path
- rule id
- short reason

The rule should fail for new violations while tolerating only the listed transitional cases.

- [ ] **Step 7: Run lint architecture**

Run: `npm --prefix apps/agent-runtime run lint:arch`
Expected: PASS after rule updates and exception ledger entries are complete

- [ ] **Step 8: Commit**

```bash
git add apps/agent-runtime/scripts/lint-architecture.mjs
git commit -m "lint: encode phase 1 layer model rules"
```

## Task 3: Add Focused Lint Fixture Tests

**Files:**
- Modify: `apps/agent-runtime/scripts/tests/lint-architecture.cycle.test.mjs`
- Create: `apps/agent-runtime/scripts/tests/lint-architecture.roots.test.mjs`
- Create: `apps/agent-runtime/scripts/tests/lint-architecture.layer-edges.test.mjs`
- Create: `apps/agent-runtime/scripts/tests/lint-architecture.refine-tools.test.mjs`

- [ ] **Step 1: Write the failing root-allowlist fixture test**

Add a fixture test that creates:

```ts
// src/shared/stray.ts
export const stray = 1;
```

Expected: `analyzeArchitecture()` reports a root/path violation.

- [ ] **Step 2: Write the failing deprecated-root fixture test**

Add a fixture test that creates:

```ts
// src/runtime/new-file.ts
export const runtimeLeak = true;
```

Expected: `analyzeArchitecture()` reports a deprecated-root violation.

- [ ] **Step 3: Write the failing workflow-horizontal-edge fixture test**

Add a fixture test that creates:

```ts
// src/application/observe/foo.ts
import "../refine/bar.js";
```

Expected: `analyzeArchitecture()` reports a workflow boundary violation.

- [ ] **Step 4: Write the failing refine-tools-role fixture test**

Add a fixture test that creates:

```ts
// src/application/refine/tools/definitions/a.ts
import "../runtime/b.js";
```

Expected: `analyzeArchitecture()` reports a refine-tools role violation.

- [ ] **Step 5: Update the cycle proof if the new allowlist changes the fixture root**

Adjust the existing cycle fixture if the new allowlist requires replacing `core/` with an allowed root such as `application/refine/` or `kernel/`.

- [ ] **Step 6: Run script-level lint tests after the Task 2 rule changes**

Run: `node --test apps/agent-runtime/scripts/tests/*.test.mjs`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/agent-runtime/scripts/tests
git commit -m "test: add architecture lint fixture coverage"
```

## Task 4: Tighten Structural Boundary Proofs

**Files:**
- Modify: `apps/agent-runtime/test/application/layer-boundaries.test.ts`

- [ ] **Step 1: Write failing assertions for singleton owners**

Add assertions that encode phase-1 architectural truth:
- only `runtime-composition-root.ts` assembles concrete browser/MCP/telemetry infrastructure
- `workflow-runtime.ts` does not construct low-level browser/MCP adapters directly
- `runtime-host.ts` remains the only top-level lifecycle owner

- [ ] **Step 2: Add assertions for workflow isolation and transition seams**

Add assertions that:
- `observe`, `compact`, and `refine` stay out of each other’s trees
- direct infrastructure imports that remain in phase 1 are intentional and stable
- no legacy `src/runtime/*` or `src/core/*` files regrow

- [ ] **Step 3: Run focused structural tests**

Run: `npm --prefix apps/agent-runtime run test -- test/application/layer-boundaries.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/agent-runtime/test/application/layer-boundaries.test.ts
git commit -m "test: strengthen phase 1 architecture boundaries"
```

## Task 5: Sync Handoff Docs And Final Verification

**Files:**
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

- [ ] **Step 1: Update `PROGRESS.md`**

Record:
- the new phase-1 layer-model hardgate baseline
- the exception-ledger concept
- the fresh evidence path once verification passes

- [ ] **Step 2: Update `MEMORY.md`**

Capture stable lessons:
- end state is stricter than phase 1
- phase-1 exceptions are explicit and must not silently grow
- shell remains the only top-level concrete assembly owner

- [ ] **Step 3: Update `NEXT_STEP.md`**

Replace the pointer with the next direct action after phase 1. Recommended pointer:
- begin Phase 2 by narrowing `kernel/pi-agent-loop.ts` away from domain and infrastructure dependencies

- [ ] **Step 4: Run full verification**

Run:
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`

Expected:
- all commands PASS
- fresh hardgate evidence written under `artifacts/code-gate/<timestamp>/report.json`

- [ ] **Step 5: Commit**

```bash
git add PROGRESS.md NEXT_STEP.md MEMORY.md
git commit -m "docs: sync phase 1 layer model baseline"
```

## Execution Notes

- Do not “fix” phase-2 or phase-3 architectural debt inside this plan unless it directly blocks a phase-1 hard gate.
- Prefer the narrowest exception ledger possible. If a rule needs many exceptions, tighten the rule definition instead of normalizing drift.
- Keep lint error messages actionable and specific. The failure message should tell the next worker what owner or seam they should use instead.
- Preserve existing green behavior while adding stronger phase-1 enforcement.

## Handoff

After implementation, report:

- which phase-1 hard gates were added
- which phase-1 exceptions remain
- where the fresh verification evidence lives
- whether Phase 2 kernel narrowing can start immediately
