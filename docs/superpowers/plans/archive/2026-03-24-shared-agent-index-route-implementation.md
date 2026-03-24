# Shared Agent Index Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec Path:** `docs/superpowers/specs/2026-03-24-shared-agent-index-route-design.md`

**Goal:** Update the shared route surface so `AGENT_INDEX` makes `test-driven-development` the default coding route, treats `harness:refactor` as structural triage, treats `harness:lint-test-design` as proof promotion, and adds only explicitly consumed bootstrap route hints.

**Architecture:** The implementation keeps routing explanation and machine-readable hints separate. Shared `AGENT_INDEX.md` and bootstrap skeleton `AGENT_INDEX.md` will be rewritten around the same ordered route story, while bootstrap metadata will gain only a small `refactor_route` hint surface that mirrors the already-existing `lint_test_route` idea. No hook, CI, or automation execution behavior is added in this pass.

**Tech Stack:** Markdown, TOML, shared skill metadata under `/Users/cory/.coding-cli`, repository spec and plan docs under `docs/superpowers/`.

---

## Scope Freeze

- Do not implement hook, CI, cron, or automation triggering.
- Do not redesign the governance skills themselves in this pass.
- Do not add speculative bootstrap metadata that shared routing does not explicitly explain.
- Do not expand into repository-local `AGENT_INDEX.md` rewrites beyond the shared bootstrap skeleton.

## Allowed Write Scope

- `/Users/cory/.coding-cli/AGENT_INDEX.md`
- `/Users/cory/.coding-cli/harness-bootstrap/skeleton/AGENT_INDEX.md`
- `/Users/cory/.coding-cli/harness-bootstrap/skeleton/.harness/bootstrap.toml.example`
- `/Users/cory/codes/Sasiki-dev/docs/superpowers/specs/2026-03-24-shared-agent-index-route-design.md` only if implementation reveals wording drift
- `/Users/cory/codes/Sasiki-dev/docs/superpowers/plans/2026-03-24-shared-agent-index-route-implementation.md`

## Verification Commands

- `sed -n '1,240p' /Users/cory/.coding-cli/AGENT_INDEX.md`
- `sed -n '1,240p' /Users/cory/.coding-cli/harness-bootstrap/skeleton/AGENT_INDEX.md`
- `sed -n '1,240p' /Users/cory/.coding-cli/harness-bootstrap/skeleton/.harness/bootstrap.toml.example`
- `rg -n "refactor_route|lint_test_route|test-driven-development|harness:refactor|harness:lint-test-design|harness:doc-health" /Users/cory/.coding-cli/AGENT_INDEX.md /Users/cory/.coding-cli/harness-bootstrap/skeleton/AGENT_INDEX.md /Users/cory/.coding-cli/harness-bootstrap/skeleton/.harness/bootstrap.toml.example`
- `git -C /Users/cory/codes/Sasiki-dev diff --check`

## Evidence Location

- shared route files under `/Users/cory/.coding-cli/`
- the saved spec and implementation plan under `/Users/cory/codes/Sasiki-dev/docs/superpowers/`

## File Map

- Modify:
  - `/Users/cory/.coding-cli/AGENT_INDEX.md`
  - `/Users/cory/.coding-cli/harness-bootstrap/skeleton/AGENT_INDEX.md`
  - `/Users/cory/.coding-cli/harness-bootstrap/skeleton/.harness/bootstrap.toml.example`
  - `/Users/cory/codes/Sasiki-dev/docs/superpowers/specs/2026-03-24-shared-agent-index-route-design.md` only if wording drift surfaces

## Task 1: Rewrite The Shared `AGENT_INDEX` Around Ordered Governance Routing

**Files:**
- Modify: `/Users/cory/.coding-cli/AGENT_INDEX.md`

- [ ] **Step 1: Rewrite the coding route so `test-driven-development` is the default first route**
  - Keep feature and bugfix coding anchored on `test-driven-development`.
  - Remove any implication that `harness:refactor` is a peer first-choice implementation route.

- [ ] **Step 2: Add explicit overlay and promotion wording**
  - State that structural conditions may add `harness:refactor` triage.
  - State that recurring or mechanizable findings promote into `harness:lint-test-design`.
  - Keep `harness:doc-health` scoped to truth sync and pointer drift.

- [ ] **Step 3: Tighten the route section so it reads as ordered guidance, not a flat taxonomy**
  - Preserve the other Superpowers routes.
  - Keep the governance split section aligned with the new route story.

- [ ] **Step 4: Verify the shared route text**
  - Run:
    - `sed -n '1,240p' /Users/cory/.coding-cli/AGENT_INDEX.md`
    - `rg -n "test-driven-development|harness:refactor|harness:lint-test-design|harness:doc-health" /Users/cory/.coding-cli/AGENT_INDEX.md`
  - Expected:
    - clear sequencing
    - no flat-route ambiguity about TDD versus refactor versus lint-test-design

- [ ] **Step 5: Commit**
  - Suggested message: `docs: clarify shared agent index governance routing`

## Task 2: Align The Bootstrap Skeleton `AGENT_INDEX` To The Same Route Story

**Files:**
- Modify: `/Users/cory/.coding-cli/harness-bootstrap/skeleton/AGENT_INDEX.md`

- [ ] **Step 1: Rewrite the skeleton route wording to mirror the shared route model**
  - Keep repository bootstrap/setup entries.
  - Make `test-driven-development` the default coding route.
  - Describe `harness:refactor` as structural triage and `harness:lint-test-design` as proof promotion.

- [ ] **Step 2: Keep commit-time language as a deferred automation note, not the main route story**
  - Retain mention that bootstrap metadata may declare a local commit-time `harness:refactor` gate.
  - Do not let that note dominate the route hierarchy.

- [ ] **Step 3: Verify the skeleton route text**
  - Run:
    - `sed -n '1,240p' /Users/cory/.coding-cli/harness-bootstrap/skeleton/AGENT_INDEX.md`
    - `rg -n "test-driven-development|harness:refactor|harness:lint-test-design|harness:doc-health|commit-time" /Users/cory/.coding-cli/harness-bootstrap/skeleton/AGENT_INDEX.md`
  - Expected:
    - the skeleton route tells the same story as the shared fallback index
    - commit-time gate language remains secondary

- [ ] **Step 4: Commit**
  - Suggested message: `docs: align bootstrap skeleton routing model`

## Task 3: Add The Minimal `refactor_route` Hint Surface And Reconfirm Hint Limits

**Files:**
- Modify: `/Users/cory/.coding-cli/harness-bootstrap/skeleton/.harness/bootstrap.toml.example`
- Modify: `/Users/cory/codes/Sasiki-dev/docs/superpowers/specs/2026-03-24-shared-agent-index-route-design.md` only if wording drift surfaces

- [ ] **Step 1: Add the minimal `[governance.refactor_route]` hint block**
  - Include only the fields approved by the spec:
    - `preferred`
    - `path_hints`
    - `change_kinds`
  - Keep the values intentionally light and explanatory, not prescriptive.

- [ ] **Step 2: Reconfirm `lint_test_route` stays a hint, not a hidden rule engine**
  - Keep the existing `lint_test_route` block.
  - Adjust wording or example values only if needed to stay consistent with the new route story.

- [ ] **Step 3: Re-read the spec and align only if implementation exposed wording drift**
  - Do not widen the scope.
  - Only update the spec if the approved fields or route story needed a precise wording correction.

- [ ] **Step 4: Run final verification**
  - Run all commands in the Verification Commands section.
  - Confirm `git -C /Users/cory/codes/Sasiki-dev diff --check` is clean.

- [ ] **Step 5: Commit**
  - Suggested message: `docs: add shared bootstrap route hints`

## Completion Checklist

- [ ] shared `AGENT_INDEX.md` makes `test-driven-development` the default coding route
- [ ] shared `AGENT_INDEX.md` treats `harness:refactor` as structural triage, not a peer first route
- [ ] shared `AGENT_INDEX.md` treats `harness:lint-test-design` as proof promotion
- [ ] shared `AGENT_INDEX.md` keeps `harness:doc-health` scoped to truth sync
- [ ] bootstrap skeleton `AGENT_INDEX.md` matches the same route story
- [ ] bootstrap TOML example has only explicitly consumed route hints
- [ ] no hook/CI/automation behavior was added in this pass
