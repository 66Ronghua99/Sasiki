---
doc_type: spec
status: draft
supersedes: []
related:
  - /Users/cory/.coding-cli/AGENT_INDEX.md
  - /Users/cory/.coding-cli/harness-bootstrap/skeleton/AGENT_INDEX.md
  - /Users/cory/.coding-cli/harness-bootstrap/skeleton/.harness/bootstrap.toml.example
  - /Users/cory/.coding-cli/skills/harness-refactor/SKILL.md
  - /Users/cory/.coding-cli/skills/harness-lint-test-design/SKILL.md
  - /Users/cory/.coding-cli/skills/harness-doc-health/SKILL.md
  - /Users/cory/.coding-cli/superpowers/skills/test-driven-development/SKILL.md
---

# Shared Agent Index Route Design

## Problem

The shared governance skills are now locally simpler, but the route into them is still too flat.

Current shared routing treats these as neighboring options without enough sequencing:

- `test-driven-development`
- `harness:refactor`
- `harness:lint-test-design`
- `harness:doc-health`

That causes three recurring ambiguities:

1. `test-driven-development` versus `harness:refactor`
   Feature and bugfix work should usually start in TDD, but the current route table makes `harness:refactor` look like a parallel first choice instead of a structural triage that happens after or alongside TDD when certain conditions are hit.

2. `harness:refactor` versus `harness:lint-test-design`
   Refactor findings are supposed to discover drift, while lint/test design is supposed to encode stable proof. The route table does not say clearly enough when a task should stay in review/triage versus when it should promote into lint, structural tests, coverage expectations, or ratchets.

3. human-readable route intent versus machine-readable bootstrap hints
   `.harness/bootstrap.toml` is already read as repository truth, but route-related fields are not yet clearly limited to hints that the shared routing actually consumes. That creates risk of "future maybe" metadata that looks authoritative but has no real consumer.

This design intentionally solves route semantics before hook or CI automation. The goal is to make the shared `AGENT_INDEX` the primary explanation surface and let bootstrap metadata add only a small number of explicitly consumed hints.

## Goals

- make `test-driven-development` the default first route for feature and bugfix work
- define `harness:refactor` as a structural triage that is added when specific conditions are hit, not as the normal first route for coding work
- define `harness:lint-test-design` as the promotion path when a finding becomes stable enough to encode as proof
- keep `harness:doc-health` scoped to truth sync and pointer drift
- add a small bootstrap hint model that shared routing is explicitly allowed to consume
- avoid hidden or speculative route fields in `.harness/bootstrap.toml`

## Non-Goals

- no hook, CI, cron, or automation execution design in this pass
- no repository-local route customization beyond hints that shared routing understands
- no full rule engine in bootstrap metadata
- no redesign of superpowers process ordering outside the governance route seam

## Chosen Direction

Use a two-layer route model:

1. `AGENT_INDEX` is the primary explanation surface
   It owns the human-readable route semantics, including sequencing and handoff rules.

2. `.harness/bootstrap.toml` provides machine-readable route hints
   It may only contain fields that shared routing explicitly consumes and that have a matching explanation in `AGENT_INDEX`.

The route model should be sequential rather than flat:

- feature / bugfix coding starts in `test-driven-development`
- structural conditions may add `harness:refactor` triage
- stable or recurring findings may promote into `harness:lint-test-design`
- stale truth and pointer drift route into `harness:doc-health`

## Core Route Model

### 1. Default Coding Route

Use `test-driven-development` first for:

- feature work
- bugfix work
- behavior changes
- runtime regressions after debugging isolates the defect

This is the default implementation route.

### 2. Structural Triage Overlay

Add `harness:refactor` triage when the work also hits structural conditions such as:

- cross-layer or cross-module changes
- file creation, move, rename, or ownership change
- boundary-facing files such as shell, adapter, provider, service, workflow, or composition surfaces
- recurring review signals that the boundary or folder role is drifting

`harness:refactor` is not the normal first route for coding. It is a bounded architecture review overlay on top of active work.

### 3. Proof Promotion Route

Promote from `harness:refactor` or delivery review into `harness:lint-test-design` when the finding is ready to become:

- a lint rule
- a structural or boundary test
- a coverage expectation
- an exception ledger entry with a ratchet

The promotion criterion is stability and mechanizability, not severity alone.

### 4. Truth-Sync Route

Use `harness:doc-health` only when the problem is primarily:

- stale front-door docs
- pointer drift between spec, plan, progress, and evidence
- repository truth documents no longer matching implementation

Do not route architecture drift or invariant design into `harness:doc-health`.

## Agent Index Requirements

The shared `AGENT_INDEX` should express the above as ordered route guidance, not as a flat unordered list.

It should make these statements explicit:

- start feature and bugfix coding in `test-driven-development`
- add `harness:refactor` only when structural-route hints are present
- promote into `harness:lint-test-design` when findings should become mechanical proof
- route stale truth into `harness:doc-health`

The bootstrap skeleton `AGENT_INDEX.md` should use the same route story as the shared fallback index, with any repository-specific wording layered on top instead of redefining the model.

## Bootstrap Hint Model

Bootstrap route metadata is allowed only if shared routing can explain and consume it.

### Allowed Hint Principles

- hints must be additive, not hidden routing logic
- hints must have a matching explanation in `AGENT_INDEX`
- hints must be soft guidance unless a separate automation design explicitly upgrades them later
- do not add metadata for hypothetical future consumers
- route hints do not replace separate commit-time governance metadata such as `governance.refactor_gate`

### Initial Allowed Hints

#### `[governance.refactor_route]`

Purpose:

- tell shared routing whether this repository prefers structural triage when certain changes are present

Proposed fields:

- `preferred = true|false`
- `path_hints = []`
- `change_kinds = []`

Meaning:

- `preferred`
  - whether the repository wants shared routing to bias toward adding `harness:refactor` when structural conditions are present
- `path_hints`
  - glob-like path families that count as structural triage hotspots
- `change_kinds`
  - a small vocabulary such as `create`, `move`, `rename`, `ownership-change`, `boundary-surface`

#### `[governance.lint_test_route]`

Purpose:

- tell shared routing which recurring governance intents or finding classes should bias toward `harness:lint-test-design`

Proposed fields:

- `preferred = true|false`
- `intents = []`
- `finding_hints = []`

Meaning:

- `preferred`
  - whether the repository prefers earlier promotion into lint/test design instead of leaving issues in refactor review
- `intents`
  - human-facing route phrases such as `coverage policy`, `file-role rules`, `guardrail design`
- `finding_hints`
  - small vocabulary for route promotion such as `recurring-boundary-finding`, `mechanizable-edge`, `coverage-gap`, `exception-ratchet`

## Explicit Consumption Rule

No new bootstrap route hint may be added unless all three are true:

1. shared `AGENT_INDEX` explains the meaning in human-readable route terms
2. at least one shared route or skill explicitly says it may consume that hint
3. the field acts as a hint, not as hidden behavior

If a field has no declared consumer, it must not be added to bootstrap metadata.

## Route Boundaries

- `test-driven-development`
  - owns behavior-first implementation discipline
- `harness:refactor`
  - owns bounded architecture-drift triage and cleanup guidance
- `harness:lint-test-design`
  - owns promotion into lint, structural proof, coverage proof, and ratchets
- `harness:doc-health`
  - owns truth sync and pointer repair

These routes are complementary, not interchangeable.

## Risks

### Risk: route story stays too abstract

Mitigation:

- express sequencing directly in `AGENT_INDEX`
- keep the bootstrap hint set intentionally small

### Risk: bootstrap metadata turns into hidden configuration logic

Mitigation:

- require explicit human-readable explanation and named consumers for every hint field

### Risk: `refactor` keeps swallowing normal coding work

Mitigation:

- make `test-driven-development` the default first route
- describe `refactor` as an overlay triage, not a peer implementation route

## Acceptance

- the shared `AGENT_INDEX` route model clearly makes `test-driven-development` the default first route for coding work
- the route model clearly describes when `harness:refactor` is added as structural triage
- the route model clearly describes when `harness:lint-test-design` is entered as proof promotion
- the route model keeps `harness:doc-health` scoped to truth sync
- bootstrap route hints are limited to fields the shared route model explicitly explains and consumes
- the design leaves hook/CI/automation triggering for a later spec

## Follow-Up

After this route design lands, the next pass should decide:

- whether and how local hooks should consume `refactor_route` hints
- whether CI should consume `lint_test_route.finding_hints`
- whether periodic governance runs should use the same route hints or a separate automation model
