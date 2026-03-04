# Question Catalog

Use this catalog to generate targeted PM clarification questions from current project progress.
Select only relevant questions; avoid asking all items blindly.

## 1) Business Outcome
- What concrete business outcome defines success for this phase?
- What metric and threshold define "done" (for example, success rate, latency, conversion)?
- What deadline or external commitment constrains this requirement?

## 2) User and Scenario Boundaries
- Who is the primary user in this iteration?
- Which scenarios are explicitly in scope now?
- Which scenarios are explicitly out of scope now?
- What is the highest-risk user behavior that must be supported?

## 3) Workflow and SOP Definition
- What exact start and end states define the target SOP?
- Which steps are mandatory versus optional in the SOP?
- Which step currently fails most often, and why?
- What fallback path is acceptable when a step fails?

## 4) Acceptance and Evidence
- What observable evidence is required for each critical step?
- What artifact set is mandatory for acceptance?
- Is single-pass success enough, or is stability threshold required (for example, 20/20)?
- What failure taxonomy should be tracked and reported?

## 5) Risk and Constraints
- Which external dependencies can block delivery?
- What compliance or security boundaries apply (credentials, PII, auditability)?
- What resources are fixed (people/time/budget/tooling)?
- Which assumptions are currently unvalidated and most dangerous?

## 6) Prioritization and Tradeoffs
- If only one thing ships this week, what must it be?
- What can be intentionally deferred without harming the milestone?
- Which TODO item unblocks the largest number of downstream tasks?
- What quality level is required now versus later hardening phases?

## 7) Delivery Strategy
- What is the smallest testable increment for the next session?
- What rollback condition should trigger stopping the rollout?
- What is the explicit go/no-go gate before moving to next phase?

## Prioritization Heuristic
- Mark as `P0` when unanswered and it blocks implementation immediately.
- Mark as `P1` when it impacts design quality or acceptance but does not fully block.
- Mark as `P2` when it improves optimization, reporting, or long-term maintainability.
