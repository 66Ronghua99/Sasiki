---
doc_type: spec
status: completed
supersedes: []
related:
  - docs/project/refine-observe-page-surface-analysis.md
  - docs/project/refine-observation-enhancement-decision-matrix.md
  - apps/agent-runtime/src/application/refine/tools/definitions/observe-page-tool.ts
  - apps/agent-runtime/src/application/refine/tools/definitions/knowledge-record-candidate-tool.ts
  - apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts
  - apps/agent-runtime/src/application/refine/attention-guidance-loader.ts
  - apps/agent-runtime/src/application/refine/tools/services/refine-run-service.ts
  - apps/agent-runtime/src/domain/attention-knowledge.ts
  - apps/agent-runtime/src/domain/refine-react.ts
---

# Refine Page-Level Retrieval Cues Design

## Problem

The current refine knowledge loop does not yet produce the kind of reuse we want.

Today:

- `observe.page` can already keep the latest snapshot in runtime memory and optionally omit raw snapshot text from the agent response
- `observe.query` can deterministically search the latest captured snapshot
- promoted knowledge is loaded as coarse text guidance

But the reuse boundary is still wrong for the target workflow:

- knowledge is gated by `taskScope + page`, which makes reuse brittle when the same page appears under slightly different task wording
- stored knowledge is shaped as generic attention categories instead of direct retrieval hints
- runtime loads knowledge mainly as prompt guidance rather than as page-bound tool context

The desired behavior is different:

- when the agent returns to the same page, it should immediately receive lightweight page-level hints about what to search for
- those hints should help it use `observe.query` to locate the relevant `ref`
- the agent should still decide for itself how to interpret query results and which action to take next

## Goal

Turn refine knowledge from generic attention notes into page-level retrieval cues.

Each cue should act like a short note from the agent to its future self:

- on this page
- these are the keywords worth searching first
- this short guide explains what those keywords are useful for

The first version should stay minimal, deterministic, and fail-fast.

## Non-Goals

- No task-specific runtime heuristics.
- No site-specific special cases.
- No stage or step scripting.
- No new knowledge search tool in this pass.
- No extra fallback or reranking logic in runtime.
- No expansion of the refine system prompt as the primary delivery mechanism.
- No large structured knowledge schema with target roles, action enums, confidence scores, or weights.

## Chosen Direction

Use page-level retrieval cues keyed only by normalized page identity:

- `page.origin`
- `page.normalizedPath`

Ignore `taskScope` for knowledge retrieval and storage matching.

Keep the retrieval cue itself minimal:

- `guide`
- `keywords`

Deliver cues directly through `observe.page`, alongside the current observation payload.

## Why Page-Level Matching

`taskScope` is currently just a trimmed slice of the task text. It is not a stable taxonomy and it is too easy for wording differences to suppress otherwise useful knowledge reuse.

The page itself is the stable reuse boundary we actually care about:

- the same homepage should load the same homepage retrieval hints
- the same inbox page should load the same inbox retrieval hints
- the same conversation-detail page should load the same conversation-detail retrieval hints

This keeps matching simple and avoids overfitting knowledge to one exact task phrase.

## Retrieval Cue Shape

The reusable payload should stay intentionally small.

Each promoted cue contains:

- `page`
  - `origin`
  - `normalizedPath`
- `guide`
  - one short sentence written by the agent for future runs
- `keywords`
  - one to three strings that should be searched first on that page

Examples of the intended style:

- `guide`: `If the goal is to enter message handling, search for "customer messages" first.`
- `keywords`: `["customer messages"]`

- `guide`: `To verify whether the queue is empty, search the inbox tabs and empty-state copy before reading the full page.`
- `keywords`: `["unassigned", "empty", "chat"]`

The cue should not attempt to encode the full procedure.

## Fields Explicitly Removed

The first version should not preserve the old abstraction-heavy fields as part of the active cue payload:

- `taskScope`
- `category`
- `cue`
- `targetType`
- `action`
- confidence weights
- ranking metadata

If any of that context matters, it should live inside the plain-language `guide`, not in additional runtime-owned structure.

## Observe Page Delivery

`observe.page` already has the right high-level execution role:

- capture the latest observation
- keep the snapshot in runtime memory
- optionally omit raw snapshot text from the returned payload

This design extends that tool in one way only:

- add `pageKnowledge` to the response

### `observe.page` response shape

The response should become:

- `observation`
- `pageKnowledge`

Where each `pageKnowledge` item contains only:

- `guide`
- `keywords`

Optional audit-only identifiers such as `knowledgeId` may be added later if needed, but they are not required for the agent-facing first version.

## Runtime Behavior

Runtime responsibility stays intentionally narrow.

When `observe.page` completes:

1. resolve the current page identity from the fresh observation
2. load any promoted cues whose `origin + normalizedPath` exactly match that page
3. return those cues unchanged as `pageKnowledge`

Runtime must not:

- infer which cue is best
- rerank by task text
- expand keywords
- guess equivalent pages
- fall back to fuzzy matching
- convert cues into an action plan

If there are no cues for the current page, `pageKnowledge` is simply an empty array.

## Agent Workflow

The intended loop becomes:

1. call `observe.page`
2. inspect `observation` and any returned `pageKnowledge`
3. prefer the loaded `keywords` for targeted `observe.query`
4. inspect query matches and choose the next action
5. if the page reveals a new stable retrieval hint, record it with `knowledge.record_candidate`

The agent remains the only decision-maker for:

- whether to trust a cue
- how to query the page
- whether the returned `ref` is the right one
- what action to take next

## Knowledge Record Tool Semantics

`knowledge.record_candidate` should be repurposed from generic attention-note capture into retrieval-cue capture.

The tool should accept only:

- `page`
  - `origin`
  - `normalizedPath`
- `guide`
- `keywords`
- `sourceObservationRef`
- `sourceActionRef` optional

### Intended usage

The agent should call this tool only when:

- it is on a real current page
- a keyword or short retrieval guide clearly helped it narrow the search space
- the same hint is likely to help again on the same page later

### What not to record

The tool description should explicitly discourage:

- full procedures
- multi-step scripts
- fragile one-off details
- broad summaries of everything on the page
- cues that are not grounded in the current page observation

## Tool Description Strategy

The first version should teach this behavior mainly through tool schema and tool descriptions, not by expanding the refine system prompt.

This keeps the coupling lower and avoids pushing too much policy into a global prompt.

The refine system prompt can remain largely unchanged in this pass.

## Persistence Model

Persisted promoted knowledge should keep only the fields needed for reuse and audit:

- `id`
- `page`
  - `origin`
  - `normalizedPath`
- `guide`
- `keywords`
- `sourceRunId`
- `sourceObservationRef`
- `sourceActionRef` optional
- `promotedAt`

The only fields intended for future agent consumption are:

- `guide`
- `keywords`

All other fields are for provenance and debugging.

## Bootstrap Loading

Refine bootstrap may still perform its normal startup observation so the run begins with a grounded page.

However, knowledge delivery should no longer depend primarily on injecting loaded guidance into the start prompt.

The active runtime-facing delivery path should be:

- fresh `observe.page`
- page-match load
- `pageKnowledge` returned with the tool result

Prompt-time loading, if temporarily retained for compatibility, should be treated as secondary and should not become the main design truth for this pass.

## Fail-Fast Rules

This design intentionally follows a strict fail-fast policy:

- if page identity is missing, do not guess
- if the page does not match any stored cue, return no cues
- if `knowledge.record_candidate` is missing required fields, fail
- if `sourceObservationRef` is invalid, fail
- do not silently rewrite or infer missing cue structure

## Acceptance

- Page-level knowledge matching is based only on `origin + normalizedPath`.
- `taskScope` is removed from the retrieval gate.
- `observe.page` returns `pageKnowledge` alongside `observation`.
- `pageKnowledge` contains only lightweight retrieval cues, not procedures.
- `knowledge.record_candidate` is reshaped around `page + guide + keywords`.
- Runtime performs exact loading only and does not introduce heuristic judgment, reranking, or fallback logic.
- The agent remains responsible for turning retrieval cues into `observe.query` and `act.*` decisions.

## Deferred Decisions

- Whether to later remove prompt-time knowledge injection entirely after the tool-based path is proven.
- Whether to later deduplicate or merge multiple cues on the same page.
- Whether to later expand `observe.query` over more deterministic text buckets.
- Whether to later expose optional audit identifiers inside `pageKnowledge`.
