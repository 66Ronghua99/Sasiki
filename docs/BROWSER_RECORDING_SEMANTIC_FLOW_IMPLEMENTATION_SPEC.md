# Browser Recording Semantic Flow - Implementation Spec (v1)

Status: Draft  
Owner: Engine Team  
Last Updated: 2026-03-03  
Depends on: `docs/BROWSER_RECORDING_SEMANTIC_FLOW_REQUIREMENTS.md`

## 1. Purpose

本文件补齐 RFC 的实现细则，目标是让不同开发者在不讨论隐式假设的情况下得到一致实现结果。

## 2. Canonicalizer Contract

## 2.1 Component and Interface

Component: `Canonicalizer`  
Suggested file: `src/sasiki/workflow/canonicalizer.py`

Input:

1. Ordered `RawEvent[]` from `RecordingParser` (timestamp ascending)

Output:

1. Ordered `CanonicalAction[]`
2. Conversion diagnostics:
`warnings[]`, `dropped_event_ids[]`, `low_confidence_action_ids[]`

## 2.2 Deterministic Processing Pipeline

Processing steps must follow this order:

1. Validate raw schema (required fields, enum membership)
2. Normalize event fields (`event_type`, `triggered_by`, target text trimming)
3. Group events into action windows
4. Build candidate intents per window
5. Resolve conflicts by score and tie-break rule
6. Emit canonical action with trace links and confidence

No LLM is allowed in Canonicalizer.

## 3. Action Window Rules

Window key: `(tab_id, frame_id)`  
Window boundary occurs when one of below is true:

1. `event_type` is `navigate` and `url` changed
2. time gap > 3000ms
3. tab/frame changed
4. explicit terminal event (`submit`, `tab_switch`, `page_enter`)

Special merge rule:

1. consecutive `fill` on same target within 2000ms merge into one canonical `fill`
2. keep earliest `value_before`, latest `value_after`
3. preserve all `source_event_ids`

## 4. Intent Inference Rules (Deterministic)

## 4.1 Intent Category Priority

When multiple intent candidates exist, choose by:

1. higher confidence score
2. if tie, fixed priority:
`submit > navigate > search > filter > open > interact > extract > assert > other`
3. if still tie, pick candidate with more matched signals

## 4.2 Rule Matrix

### Rule R1: Explicit Submit

Condition:

1. has raw event `event_type=submit`

Emit:

1. `intent_category=submit`
2. `action_type=submit`
3. confidence `1.00`

### Rule R2: Press Enter Submit

Condition:

1. `fill` on textbox
2. followed by `press` with value `Enter` within 2000ms

Emit:

1. canonical action pair:
`fill` then `submit`
2. submit target fallback includes `press Enter`
3. confidence `0.95`

### Rule R3: Click Submit Button

Condition:

1. `fill` on textbox
2. followed by `click` on button whose role/name matches submit lexicon
3. optional `navigate` triggered_by in (`click`, `submit`)

Emit:

1. canonical action pair:
`fill` then `submit`
2. confidence `0.90`

Submit lexicon (v1):

1. Chinese:
`搜索`, `提交`, `确认`, `发送`
2. English:
`search`, `submit`, `confirm`, `send`

### Rule R4: Navigate

Condition:

1. raw event `event_type=navigate`

Emit:

1. `intent_category=navigate`
2. `action_type=navigate`
3. confidence by `triggered_by`:
`direct=0.95`, `click=0.90`, `submit=0.90`, `redirect=0.80`, `url_change=0.70`

### Rule R5: Open Content

Condition:

1. click target role in (`link`, `listitem`, `article`, `card`)
2. followed by navigate to content-like URL pattern

Emit:

1. `intent_category=open`
2. `intent_label=open_content_item`
3. confidence `0.85`

### Rule R6: Fallback

Condition:

1. no above rule satisfied

Emit:

1. `intent_category=other`
2. `intent_label=unclassified`
3. confidence `0.50`

## 4.3 Confidence Policy

Store `confidence` in every canonical action.

Thresholds:

1. `confidence >= 0.85`:
normal
2. `0.60 <= confidence < 0.85`:
emit warning code `LOW_CONFIDENCE_INTENT`
3. `confidence < 0.60`:
force `intent_category=other` and mark `needs_review=true`

## 5. Postcondition Builder Rules

Each canonical action must have `postconditions[]`.

Builder rules by `action_type`:

1. `fill`:
append `value_equals`
2. `submit`:
append at least one of:
`url_contains`, `count_at_least`, `element_visible`
3. `click`:
append one of:
`element_visible` or `url_contains` (depending on downstream signal)
4. `navigate`:
append `url_contains` target URL fragment

If no valid postcondition can be created:

1. action invalid
2. drop action and emit warning `MISSING_POSTCONDITION`

## 6. Postcondition Evaluator Semantics

Evaluator should be deterministic and timeout-bounded.

Per-condition fields:

1. `timeout_ms` default `3000`
2. `poll_interval_ms` default `200`
3. `settle_ms` default `300`

Evaluation:

1. all conditions use `AND` in v1
2. each condition retries polling until timeout
3. condition true only if stable for `settle_ms`
4. action success if all conditions true

Failure mapping:

1. timeout -> `verification_timeout`
2. locator not found -> `verification_element_not_found`
3. predicate false -> `verification_failed`

## 7. Traceability and Null Reasons

Execution Trace field:
`source_canonical_action_id: str | null`

When null, `source_link_reason` is required and must be one of:

1. `agent_optimization`
2. `recovery_action`
3. `human_intervention`
4. `system_action`
5. `no_reference_action`

Trace chain integrity rule:

1. for every failed step, if `source_canonical_action_id` not null, canonical action must contain non-empty `source_event_ids`

## 8. Generator and Refiner Integration Notes

## 8.1 Generator

Generator must:

1. consume `CanonicalAction[]` only
2. produce `reference_actions[]` with `source_canonical_action_id`
3. produce stage `success_criteria` from canonical `postconditions` templates

## 8.2 Refiner

Refiner must:

1. preserve `source_canonical_action_id` in episode/execution trace
2. when taking non-reference action, emit null + `source_link_reason`
3. verifier consumes structured postconditions, not free text

## 9. Test Matrix (Mandatory)

## 9.1 Unit Tests - Canonicalizer

1. explicit submit event -> `submit` intent
2. fill + Enter -> fill + submit pair
3. fill repeated typing merged into one canonical fill
4. navigate by redirect gets lower confidence
5. unknown sequence falls back to `other`
6. missing postcondition emits warning and drops action

## 9.2 Unit Tests - Evaluator

1. `url_contains` pass/fail
2. `value_equals` pass/fail
3. `count_at_least` pass/fail
4. timeout path and error mapping

## 9.3 Integration Tests

1. recording jsonl -> canonical actions -> semantic stage roundtrip
2. semantic stage -> refiner execution trace with source links
3. failed step traceability reaches raw event ids

## 10. Implementation Checklist

1. Add canonical action models (`workflow/canonical_models.py`)
2. Add canonicalizer (`workflow/canonicalizer.py`)
3. Wire `SkillGenerator` to consume canonical actions
4. Extend `EpisodeEntry` with source link fields
5. Extend execution report serialization with source link fields
6. Add validator and fail-fast checks in generate pipeline
7. Add mandatory test matrix above
