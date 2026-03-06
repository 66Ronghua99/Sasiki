# Long-Task SOP HITL Requirement v0 (2026-03-06)

## Status
- Requirement freeze: Done
- Execution: Not started

## 1. Problem Statement
Current pain:
- V0 pinned-run consumption loop is available, but long-task autonomous execution quality is still unstable.
- Retrieval quality and page-level quirks can distract from the core objective: improving SOP artifact quality for better execution.
- Human intervention exists in practice, but intervention knowledge is not yet normalized into reusable SOP learning assets.

Objective:
- Use one real long-task benchmark (e-commerce listing) to iteratively optimize SOP artifacts.
- Reach fully autonomous execution (`3/3`) without human intervention in final acceptance.

Constraints:
- This phase optimizes SOP artifacts only (prompt/guide/intermediate artifacts), not site-specific page strategy optimization.
- Single task timeout is 10 minutes.
- Max retry per uncertain/failing point is 2 times; then request Human-in-the-loop (HITL).
- Occasional multi-tab events are warnings and should not directly count as failures.

Non-goals:
- No SOP retrieval optimization in this phase.
- No selector-level/site-specific local patching as primary solution.

## 2. Boundary & Ownership
- SOP artifact iteration:
  - Owns SOP content quality, clarity, variable binding instructions, and failure-recovery instructions.
- HITL learning capture:
  - Owns semantic intervention record (problem, context, before/after delta, reusable next-time rule).
  - After intervention, runtime resumes from interruption point.
- Runtime evidence and observability:
  - Owns consistent evidence package and failure taxonomy Top-N report.

Primary files/modules to evolve (implementation phase):
- `apps/agent-runtime/src/runtime/*` (intervention hooks, resume behavior, logging abstraction)
- `apps/agent-runtime/src/domain/*` (learning record schema, failure taxonomy contract)
- `artifacts/e2e/{run_id}/*` (evidence and aggregated reports)

## 3. Options & Tradeoffs
Option A: Single-variable SOP iteration per cycle
- Pros: clear causality.
- Cons: low iteration speed; inefficient when failures are coupled.
- Rejected.

Option B: Multi-variable SOP iteration per cycle with structured evidence (Chosen)
- Pros: faster convergence in HITL-assisted loops; closer to real usage.
- Cons: harder attribution; must enforce change summary per version.

Option C: Focus on page-level local fixes first
- Pros: short-term pass rate gains on one site.
- Cons: harms general SOP quality objective; poor transferability.
- Rejected.

## 4. Migration Plan
1. Freeze benchmark definition and acceptance:
   - Scenario: e-commerce single-page listing.
   - Required fields: title, main image, landing page URL, images, SKU, size.
   - Final gate: fully autonomous run success `3/3` (no HITL counted).
2. Introduce HITL control policy:
   - Trigger on: explicit runtime error, no page state change, or uncertain state after retry budget.
   - Retry budget: max 2 retries per point.
3. Add semantic learning record artifact (`intervention_learning.jsonl`):
   - Record semantic operation intent instead of step-id coupling.
   - Keep records natural-language readable for both human and agent consumption.
4. Add standardized evidence package:
   - Success proof triple: success signal, final screenshot, key field read-back.
   - Full run logs: observed content, reasoning summary, action output, failure/intervention markers.
5. Add failure taxonomy and version-level Top-N report:
   - Aggregate every 3 runs as one analysis window.
6. SOP versioning loop:
   - Max 3 SOP versions in this phase.
   - Each version executes run window -> aggregate Top-N -> update SOP.

Rollback points:
- Disable HITL learning write path and keep runtime behavior unchanged.
- Keep previous SOP version if latest version degrades autonomous pass rate.

## 5. Test Strategy
Acceptance gates:
1. Autonomous completion gate:
   - Criterion: task success `3/3` with no HITL.
   - Evidence: success proof triple per run.
2. Field correctness gate:
   - Criterion: required fields mapped correctly per task rule (e-commerce defaults to strict match).
   - Evidence: input-vs-page field reconciliation.
3. Learning traceability gate:
   - Criterion: every HITL event produces a complete semantic learning record.
   - Evidence: `intervention_learning.jsonl`.
4. Failure observability gate:
   - Criterion: version-level Top-N report generated every 3 runs.
   - Evidence: `failure_topn.json`.

Verification notes:
- HITL-assisted runs are valid for SOP learning, but not counted toward final autonomous `3/3`.
- Multi-tab warning events should be recorded but excluded from direct failure decision.

## 6. Requirement Snapshot v0
Scope:
- Build a long-task benchmark loop that improves SOP artifacts through HITL-assisted iterations and converges to autonomous execution.

Out-of-scope:
- Retrieval algorithm enhancement.
- Site-specific tactical hacks as primary strategy.

Acceptance summary:
- `3/3` autonomous success, no HITL.
- Required fields correctly filled.
- Complete evidence package available.
- HITL learning records and Top-N failures are generated consistently.

## 7. Learning Record Schema v0
```json
{
  "runId": "string",
  "sopVersion": "string",
  "timestamp": "ISO8601",
  "issueType": "no_page_change|tool_error|uncertain_state|validation_fail",
  "operationIntent": "natural language operation intent",
  "context": {
    "pageHint": "string",
    "elementHint": "string",
    "inputVariable": "string"
  },
  "beforeState": "natural language summary",
  "humanAction": "natural language summary",
  "afterState": "natural language summary",
  "resumeInstruction": "resume command/instruction",
  "nextTimeRule": "reusable natural language rule for future runs"
}
```
