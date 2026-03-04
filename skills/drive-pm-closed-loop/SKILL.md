---
name: drive-pm-closed-loop
description: Turn product requirement discussions into an executable and verifiable minimum closed loop, then define a prioritized iteration roadmap from project progress. Use when the user asks to discuss project requirements, clarify scope, choose next direction, define acceptance criteria, or converge ambiguous ideas into a concrete PM execution plan.
---

# Drive PM Closed Loop

## Goal

Convert requirement conversations into:
- One executable minimum closed loop
- Testable acceptance criteria
- A prioritized next-iteration plan

## Run Workflow

1. Align objective and constraints
- Extract business objective, target user, timeline, available resources, and hard constraints.
- Identify missing inputs and state explicit assumptions before proposing a plan.

2. Freeze one minimum closed loop
- Keep scope to one user journey and one measurable outcome.
- Reject "build everything first" requests and force a smallest valuable loop.
- Load `references/minimum-loop-template.md` and fill all required fields.

3. Write executable requirements
- Load `references/prd-template.md`.
- Define scope and non-goals explicitly.
- Translate ambiguous statements into deterministic rules and acceptance criteria.

4. Define verification plan
- Specify how to verify behavior (manual checkpoints or automated tests).
- Require observable evidence for each acceptance criterion (logs, screenshots, artifacts, metrics).
- Define pass and fail thresholds.

5. Plan the next iteration
- Load `references/iteration-template.md`.
- Prioritize backlog by impact, confidence, and effort.
- Output only 1-3 highest-value next actions.

## Enforce PM Rules

- Clarify before committing: list missing facts and assumptions first.
- Close one loop before expansion: do not expand roadmap before minimum loop is verifiable.
- Make outcomes measurable: every goal must map to an observable signal.
- Keep tradeoffs explicit: explain what is intentionally deferred.

## Use Output Contract

Always return these sections in order:

1. `Requirement Summary`
2. `Minimum Closed Loop Definition`
3. `Verification Plan`
4. `Next Iteration Plan`

If information is incomplete, keep the same sections and mark assumptions inline.

## Load References Progressively

- Read `references/minimum-loop-template.md` when defining the first executable loop.
- Read `references/prd-template.md` when drafting a requirement document.
- Read `references/iteration-template.md` when prioritizing post-loop improvements.
