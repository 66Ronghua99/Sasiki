---
doc_type: spec
status: draft
supersedes: []
related:
  - .plan/20260310_interactive_reasoning_sop_compact.md
  - .plan/20260312_replay_refinement_requirement_v0.md
  - .plan/20260312_replay_refinement_online_design.md
  - .plan/20260313_execution_kernel_refine_core_rollout.md
---

# Refine Agent ReAct Architecture Spec

## Problem

Current replay/refinement is built as a stitched flow:

- `OnlineRefinementOrchestrator` drives the loop
- `BrowserOperatorGateway` executes one operator turn
- `RefinementDecisionEngine` evaluates and promotes after the fact
- HITL is inferred outside the main decision loop

This makes `refine agent` a reviewer instead of the true controller. In practice, the main problems are:

- HITL judgment is inaccurate because the agent does not own action selection.
- Execution intent is split across orchestrator state, operator behavior, and post-hoc JSON evaluation.
- The current flow depends too much on runtime-side structured decision wiring instead of a unified agent loop.
- What we want to learn is not a rigid replay path, but task-relevant page attention knowledge for future runs.

We need to rebuild refinement so that `refine agent` is the single high-authority ReAct brain for browser execution.

## Success

- `refine agent` directly owns the main loop: observe, act, request HITL, record knowledge, or finish.
- The refinement loop can complete at least one full end-to-end browser workflow instead of only producing local step judgments.
- HITL is only requested explicitly by `refine agent`, not injected by runtime heuristics.
- Browser-related tools are exposed through a stable runtime adapter layer over Playwright MCP instead of raw MCP tool sprawl.
- Refinement output focuses on `AttentionKnowledge`, not hard-coded replay paths.
- The run must deposit at least one promoted knowledge artifact that a later `refine agent` run can load as compact attention guidance.
- Knowledge consumption must stay goal-preserving: it cannot turn into a large multi-stage formatted blob that distracts the model from the current task.
- Future `core agent` consumption is defined only as a dependency on `AttentionKnowledge`, without freezing its execution flow in this phase.

## Out Of Scope

- Defining the final execution architecture of `core agent`
- Query-parameter-sensitive page identity
- Context compaction or aggressive observe-time filtering as a first-class design goal
- A full replay script or code-only deterministic recorder as the primary refinement output
- Multi-site taxonomy such as a global `siteKey` ontology

## Critical Paths

1. Replace the current sidecar review flow with a true `ReAct` refinement loop where `refine agent` owns browser decisions.
2. Define agent-facing tools with a split boundary:
   - browser-related `observe.*` and `act.*` tools are adapted over Playwright MCP
   - `hitl.request`, `knowledge.record_candidate`, and `run.finish` are runtime-native tools
3. Freeze a minimal page identity and observation contract that is fully grounded in Playwright-observable data.
4. Record reusable `AttentionKnowledge` that captures what to keep, ignore, target, and treat as success cues for future runs.
5. Keep runtime responsibilities narrow: tool wiring, artifacts, evidence, and safety budget only.

## Frozen Contracts

- Main runtime loop:
  - `refine agent` runs a ReAct-style loop over browser tools.
  - Each turn may choose one of: observe, act, request HITL, record knowledge, finish.
  - If a turn requests HITL, the run pauses for human input and resumes the same ReAct loop after a human response is attached.
- Browser access:
  - `refine agent` does not receive raw Playwright MCP tools directly.
  - Runtime exposes browser-related agent-facing tools via a thin adapter layer over Playwright MCP.
  - Non-browser tools such as HITL, knowledge recording, and run finalization are runtime-native and do not wrap MCP browser calls.
- Tool execution model:
  - Browser-facing tools should stay as close as possible to the agent's ReAct loop.
  - `observe` tools are the main state-reading abstraction.
  - `act` tools should stay thin and close to underlying browser action primitives.
  - Runtime may add evidence capture and normalization, but should not push semantic progress judgment into action wrappers.
- Page identity v1:
  - `url`
  - `origin`
  - `normalizedPath`
  - `title`
  - `normalizedPath` is based on `pathname` only in v1.
  - Query parameters are ignored by default in v1.
- Evidence references:
  - `observationRef` / `evidenceRef` are provenance-only fields.
  - They are not part of long-term page identity.
- Observation contract:
  - `observe.page` returns the current page snapshot plus page identity.
  - `observe.query` is used when page-level observation is not sufficient to support a safe action decision.
  - `observe.query` execution is driven only by structured fields (`mode`, `text`, `role`, `elementRef`, `limit`, and future explicitly frozen fields).
  - Runtime must not use free-form `intent` to include, exclude, or re-rank query matches in v1.
  - Runtime must not perform semantic candidate expansion or semantic relevance ranking in `observe.query`.
  - Each `actionableElement` must include:
    - `elementRef`
    - `sourceObservationRef`
    - `role`
    - `rawText`
    - `normalizedText`
  - `elementRef` must be minted from Playwright-grounded observations and remain auditable to its `sourceObservationRef`.
- Knowledge output:
  - Long-term refinement output is `AttentionKnowledge`, not a rigid replay path.
  - v1 knowledge categories:
    - `keep`
    - `ignore`
    - `action-target`
    - `success-indicator`
  - `taskScope` uses a coarse task definition in v1.
  - Knowledge must remain compact and goal-oriented enough for future `refine agent` consumption; it must not reintroduce the old failure mode where stage-specific structured payloads distract the model from the current objective.
  - v1 cross-run reuse boundary is mandatory:
    - run `N` can promote `AttentionKnowledge` entries
    - run `N+1` can load those entries by coarse `taskScope` and `PageIdentity`
    - loaded entries are injected as compact guidance, not stage-wise prompt packs
- HITL:
  - Only `refine agent` may request HITL.
  - HITL request and response are both natural-language-first.
  - A human response resumes the same refinement run; it does not fork a separate control flow or hand control back to runtime heuristics.
  - Runtime may not inject forced HITL as part of the main decision flow.
- Finish conditions:
  - `goal_achieved`
  - `hitl_requested` means the run is paused awaiting human input, not semantically finished
  - `hard_failure`
  - `budget_exhausted` exists only as a runtime safety fuse

## Pre-Plan Gate

Before entering implementation planning, this spec revision must pass a lightweight freeze gate:

1. One independent subagent review on this spec revision reports no blocking findings.
2. Human owner review confirms this revision is acceptable as the planning baseline.

If blocker findings appear, update this spec first and re-run the same gate. Do not start `writing-plans` until the gate passes.

## Contract Scope

This spec freezes the architecture direction first, but v1 implementation still requires an explicit contract-freeze pass before code changes begin.

The contract surface is split into four groups:

1. Browser-facing agent tools
   - `observe.page`
   - `observe.query`
   - `act.click`
   - `act.type`
   - `act.press`
   - `act.navigate`
   - additional browser tools only if needed by evidence
2. Runtime-native agent tools
   - `hitl.request`
   - `knowledge.record_candidate`
   - `run.finish`
3. Knowledge and page-state contracts
   - `PageIdentity`
   - `PageObservation`
   - `ActionExecutionResult`
   - `AttentionKnowledge`
4. Artifact contracts
   - turn log
   - browser observation log
   - action execution log
   - knowledge event log
   - final run summary

## Contract Freeze Order

The next design step should freeze contracts in this order:

1. Browser-facing tool request/response contracts
   - because they determine what `refine agent` can see and do
2. `PageIdentity` and `PageObservation`
   - because knowledge and action records depend on them
3. `AttentionKnowledge`
   - because this is the main long-term output of refinement
4. Runtime-native tools
   - because they depend on the turn model and knowledge model
5. Artifact files and event schemas
   - because they should reflect the already-frozen loop and tool contracts

Implementation should not start until at least steps 1-3 are frozen.

## Minimum Contract Expectations

Even before the exact schemas are frozen, v1 contracts must obey these rules:

- Every browser-related tool response must include enough page identity to place the result in context.
- `observe` outputs and `act` outputs must use the same `PageIdentity` representation.
- `observe.page` must at minimum return:
  - `page.url`
  - `page.origin`
  - `page.normalizedPath`
  - `page.title`
  - `snapshot`
  - `observationRef`
- `observe.query` must at minimum return:
  - `page.origin`
  - `page.normalizedPath`
  - `observationRef`
  - `matches[]`
- `observe.query` request design intent:
  - support `mode=search` and `mode=inspect`
  - `search` is driven by structured query fields such as `text`, `role`, and `limit`
  - `inspect` is driven by `elementRef`
  - `intent` is descriptive context, not the primary execution input
- `observe.query` execution constraints:
  - allowed runtime narrowing is structural-only and deterministic over frozen structured fields
  - runtime must not add semantic candidate expansion
  - runtime must not reorder matches using inferred intent semantics
- Every `observe.query` match must carry:
  - `elementRef`
  - `sourceObservationRef`
  - `role`
  - `rawText`
  - `normalizedText`
- Any `elementRef` consumed by an `act.*` tool must remain paired with its `sourceObservationRef` for provenance-safe replay and audit.
- Any field intended for long-term knowledge reuse must come from the same Playwright-grounded observation pipeline used during execution.
- Provenance fields and reusable knowledge fields must remain separate.
  - evidence refs are for audit
  - knowledge cues are for reuse
- Runtime-native tools must not smuggle browser semantics that bypass the browser-facing observation/action contracts.

## Browser-Facing Tool Design Intent

The browser-facing tool layer exists to give `refine agent` real action ownership without forcing it to consume raw Playwright MCP tool sprawl directly.

### Goals

- Let `refine agent` decide what to observe and what to do next.
- Keep Playwright-backed observations and actions grounded in one consistent execution pipeline.
- Return normalized, auditable results instead of raw MCP output noise.
- Avoid rebuilding the old architecture where runtime silently makes semantic decisions for the agent.

### Boundary

- Browser-facing tools are the only tools that may touch page state directly.
- They are implemented by runtime adapters on top of Playwright MCP.
- They may perform small transactional wrapper work:
  - result normalization
  - evidence capture
  - raw tool-call logging
- They may not inject hidden semantic judgments such as:
  - whether progress happened
  - whether HITL is needed
  - whether a cue should become long-term knowledge

### v1 Tool Families

- Observation tools:
  - `observe.page`
  - `observe.query`
- Action tools:
  - `act.click`
  - `act.type`
  - `act.press`
  - `act.navigate`
- Additional browser-facing tools are allowed only if evidence shows the v1 set is insufficient.

### Observation Design Intent

- `observe.page` is the default full-page read.
  - In v1 it should return the current page snapshot directly, plus page identity fields.
  - It should not perform semantic narrowing or aggressive filtering in the first iteration.
- `observe.query` is the page-local query tool.
  - It replaces the need for separate `observe.elements` and `observe.element` tools in v1.
  - It should support both:
    - candidate search across the current page
    - local inspection of a specific previously returned element
  - Runtime may do structural deterministic narrowing here, but the final semantic choice still belongs to `refine agent`.
  - Its execution is driven by `mode` plus structured query fields, not by deep parsing of free-form `intent`.
  - `intent` may be recorded for audit, but runtime must not use `intent` to include, exclude, or rerank candidates in v1.

### Action Design Intent

- Action tools represent browser mutations initiated by `refine agent`.
- In v1 they should remain thin wrappers around browser action primitives.
- Their main purpose is to:
  - execute the requested mutation
  - preserve raw tool-call evidence
  - return a normalized action status
- They should not be responsible for semantic interpretation of page change or task progress.
- If the agent needs to understand what changed, it should do so through a follow-up `observe` turn.

## Core Contract Object Design Intent

The first contract-freeze pass should center on four object families.

### `PageIdentity`

Purpose:
- Provide a stable page context anchor that is lightweight enough for reuse across turns.

v1 intent:
- Use page facts that are mechanically available and relatively stable.
- Prefer:
  - `url`
  - `origin`
  - `normalizedPath`
  - `title`
- Ignore query parameters by default in v1.

### `PageObservation`

Purpose:
- Represent what the agent learned from a browser observation turn.

v1 intent:
- Keep observation grounded in Playwright-backed evidence.
- For `observe.page`, return the current page snapshot without semantic narrowing, plus page identity and provenance.
- For `observe.query`, return query matches from the current page using a stable minimum cue set:
  - `elementRef`
  - `sourceObservationRef`
  - `role`
  - `rawText`
  - `normalizedText`
- `elementRef` scope must be explicit and auditable:
  - query matches must be traceable to a Playwright-grounded observation via `sourceObservationRef`
  - query-only synthetic refs that cannot be linked to observation evidence are not allowed

### `ActionExecutionResult`

Purpose:
- Represent what happened when the agent chose to mutate browser state.

v1 intent:
- Tie each action back to:
  - the executed browser mutation
  - the minimal evidence needed to audit that mutation
- Keep semantic interpretation out of the object itself.
  - It should describe what happened, not decide whether it was the right move.

### `AttentionKnowledge`

Purpose:
- Capture reusable page-attention guidance for later refinement runs.

v1 intent:
- Store compact, goal-preserving guidance rather than replay scripts.
- Use coarse task scope.
- Focus on four knowledge categories:
  - `keep`
  - `ignore`
  - `action-target`
  - `success-indicator`
- Reuse only fields that can be traced back to the same browser observation pipeline used during execution.

## Architecture Invariants

- `refine agent` is the only decision-making brain in refinement mode.
- Runtime does not semantically decide progress, relevance, HITL need, or task success on behalf of `refine agent`.
- The default refinement rhythm is `observe -> act -> observe`, with semantic interpretation owned by `refine agent`.
- All reusable knowledge must be grounded in Playwright-observable evidence.
- Long-term knowledge may include DOM-adjacent structure, element role/type, and visible text, but all must be sourced from the same observation pipeline used during execution.
- Runtime may do mechanical compression, normalization, and deterministic structural candidate filtering, but not hidden semantic filtering, semantic ranking, or intent-driven pruning that replaces agent judgment.
- Knowledge injection for later refinement runs must stay compact, task-relevant, and subordinate to the current run goal.
- `core agent` remains a future consumer of `AttentionKnowledge`; its execution flow is not defined in this spec.

## Failure Policy

- Invalid or missing runtime/tool state should fail explicitly with enough evidence to diagnose the issue.
- Runtime may guard against runaway loops using turn/tool budgets, but this is a safety mechanism rather than agent logic.
- Observation artifacts should preserve enough raw evidence to audit why a decision was made.
- No hidden fallback should reintroduce the old pattern where runtime heuristics silently replace `refine agent` decisions.
- If context size becomes a real task bottleneck, observe narrowing or compacting may be introduced later, but only after evidence shows the bottleneck exists.
- If a knowledge payload starts behaving like a bulky multi-stage prompt pack instead of compact attention guidance, treat that as a design failure and reduce the payload rather than adding more formatting.

## Acceptance

- Write a corresponding implementation plan from this spec before changing runtime code.
- Do not start implementation planning until `Pre-Plan Gate` has passed for the current spec revision.
- Before implementation, add a contract-freeze update to this spec or a directly-related contract addendum spec.
- Preserve Harness entrypoint health:
  - `node "$HOME/.coding-cli/skills/harness-doc-health/scripts/doc-health.js" . --phase bootstrap`
- Preserve current project verification:
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run hardgate`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
- The implementation plan must explicitly cover:
  - new refine-agent loop ownership
  - agent-facing browser tool adapter layer
  - observation/action transaction artifacts
  - `AttentionKnowledge` persistence shape
  - the minimal cross-run reuse handshake (`N` promote -> `N+1` load by coarse `taskScope` + `PageIdentity`)
  - compact, goal-preserving knowledge consumption format for later refine runs
  - runtime safety fuse and natural-language HITL flow

## Deferred Decisions

- Exact JSON schema for each agent-facing tool response
- Exact browser-facing tool set required for v1 and which tools are optional
- Exact normalization rules for `normalizedText`
- Exact `PageIdentity` object shape and normalization algorithm for `normalizedPath`
- Exact `PageObservation` shape, including the exact returned shape of `snapshot`
- Exact `ActionExecutionResult` shape, including before/after evidence fields
- Exact `AttentionKnowledge` schema, including cue payload structure and category-specific fields
- Exact request shape for `observe.query`, including how broad search and local element inspection share one tool
- Exact promotion policy beyond the frozen minimum cross-run reuse boundary
- Exact payload shape and budget for `AttentionKnowledge` consumption in later refine runs
- Exact runtime artifact file names and JSONL/JSON schemas
- If and when query parameters should participate in page identity
- If and when a separate `operator` layer is needed for context control
- How `core agent` will consume `AttentionKnowledge` in its own execution phase
