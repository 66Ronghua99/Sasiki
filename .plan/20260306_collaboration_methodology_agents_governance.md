# Collaboration Methodology Governance for User-Level AGENTS.md (2026-03-06)

## 1. Problem Statement
Current pain:
- Existing root `AGENTS.md` mainly documents repository structure and build commands, but does not encode the collaboration operating model that has proven effective.
- The team now relies on a high-discipline workflow (`PRD -> phased plan -> checklist -> implementation -> evidence`) that is not yet formalized as a first-class governance contract.
- Without a single canonical method doc, future sessions risk process drift: inconsistent context loading, unclear file ownership, weak stage gates.

Constraints:
- Keep runtime technical guidance (project structure, commands, quality gates).
- Add clear file ownership contracts for `PROGRESS.md / MEMORY.md / NEXT_STEP.md / .plan/*.md`.
- Make progressive loading explicit to reduce context expansion cost.

Non-goals:
- No runtime behavior/code logic change.
- No historical document migration in this iteration.

## 2. Boundary & Ownership
- `AGENTS.md`
  - Becomes user-level collaboration operating system (principles, phases, gate criteria, file contracts).
- `PROGRESS.md`
  - Adds reference to new governance design artifact and marks governance baseline as DONE.
- `MEMORY.md`
  - Adds reusable governance rule for process control and anti-drift.
- `.plan/*`
  - Store this governance design decision and checklist for traceability.

## 3. Options & Tradeoffs
Option A: Keep current AGENTS, append a small section
- Pros: low effort.
- Cons: method remains fragmented; weak enforceability.
- Rejected.

Option B: Full AGENTS rewrite as collaboration OS (Chosen)
- Pros: single source of truth for collaboration method; easier onboarding; consistent control quality.
- Cons: larger one-time doc migration.

Option C: Put methodology only in `.plan` docs
- Pros: no top-level doc churn.
- Cons: discoverability poor; easy to miss in execution.
- Rejected.

## 4. Migration Plan
1. Create this design doc and checklist under `.plan/`.
2. Rewrite `AGENTS.md` with:
   - core principles
   - staged workflow and gate criteria
   - progressive context loading rules
   - file ownership and update contracts
   - PRD/plan/checklist conventions
   - quality gates and DoD
3. Sync `PROGRESS.md` reference list and DONE status.
4. Sync `MEMORY.md` governance heuristics.
5. Run quality gates and report.

Rollback point:
- Revert `AGENTS.md` to previous repository guideline version if collaboration friction increases.

## 5. Test Strategy
Validation checks:
- Structural checks:
  - `AGENTS.md` includes: principles, phase flow, file ownership, progressive loading, checklist execution.
- Consistency checks:
  - `PROGRESS.md` and `MEMORY.md` reference the new governance baseline.
- Operational checks:
  - Existing quality gates remain executable and unchanged.

Acceptance:
- User can use only `AGENTS.md + PROGRESS + NEXT_STEP` to understand next action and governance expectations.
- Process artifacts (`PRD/plan/checklist`) have clear naming and reference rules.
