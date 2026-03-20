---
doc_type: spec
status: archived
implements:
  - docs/superpowers/specs/2026-03-19-agent-architecture-redesign.md
related:
  - docs/superpowers/plans/2026-03-20-refine-agent-react-implementation.md
---

# Refine Agent ReAct Contracts (v1 Freeze)

## Scope

This addendum freezes exact v1 contracts for:

- Browser-facing tools:
  - `observe.page`
  - `observe.query`
  - `act.click`
  - `act.type`
  - `act.press`
  - `act.navigate`
- Runtime-native tools:
  - `hitl.request`
  - `knowledge.record_candidate`
  - `run.finish`
- Shared domain types:
  - `PageIdentity`
  - `PageObservation`
  - `ActionExecutionResult`
  - `AttentionKnowledge`

The contracts below are normative for implementation. If runtime behavior conflicts with this doc, this doc wins.

## Shared Types

### `PageIdentity`

```ts
interface PageIdentity {
  url: string;
  origin: string;
  normalizedPath: string; // pathname only in v1
  title: string;
}
```

### `PageObservation`

```ts
interface PageObservation {
  observationRef: string; // provenance-only
  page: PageIdentity;
  snapshot: string;
  capturedAt: string; // ISO 8601
}
```

### `ActionExecutionResult`

```ts
interface ActionExecutionResult {
  action: "click" | "type" | "press" | "navigate";
  success: boolean;
  sourceObservationRef: string;
  targetElementRef?: string;
  page: PageIdentity;
  evidenceRef?: string;
  message?: string;
}
```

### `AttentionKnowledge`

```ts
type AttentionKnowledgeCategory = "keep" | "ignore" | "action-target" | "success-indicator";

interface AttentionKnowledge {
  id: string;
  taskScope: string; // coarse task scope in v1
  page: Pick<PageIdentity, "origin" | "normalizedPath">;
  category: AttentionKnowledgeCategory;
  cue: string;
  rationale?: string;
  sourceRunId: string;
  sourceObservationRef: string;
  sourceActionRef?: string;
  confidence?: number; // 0..1
  promotedAt: string; // ISO 8601
}
```

## Browser-Facing Tools

### `observe.page`

Request:

```ts
interface ObservePageRequest {}
```

Response:

```ts
interface ObservePageResponse {
  observation: PageObservation;
}
```

Required response fields are fixed:

- `observation.page.url`
- `observation.page.origin`
- `observation.page.normalizedPath`
- `observation.page.title`
- `observation.snapshot`
- `observation.observationRef`

### `observe.query`

Request:

```ts
type ObserveQueryMode = "search" | "inspect";

interface ObserveQueryRequest {
  mode: ObserveQueryMode;
  intent?: string; // descriptive only, never used for semantic filtering/ranking
  text?: string;
  role?: string;
  elementRef?: string;
  limit?: number;
}
```

Allowed narrowing fields in v1 (deterministic only):

- `mode`
- `text`
- `role`
- `elementRef`
- `limit`

Response:

```ts
interface ObserveQueryMatch {
  elementRef: string;
  sourceObservationRef: string;
  role: string;
  rawText: string;
  normalizedText: string;
}

interface ObserveQueryResponse {
  observationRef: string;
  page: Pick<PageIdentity, "origin" | "normalizedPath">;
  matches: ObserveQueryMatch[];
}
```

Execution constraints:

- Runtime must not use free-form `intent` for include/exclude/rerank decisions.
- Runtime must not perform semantic expansion or relevance ranking.
- Match ordering must be deterministic given the same observation and request.

### `act.click`

Request:

```ts
interface ActClickRequest {
  elementRef: string;
  sourceObservationRef: string;
}
```

Response:

```ts
interface ActClickResponse {
  result: ActionExecutionResult; // action = "click"
}
```

### `act.type`

Request:

```ts
interface ActTypeRequest {
  elementRef: string;
  sourceObservationRef: string;
  text: string;
  submit?: boolean;
}
```

Response:

```ts
interface ActTypeResponse {
  result: ActionExecutionResult; // action = "type"
}
```

### `act.press`

Request:

```ts
interface ActPressRequest {
  key: string;
  sourceObservationRef: string;
}
```

Response:

```ts
interface ActPressResponse {
  result: ActionExecutionResult; // action = "press"
}
```

### `act.navigate`

Request:

```ts
interface ActNavigateRequest {
  url: string;
  sourceObservationRef: string;
}
```

Response:

```ts
interface ActNavigateResponse {
  result: ActionExecutionResult; // action = "navigate"
}
```

## Runtime-Native Tools

### `hitl.request`

Request:

```ts
interface HitlRequest {
  prompt: string;
  context?: string;
}
```

Response:

```ts
interface HitlResponseInline {
  status: "answered";
  answer: string;
}

interface HitlResponsePaused {
  status: "paused";
  resumeRunId: string;
  resumeToken: string;
}

type HitlRequestResponse = HitlResponseInline | HitlResponsePaused;
```

If inline answer is unavailable, runtime must return `status="paused"` and persist reattachment payload for the same run.

### `knowledge.record_candidate`

Request:

```ts
interface KnowledgeRecordCandidateRequest {
  taskScope: string;
  page: Pick<PageIdentity, "origin" | "normalizedPath">;
  category: AttentionKnowledgeCategory;
  cue: string;
  rationale?: string;
  sourceObservationRef: string;
  sourceActionRef?: string;
}
```

Response:

```ts
interface KnowledgeRecordCandidateResponse {
  accepted: true;
  candidateId: string;
}
```

`record_candidate` only appends candidates. Promotion happens at runtime completion.

### `run.finish`

Request:

```ts
type RunFinishReason = "goal_achieved" | "hard_failure";

interface RunFinishRequest {
  reason: RunFinishReason;
  summary: string;
}
```

Response:

```ts
interface RunFinishResponse {
  accepted: true;
  finalStatus: "completed" | "failed";
}
```

`hitl_requested` is represented by paused run status, not `run.finish`.

## Run Status Contracts

```ts
type RefinementRunStatus =
  | "completed"
  | "failed"
  | "paused_hitl"
  | "budget_exhausted";
```

- `paused_hitl` means waiting for human input and resumable in the same run.
- `budget_exhausted` is runtime safety fuse and must not be silently remapped.

## Cross-Run Knowledge Handshake (Mandatory)

Minimal v1 handshake is fixed:

1. Run `N` records candidates with `knowledge.record_candidate`.
2. Runtime promotes at least one candidate to `AttentionKnowledge` before successful close.
3. Run `N+1` loads promoted entries by:
   - `taskScope`
   - `page.origin + page.normalizedPath`
4. Loaded entries are injected as compact guidance, not staged orchestration payloads.

Handshake observability requirements:

- Promotion events must include `sourceRunId`.
- Load events must include matched keys and loaded ids count.
