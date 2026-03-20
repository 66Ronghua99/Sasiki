---
doc_type: plan
status: draft
implements:
  - docs/superpowers/specs/2026-03-20-harness-doc-truth-sync.md
verified_by: []
supersedes: []
related:
  - docs/superpowers/plans/2026-03-20-refine-agent-react-implementation.md
  - docs/superpowers/specs/2026-03-19-agent-architecture-redesign.md
---

# Harness Doc Truth Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec Path:** `docs/superpowers/specs/2026-03-20-harness-doc-truth-sync.md`

**Goal:** Align repository governance docs and bootstrap metadata with the latest Harness governance-only model, then establish one explicit doc-truth-sync loop before legacy cleanup or architecture refactor work starts.

**Architecture:** Update the governance surface first, not the runtime. The implementation should normalize `.harness/bootstrap.toml`, rotate top-level pointers to the doc-truth-sync loop, reconcile stale spec/plan statuses with canonical Harness lifecycle values, and write one audit-style evidence record for the sync.

**Tech Stack:** Markdown docs, TOML bootstrap manifest, repository status metadata, `rg`, `git diff`, manual/subagent `harness:doc-health` audit.

**Allowed Write Scope:** `.harness/bootstrap.toml`, `PROGRESS.md`, `NEXT_STEP.md`, `MEMORY.md`, `AGENT_INDEX.md`, `docs/project/**`, `docs/testing/**`, `docs/superpowers/specs/**`, `docs/superpowers/plans/**`, `artifacts/doc-health/**`

**Verification Commands:**
- `rg -n "^(bootstrap_version|mode|preset|entry_skill|governance_model|templates_dir|doc_health_skill|lint_test_skill)\\s*=" .harness/bootstrap.toml`
- `rg -n "docs_health_command|verify_command|e2e_command" .harness/bootstrap.toml`
- `rg -n "lint:docs" PROGRESS.md docs/project/current-state.md docs/project/README.md docs/testing/strategy.md`
- `rg -n "^status:" docs/superpowers/specs docs/superpowers/plans -g '*.md'`
- `git diff --check`

**Evidence Location:** `artifacts/doc-health/2026-03-20-harness-doc-truth-sync.md`

**Rule:** Do not expand scope during implementation. Do not delete legacy code in this plan. New requests must be recorded through `CHANGE_REQUEST_TEMPLATE.md`.

---

## File Map

- Modify: `.harness/bootstrap.toml`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`
- Modify: `AGENT_INDEX.md`
- Modify: `docs/project/current-state.md`
- Modify: `docs/project/README.md`
- Modify: `docs/testing/strategy.md`
- Modify: `docs/superpowers/specs/2026-03-20-harness-doc-truth-sync.md`
- Modify: `docs/superpowers/plans/2026-03-20-refine-agent-react-implementation.md`
- Modify: `docs/superpowers/specs/2026-03-19-agent-architecture-redesign.md`
- Modify: `docs/superpowers/specs/2026-03-20-refine-agent-react-contracts.md`
- Modify: `docs/superpowers/specs/2026-03-20-refine-react-tool-surface-hardening.md`
- Modify: `docs/superpowers/plans/2026-03-20-refine-react-tool-surface-hardening-implementation.md`
- Modify: `docs/superpowers/specs/2026-03-20-refine-react-tab-context-consistency.md`
- Modify: `docs/superpowers/plans/2026-03-20-refine-react-tab-context-consistency-implementation.md`
- Create: `artifacts/doc-health/2026-03-20-harness-doc-truth-sync.md`

## Tasks

### Task 1: Normalize The Bootstrap Manifest

**Files:**
- Modify: `.harness/bootstrap.toml`
- Create: `artifacts/doc-health/2026-03-20-harness-doc-truth-sync.md`

- [ ] Capture the red-state baseline in the evidence draft: note that `.harness/bootstrap.toml` currently stores command fields and is missing `governance_model`, `doc_health_skill`, and `lint_test_skill`.
- [ ] Rewrite `.harness/bootstrap.toml` to the governance-only manifest contract with exactly the required Harness keys and repository-relative values.
- [ ] Remove legacy command fields (`docs_health_command`, `verify_command`, `e2e_command`) from the manifest.
- [ ] Run `rg -n "^(bootstrap_version|mode|preset|entry_skill|governance_model|templates_dir|doc_health_skill|lint_test_skill)\\s*=" .harness/bootstrap.toml` and confirm every required key is present.
- [ ] Run `rg -n "docs_health_command|verify_command|e2e_command" .harness/bootstrap.toml` and confirm it returns no matches.

### Task 2: Sync Project Docs To The New Harness Model

**Files:**
- Modify: `docs/project/current-state.md`
- Modify: `docs/project/README.md`
- Modify: `docs/testing/strategy.md`
- Modify: `MEMORY.md`

- [ ] Update project docs so they describe latest Harness as governance-only bootstrap plus doc-health audit, not as a repo-local doc-lint runtime.
- [ ] Remove or reword claims that `lint:docs` is required by Harness; if the repository keeps a local doc checker, describe it as project-specific rather than Harness-mandated.
- [ ] Keep project-specific verification commands in project/testing docs where they still matter, but do not treat them as bootstrap-manifest truth.
- [ ] Update any stable lesson in `MEMORY.md` that still implies `.harness/bootstrap.toml` is a command registry instead of governance metadata.
- [ ] Run `rg -n "lint:docs" PROGRESS.md docs/project/current-state.md docs/project/README.md docs/testing/strategy.md` and confirm any remaining matches are intentional historical references rather than active governance claims.

### Task 3: Rotate The Active Loop And Canonical Statuses

**Files:**
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `AGENT_INDEX.md`
- Modify: `docs/superpowers/specs/2026-03-20-harness-doc-truth-sync.md`
- Modify: `docs/superpowers/plans/2026-03-20-harness-doc-truth-sync-implementation.md`
- Modify: `docs/superpowers/plans/2026-03-20-refine-agent-react-implementation.md`
- Modify: `docs/superpowers/specs/2026-03-19-agent-architecture-redesign.md`
- Modify: `docs/superpowers/specs/2026-03-20-refine-agent-react-contracts.md`
- Modify: `docs/superpowers/specs/2026-03-20-refine-react-tool-surface-hardening.md`
- Modify: `docs/superpowers/plans/2026-03-20-refine-react-tool-surface-hardening-implementation.md`
- Modify: `docs/superpowers/specs/2026-03-20-refine-react-tab-context-consistency.md`
- Modify: `docs/superpowers/plans/2026-03-20-refine-react-tab-context-consistency-implementation.md`

- [ ] Promote the doc-truth-sync loop into the current top-level pointer set and make `NEXT_STEP.md` point to the next action inside this loop only.
- [ ] Reclassify the prior refine-runtime documents using canonical Harness lifecycle statuses only: `draft`, `active`, `superseded`, `deprecated`, or `archived`.
- [ ] Ensure no prior loop remains marked `active` once the doc-truth-sync loop becomes current.
- [ ] Update `PROGRESS.md` so the active references, TODO, and DONE sections describe the same doc-truth-sync loop as `NEXT_STEP.md`.
- [ ] Run `rg -n "^status:" docs/superpowers/specs docs/superpowers/plans -g '*.md'` and manually verify there is one coherent current loop rather than overlapping active histories.

### Task 4: Record Evidence And Finalize Handoff

**Files:**
- Modify: `PROGRESS.md`
- Modify: `docs/superpowers/plans/2026-03-20-harness-doc-truth-sync-implementation.md`
- Create: `artifacts/doc-health/2026-03-20-harness-doc-truth-sync.md`

- [ ] Fill the evidence record with scenario, commands run, before-state mismatches, after-state sync results, and residual risks.
- [ ] Add the evidence path to the plan metadata or task notes so the doc-truth-sync loop has an explicit `spec -> plan -> evidence` chain.
- [ ] Run `git diff --check` and confirm the docs-only sync introduces no malformed markdown/TOML edits.
- [ ] Record residual risks explicitly: disconnected legacy refinement code is still present, and cleanup/refactor is still deferred.
- [ ] Set the post-sync next action to planning or executing the legacy-cleanup loop, not directly to provider/composition refactor.

## Completion Checklist

- [ ] Manifest uses the latest governance-only Harness key set
- [ ] Repo-local command fields are removed from `.harness/bootstrap.toml`
- [ ] Project docs no longer describe `lint:docs` as a Harness requirement
- [ ] Top-level pointers reflect the doc-truth-sync loop
- [ ] Prior active loop is explicitly demoted with canonical statuses
- [ ] Evidence location is populated or explicitly noted
- [ ] No runtime behavior or code files were changed
