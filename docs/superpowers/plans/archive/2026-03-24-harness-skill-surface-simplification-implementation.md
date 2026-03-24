# Harness Skill Surface Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec Path:** `docs/superpowers/specs/2026-03-24-harness-skill-surface-simplification-design.md`

**Goal:** Simplify the shared Harness governance skill surface so `harness:refactor` and `harness:lint-test-design` each reduce to one required entry file plus one optional playbook, with low-frequency checklist/example/template sprawl removed.

**Architecture:** This plan keeps the change intentionally narrow. It does not redesign trigger automation yet. Instead it rewrites the two shared skills around a stable `SKILL.md + PLAYBOOK.md` shape, deletes redundant support files, and only updates adjacent wording where stale references would otherwise break the new surface.

**Tech Stack:** Markdown, shared Codex skill packs under `/Users/cory/.coding-cli`, repository specs and plans under `docs/superpowers/`.

---

## Scope Freeze

- Do not redesign commit-time, CI-time, or periodic governance triggering in this pass.
- Do not merge `harness:refactor` and `harness:lint-test-design` into a single skill.
- Do not expand the work into repository-specific route rewrites beyond removing stale references to deleted files.
- Optimize for fewer files and a clearer default path, not archival completeness.

## Allowed Write Scope

- `/Users/cory/.coding-cli/skills/harness-refactor/**`
- `/Users/cory/.coding-cli/skills/harness-lint-test-design/**`
- `/Users/cory/codes/Sasiki-dev/docs/superpowers/specs/2026-03-24-harness-skill-surface-simplification-design.md`
- `/Users/cory/codes/Sasiki-dev/docs/superpowers/plans/2026-03-24-harness-skill-surface-simplification-implementation.md`

## Verification Commands

- `sed -n '1,220p' /Users/cory/.coding-cli/skills/harness-refactor/SKILL.md`
- `sed -n '1,240p' /Users/cory/.coding-cli/skills/harness-refactor/PLAYBOOK.md`
- `sed -n '1,240p' /Users/cory/.coding-cli/skills/harness-lint-test-design/SKILL.md`
- `sed -n '1,260p' /Users/cory/.coding-cli/skills/harness-lint-test-design/PLAYBOOK.md`
- `find /Users/cory/.coding-cli/skills/harness-refactor -maxdepth 2 -type f | sort`
- `find /Users/cory/.coding-cli/skills/harness-lint-test-design -maxdepth 2 -type f | sort`
- `rg -n "checklists/|examples/|templates/|references/" /Users/cory/.coding-cli/skills/harness-refactor/SKILL.md /Users/cory/.coding-cli/skills/harness-refactor/PLAYBOOK.md /Users/cory/.coding-cli/skills/harness-lint-test-design/SKILL.md /Users/cory/.coding-cli/skills/harness-lint-test-design/PLAYBOOK.md`
- `git -C /Users/cory/codes/Sasiki-dev diff --check`

## Evidence Location

- the two simplified skill directories under `/Users/cory/.coding-cli/skills/`
- the saved spec and implementation plan under `/Users/cory/codes/Sasiki-dev/docs/superpowers/`

## File Map

- Create:
  - `/Users/cory/.coding-cli/skills/harness-refactor/PLAYBOOK.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/PLAYBOOK.md`
- Modify:
  - `/Users/cory/.coding-cli/skills/harness-refactor/SKILL.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/SKILL.md`
  - `/Users/cory/codes/Sasiki-dev/docs/superpowers/specs/2026-03-24-harness-skill-surface-simplification-design.md` only if implementation reveals wording drift
- Delete:
  - `/Users/cory/.coding-cli/skills/harness-refactor/checklists/governance-mode-checklist.md`
  - `/Users/cory/.coding-cli/skills/harness-refactor/checklists/review-mode-checklist.md`
  - `/Users/cory/.coding-cli/skills/harness-refactor/examples/governance-follow-up.example.md`
  - `/Users/cory/.coding-cli/skills/harness-refactor/examples/review-findings.example.md`
  - `/Users/cory/.coding-cli/skills/harness-refactor/references/agent-architecture-principles.md`
  - `/Users/cory/.coding-cli/skills/harness-refactor/references/boundary-contracts.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/checklists/lint-test-design-checklist.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/examples/file-budget-and-coverage.example.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/examples/layered-boundaries.example.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/references/exception-governance.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/references/invariant-model.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/references/lint-rule-taxonomy.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/references/severity-ladder.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/references/test-taxonomy.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/references/verification-evidence.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/templates/lint-rule-matrix.template.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/templates/lint-test-exception-policy.template.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/templates/ratchet-plan.template.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/templates/structural-proof-matrix.template.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/templates/structural-test-cases.template.md`
  - `/Users/cory/.coding-cli/skills/harness-lint-test-design/templates/test-strategy-matrix.template.md`

## Task 1: Collapse `harness:refactor` To A Two-File Surface

**Files:**
- Create: `/Users/cory/.coding-cli/skills/harness-refactor/PLAYBOOK.md`
- Modify: `/Users/cory/.coding-cli/skills/harness-refactor/SKILL.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-refactor/checklists/governance-mode-checklist.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-refactor/checklists/review-mode-checklist.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-refactor/examples/governance-follow-up.example.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-refactor/examples/review-findings.example.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-refactor/references/agent-architecture-principles.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-refactor/references/boundary-contracts.md`

- [ ] **Step 1: Rewrite `SKILL.md` as the only required entrypoint**
  - Keep only entry material:
    - purpose
    - when to use and not use
    - `review mode` and `governance follow-up mode`
    - minimal flow
    - required output
    - boundary with `harness:lint-test-design` and `harness:doc-health`
    - one short commit-time gate note
  - Remove inline references that require opening the old checklist/example/reference files.

- [ ] **Step 2: Create `PLAYBOOK.md` with the judgment-heavy content**
  - Move over the durable decision aids:
    - what counts as architecture drift
    - severity ladder
    - action shape selection
    - scope-bounding rules
    - when to promote findings into `harness:lint-test-design`
  - Keep only one or two compact, high-signal examples.

- [ ] **Step 3: Delete the no-longer-needed support files**
  - Remove the old checklist, example, and reference files listed above.
  - Do not leave placeholder directories unless another file still requires them.

- [ ] **Step 4: Verify the new surface**
  - Run:
    - `sed -n '1,220p' /Users/cory/.coding-cli/skills/harness-refactor/SKILL.md`
    - `sed -n '1,240p' /Users/cory/.coding-cli/skills/harness-refactor/PLAYBOOK.md`
    - `find /Users/cory/.coding-cli/skills/harness-refactor -maxdepth 2 -type f | sort`
  - Expected:
    - the skill reads cleanly without auxiliary files
    - the directory contains only `SKILL.md` and `PLAYBOOK.md`

- [ ] **Step 5: Commit**
  - Suggested message: `docs: simplify harness refactor skill surface`

## Task 2: Collapse `harness:lint-test-design` To A Two-File Surface

**Files:**
- Create: `/Users/cory/.coding-cli/skills/harness-lint-test-design/PLAYBOOK.md`
- Modify: `/Users/cory/.coding-cli/skills/harness-lint-test-design/SKILL.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/checklists/lint-test-design-checklist.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/examples/file-budget-and-coverage.example.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/examples/layered-boundaries.example.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/references/exception-governance.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/references/invariant-model.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/references/lint-rule-taxonomy.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/references/severity-ladder.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/references/test-taxonomy.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/references/verification-evidence.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/templates/lint-rule-matrix.template.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/templates/lint-test-exception-policy.template.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/templates/ratchet-plan.template.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/templates/structural-proof-matrix.template.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/templates/structural-test-cases.template.md`
- Delete: `/Users/cory/.coding-cli/skills/harness-lint-test-design/templates/test-strategy-matrix.template.md`

- [ ] **Step 1: Rewrite `SKILL.md` around the minimal decision entry**
  - Keep only:
    - purpose
    - when to trigger it
    - target state, current truth, transition model
    - output families
    - minimal execution flow
    - boundary with `test-driven-development`, `harness:refactor`, and `harness:doc-health`
  - Strip the expectation that the default path writes large matrices or template-driven artifacts.

- [ ] **Step 2: Create `PLAYBOOK.md` for governance judgment**
  - Move over the reusable logic for choosing:
    - lint
    - structural or boundary test
    - behavior test
    - coverage expectation
    - temporary exception with ratchet
  - Keep only the minimum exception governance and ratchet guidance needed for common use.
  - Preserve one or two compact promotion examples.

- [ ] **Step 3: Delete the old checklist, reference, example, and template files**
  - Remove the files listed above.
  - Keep the resulting directory intentionally small even if that means less archival material.

- [ ] **Step 4: Verify the new surface**
  - Run:
    - `sed -n '1,240p' /Users/cory/.coding-cli/skills/harness-lint-test-design/SKILL.md`
    - `sed -n '1,260p' /Users/cory/.coding-cli/skills/harness-lint-test-design/PLAYBOOK.md`
    - `find /Users/cory/.coding-cli/skills/harness-lint-test-design -maxdepth 2 -type f | sort`
  - Expected:
    - the skill reads cleanly without requiring checklist/template browsing
    - the directory contains only `SKILL.md` and `PLAYBOOK.md`

- [ ] **Step 5: Commit**
  - Suggested message: `docs: simplify harness lint-test-design skill surface`

## Task 3: Remove Stale Cross-References And Reconfirm The Boundary

**Files:**
- Modify: `/Users/cory/.coding-cli/skills/harness-refactor/SKILL.md`
- Modify: `/Users/cory/.coding-cli/skills/harness-refactor/PLAYBOOK.md`
- Modify: `/Users/cory/.coding-cli/skills/harness-lint-test-design/SKILL.md`
- Modify: `/Users/cory/.coding-cli/skills/harness-lint-test-design/PLAYBOOK.md`
- Modify: `/Users/cory/codes/Sasiki-dev/docs/superpowers/specs/2026-03-24-harness-skill-surface-simplification-design.md` only if wording drift surfaced during implementation

- [ ] **Step 1: Search for stale references to deleted support files**
  - Run:
    - `rg -n "checklists/|examples/|templates/|references/" /Users/cory/.coding-cli/skills/harness-refactor/SKILL.md /Users/cory/.coding-cli/skills/harness-refactor/PLAYBOOK.md /Users/cory/.coding-cli/skills/harness-lint-test-design/SKILL.md /Users/cory/.coding-cli/skills/harness-lint-test-design/PLAYBOOK.md`
  - Expected:
    - no stale references to deleted internal files remain unless explicitly intentional.

- [ ] **Step 2: Tighten adjacent-skill boundary wording**
  - Make sure `harness:refactor` clearly says it discovers architecture drift and promotes recurring issues into `harness:lint-test-design`.
  - Make sure `harness:lint-test-design` clearly says it complements `test-driven-development` instead of replacing it.
  - Keep trigger automation discussion minimal and deferred.

- [ ] **Step 3: Re-read the saved spec and align if needed**
  - Check whether implementation forced any small wording correction in the spec.
  - Only update the spec if the implementation reveals a real mismatch.

- [ ] **Step 4: Run final verification**
  - Run all commands in the Verification Commands section.
  - Confirm `git -C /Users/cory/codes/Sasiki-dev diff --check` is clean.

- [ ] **Step 5: Commit**
  - Suggested message: `docs: finalize harness governance skill simplification`

## Completion Checklist

- [ ] `harness:refactor` now has only `SKILL.md` and `PLAYBOOK.md`
- [ ] `harness:lint-test-design` now has only `SKILL.md` and `PLAYBOOK.md`
- [ ] the default path no longer depends on checklist, example, template, or reference browsing
- [ ] adjacent-skill boundaries are clearly stated in both skills
- [ ] no stale references to deleted support files remain
- [ ] the saved spec still matches the implemented file structure
