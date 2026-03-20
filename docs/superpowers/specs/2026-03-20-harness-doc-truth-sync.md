---
doc_type: spec
status: archived
supersedes: []
related:
  - docs/superpowers/plans/2026-03-20-harness-doc-truth-sync-implementation.md
  - .harness/bootstrap.toml
  - PROGRESS.md
  - NEXT_STEP.md
  - MEMORY.md
  - AGENT_INDEX.md
  - docs/project/current-state.md
  - docs/project/README.md
  - docs/architecture/overview.md
  - docs/architecture/layers.md
  - docs/testing/strategy.md
---

# Harness Doc Truth Sync Spec

## Problem

The repository was bootstrapped under an older Harness interpretation that treated repo-local commands as part of Harness truth. The latest `harness:init` and `harness:doc-health` guidance has shifted to a governance-first model:

- `harness:init` establishes repository governance structure and bootstrap metadata.
- `harness:doc-health` defines how agents audit truth; it does not require a repo-local executable checker.

Current repository docs still mix these two models. As a result:

- `.harness/bootstrap.toml` is still command-centric instead of governance-centric.
- several project docs still describe `lint:docs` as a required Harness boundary even though latest Harness no longer requires repo-local doc lint automation
- top-level pointers still aim at a previous runtime validation loop instead of the current doc-truth reset loop
- active spec/plan status and project-context docs are not yet fully aligned to the latest governance framing
- the previous active loop has not yet been explicitly demoted and replaced by a new spec -> plan -> evidence chain for doc-truth sync

Before legacy cleanup or architecture refactor work starts, the repository needs one explicit doc-truth sync pass that freezes what is currently effective truth and demotes everything else to background context.

## Success

- The repository defines one clear truth stack for the current phase:
  - `L0`: governance pointers and bootstrap metadata
  - `L1`: project context and current code-backed architecture truth
  - `L2`: historical background only
- `.harness/bootstrap.toml` reflects the latest governance-only Harness model used by this repository.
- Top-level pointers (`PROGRESS.md`, `NEXT_STEP.md`, `MEMORY.md`, `AGENT_INDEX.md`) align to the current loop: doc-truth sync first, cleanup/refactor later.
- Project docs no longer present repo-local `lint:docs` as a Harness requirement.
- Current code-backed runtime facts are preserved, while disconnected legacy refinement code is explicitly labeled as inactive or pending cleanup rather than active source.
- A doc-health audit can identify the effective truth of the repository without relying on archived `.plan/*` material.

## Out Of Scope

- Deleting legacy runtime files.
- Refactoring runtime composition, providers, prompts, or tool injection.
- Changing runtime behavior, test behavior, or browser execution behavior.
- Designing the later legacy-cleanup or provider/composition-root refactor.

## Critical Paths

1. Freeze the latest Harness governance interpretation that this repository will follow.
2. Declare the effective truth layers and which files belong to each layer.
3. Sync top-level pointer docs to the current loop and remove stale next-action guidance.
4. Sync project context docs so they describe current code truth without stale Harness assumptions.
5. Reclassify existing specs and plans with canonical Harness lifecycle statuses only.
6. Establish the new doc-truth-sync loop as one explicit `spec -> plan -> evidence` chain.

## Frozen Contracts

- `L0` governance truth for this repository is:
  - `AGENTS.md`
  - `AGENT_INDEX.md`
  - `PROGRESS.md`
  - `NEXT_STEP.md`
  - `MEMORY.md`
  - `.harness/bootstrap.toml`
- `L1` project-context truth for this repository is:
  - `docs/project/current-state.md`
  - `docs/project/README.md`
  - `docs/architecture/overview.md`
  - `docs/architecture/layers.md`
  - `docs/testing/strategy.md`
- Current code under `apps/agent-runtime/src/**` is the implementation truth. If code and docs disagree, docs must be updated before new implementation work continues.
- Historical `.plan/*` documents are `L2` background only unless a future active spec explicitly promotes one back into active truth.
- `harness:doc-health` is the repository truth audit standard. It is not, by itself, a requirement that this repository must provide a repo-local executable doc-health script.
- `.harness/bootstrap.toml` must conform to the latest Harness bootstrap manifest contract and contain, at minimum:
  - `bootstrap_version`
  - `mode`
  - `preset`
  - `entry_skill`
  - `governance_model`
  - `templates_dir`
  - `doc_health_skill`
  - `lint_test_skill`
- `.harness/bootstrap.toml` must describe governance structure only. Repo-local executable command fields such as `docs_health_command`, `verify_command`, and `e2e_command` are not part of the active manifest contract for this repository after sync.
- Repository verification commands may be documented in project/testing docs and package scripts, but they must not be mistaken for the primary Harness governance contract.
- `NEXT_STEP.md` must contain exactly one direct next action for the active loop.
- Canonical document lifecycle statuses for this sync are restricted to:
  - `draft`
  - `active`
  - `superseded`
  - `deprecated`
  - `archived`
- Terms such as `completed` and `background` may be used in prose, but not as frontmatter lifecycle statuses.
- Once approved, this spec becomes the single active spec for the doc-truth-sync loop until superseded.

## Architecture Invariants

- Governance docs, not helper scripts, define repository truth.
- Active spec/plan status must not contradict the current code-backed baseline.
- If disconnected legacy code remains in `src/`, docs must describe it as inactive, disconnected, or pending cleanup rather than implicitly active.
- Only one main active loop may exist at a time for top-level repository guidance.
- A healthy active loop for this repository must include exactly:
  - one active spec
  - one active implementation plan that points to that spec
  - one current evidence record that verifies that plan
- Document sync must happen before legacy cleanup planning and before broader architecture refactor planning.

## Failure Policy

- If a document claim conflicts with current code behavior, prefer code-backed truth and correct the document before proceeding.
- If a spec or plan cannot justify `active` status under the current loop, downgrade it explicitly instead of leaving ambiguous metadata.
- Do not inherit active truth from archived or historical `.plan/*` documents.
- Do not invent a stronger Harness runtime contract than the latest governance model actually guarantees.
- Do not preserve stale top-level pointers merely because they were previously valid.
- Do not leave a previous loop marked `active` once doc-truth sync becomes the current loop.

## Acceptance

- A docs-only sync pass updates the repository truth surface without changing runtime behavior.
- The sync updates, at minimum, the following files if needed:
  - `.harness/bootstrap.toml`
  - `PROGRESS.md`
  - `NEXT_STEP.md`
  - `MEMORY.md`
  - `AGENT_INDEX.md`
  - `docs/project/current-state.md`
  - `docs/project/README.md`
  - `docs/testing/strategy.md`
- `.harness/bootstrap.toml` contains the required governance keys and no longer acts as storage for repo-local executable command fields.
- The updated docs clearly distinguish:
  - active governance truth
  - active project/context truth
  - historical background
- Repository docs no longer claim that `lint:docs` is required by latest Harness governance.
- Top-level pointers identify doc-truth sync as the current step and place legacy cleanup / refactor work after that sync.
- The previous active loop is explicitly demoted using canonical statuses (`superseded`, `deprecated`, or `archived` as appropriate) rather than left implicitly active.
- The approved doc-truth-sync loop is prepared to continue as one explicit chain:
  - this spec as the active intent document
  - a matching active implementation plan
  - one evidence note or audit artifact that verifies the sync result
- A follow-up doc-health review can summarize the repo without unresolved contradictions about active docs, active next step, or current Harness model.

## Deferred Decisions

- Whether repo-local `lint-docs.mjs` should be removed, repurposed, or kept as a project-specific optional checker.
- When disconnected legacy refinement files should be physically removed from `src/`.
- When to start a separate legacy-cleanup spec and a later provider/composition-root refactor spec.
