---
doc_type: spec
status: draft
supersedes: []
related:
  - /Users/cory/.coding-cli/skills/harness-refactor/SKILL.md
  - /Users/cory/.coding-cli/skills/harness-lint-test-design/SKILL.md
  - /Users/cory/.coding-cli/harness-bootstrap/skeleton/AGENT_INDEX.md
  - /Users/cory/.coding-cli/harness-bootstrap/skeleton/.harness/bootstrap.toml.example
  - /Users/cory/.coding-cli/harness-bootstrap/skeleton/.githooks/pre-commit
---

# Harness Skill Surface Simplification Design

## Problem

The current Harness governance surface is harder to enter than it should be.

The immediate problem is not missing capability. It is that the active meaning of the skills is spread across too many small files:

- `harness:refactor` currently splits its guidance across `SKILL.md`, two checklists, two examples, and two reference documents
- `harness:lint-test-design` currently splits its guidance across `SKILL.md`, one checklist, two examples, five references, and six templates
- bootstrap skeleton files also carry part of the trigger semantics for when these skills should run

That creates two kinds of confusion:

1. the skill-local entry surface is too wide
   A human or agent opening the skill directory has to infer which files are actually required to get started.
2. the skill boundary is too blurred
   Skill capability, routing guidance, hook wiring, and machine-readable repository metadata are described in adjacent places without a clear single owner for each concern.

This design intentionally solves the first problem before solving entry-route ambiguity. The goal of this pass is to make each skill locally legible and low-friction before redesigning trigger automation.

## Goals

- reduce the file count inside `harness:refactor`
- reduce the file count inside `harness:lint-test-design`
- make each skill readable from one primary entry file plus one optional companion file
- remove low-frequency artifact templates that are not needed for the common agent-in-context path
- clarify which content belongs to:
  - the skill
  - the skill companion playbook
  - bootstrap routing metadata
  - repository-local hook wiring

## Non-Goals

- no redesign yet of commit-time, CI-time, or periodic governance triggering
- no rewrite yet of repository `AGENT_INDEX.md` route wording beyond what is needed to reflect the simplified skill surfaces
- no attempt to make `harness:refactor` or `harness:lint-test-design` share a single combined skill
- no new governance behavior in this pass; this is a documentation and surface simplification pass first

## Chosen Direction

Each of the two skills is reduced to a two-file surface:

- `SKILL.md`
- `PLAYBOOK.md`

The rule for the new shape is:

- `SKILL.md` is the only required entrypoint
- `PLAYBOOK.md` is optional supporting guidance for judgment-heavy situations
- everything else inside the current skill package is either merged into one of those two files or deleted

## Target Shape

### `harness:refactor`

Keep:

- `SKILL.md`
- `PLAYBOOK.md`

Remove or merge:

- `checklists/governance-mode-checklist.md`
- `checklists/review-mode-checklist.md`
- `examples/governance-follow-up.example.md`
- `examples/review-findings.example.md`
- `references/agent-architecture-principles.md`
- `references/boundary-contracts.md`

New file responsibilities:

- `SKILL.md`
  - what the skill is for
  - when to use it
  - when not to use it
  - `review mode` and `governance follow-up mode`
  - minimal execution flow
  - required output
  - boundary with `harness:lint-test-design` and `harness:doc-health`
  - short statement about commit-time review when repository metadata declares a gate
- `PLAYBOOK.md`
  - what counts as architecture drift
  - how to classify severity
  - how to pick an action shape
  - how to bound review scope
  - when findings should be promoted into `harness:lint-test-design`
  - one or two high-value example findings

### `harness:lint-test-design`

Keep:

- `SKILL.md`
- `PLAYBOOK.md`

Remove or merge:

- `checklists/lint-test-design-checklist.md`
- `examples/file-budget-and-coverage.example.md`
- `examples/layered-boundaries.example.md`
- `references/exception-governance.md`
- `references/invariant-model.md`
- `references/lint-rule-taxonomy.md`
- `references/severity-ladder.md`
- `references/test-taxonomy.md`
- `references/verification-evidence.md`
- `templates/lint-rule-matrix.template.md`
- `templates/lint-test-exception-policy.template.md`
- `templates/ratchet-plan.template.md`
- `templates/structural-proof-matrix.template.md`
- `templates/structural-test-cases.template.md`
- `templates/test-strategy-matrix.template.md`

New file responsibilities:

- `SKILL.md`
  - what the skill is for
  - when it is triggered
  - the three frozen truths:
    - target state
    - current truth
    - transition model
  - output families:
    - lint rule
    - structural or boundary test
    - coverage expectation
    - exception ledger and ratchet
  - minimal execution flow
  - boundary with `test-driven-development`, `harness:refactor`, and `harness:doc-health`
- `PLAYBOOK.md`
  - how to choose between lint, structural proof, behavior proof, coverage proof, and temporary exception governance
  - minimum exception governance requirements
  - ratchet design guidance
  - one or two compact examples showing promotion from recurring finding to hard proof

## Ownership Boundaries

After this simplification pass, each layer owns a narrower concern:

- skill files
  - explain capability, usage, decisions, and outputs
- bootstrap `AGENT_INDEX.md`
  - explain route selection between skills
- bootstrap `.harness/bootstrap.toml`
  - store machine-readable governance switches such as local gate enablement and path rules
- repository-local hooks
  - execute or validate repository-local gate wiring

This means skills should stop acting like hook manuals or bootstrap wiring docs.

## Design Principles

- optimize for first-read comprehension over archival completeness
- prefer one strong entry file over many auxiliary fragments
- keep low-frequency formal artifacts out of the default path
- treat common agent-in-context usage as the baseline, not the large refactor program case
- keep examples only when they materially improve judgment quality
- keep routing and automation semantics outside the skill unless they are necessary to understand the skill's role

## Expected Outcomes

- an agent can open either governance skill and understand the entry surface without browsing a directory tree
- the common case no longer implies writing a large matrix or artifact document
- the distinction between skill guidance and repository wiring becomes more obvious
- later work on route clarity and trigger automation can happen without first untangling the skill-local file sprawl

## Risks

### Risk: oversimplifying away useful nuance

Mitigation:

- keep judgment-heavy content in `PLAYBOOK.md`
- preserve at least one concrete example per skill where example density materially improves usage

### Risk: deleting templates that some large governance passes still want

Mitigation:

- optimize for default flow first
- if a future large-scale governance pass truly needs reusable templates, add them back only after proving repeated use

### Risk: route ambiguity remains even after local skill cleanup

Mitigation:

- explicitly defer trigger and route redesign to a follow-up spec
- make the new skill files name adjacent-skill boundaries clearly so the next pass starts from cleaner local surfaces

## Acceptance

- `harness:refactor` is reduced to `SKILL.md` plus `PLAYBOOK.md`
- `harness:lint-test-design` is reduced to `SKILL.md` plus `PLAYBOOK.md`
- existing checklist, template, example, and reference content is either:
  - merged into those two files
  - or deleted as low-value duplication
- both skills clearly state their adjacent boundaries:
  - `refactor` vs `lint-test-design`
  - `lint-test-design` vs `test-driven-development`
  - skill guidance vs bootstrap routing vs hook wiring
- no remaining file inside either skill package is required to understand the default common-case workflow beyond `SKILL.md`

## Follow-Up

After this spec lands, the next design pass should address:

- entry-route clarity between `test-driven-development`, `harness:refactor`, and `harness:lint-test-design`
- how local hooks, CI, and periodic governance runs should trigger lightweight triage
- how refactor findings should be promoted into lint, structural tests, coverage rules, or exception ratchets
