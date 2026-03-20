---
doc_type: spec
status: draft
supersedes: []
related:
  - docs/superpowers/specs/2026-03-20-refine-agent-react-contracts.md
  - docs/superpowers/plans/2026-03-20-refine-react-tool-surface-hardening-implementation.md
---

# Refine React Tool Surface Hardening Spec

## Problem

Recent real runs exposed a tool-surface contract gap rather than an agent-strategy gap:

- Screenshot intent exists in user task, but refine-react tool surface does not expose screenshot capability.
- Refine tool schemas injected to the model are currently too weak (`type: object` only), causing repeated argument drift (`missing required argument`, wrong field names, invalid enum values).
- `run.finish` was called repeatedly with semantically similar summaries, but non-frozen `reason` values mapped to failed status.
- `knowledge.record_candidate` call shape drifted and failed, so no AttentionKnowledge was persisted/promoted.
- Terminal HITL interaction still uses legacy structured prompt template (`issueType`, `failureReason`, `beforeState`, `Human action taken`, etc.), so operator interaction does not follow natural-language-first contract.

This spec defines the next scope as a **tool-surface and contract hardening** iteration.

## Success

- Add a first-class screenshot capability to refine-react tool surface so screenshot-required tasks do not depend on prompt-level workaround or ad hoc HITL.
- Refine-react tools are injected with field-level JSON schema (required fields, enums, and constrained shapes), not generic object schema.
- `run.finish` reason contract is explicit and consistently enforced end-to-end (`goal_achieved | hard_failure`).
- Terminal HITL interaction is natural-language-first for both request display and operator response collection, without exposing schema-like field labels in terminal UX.
- At least one fresh real refinement run for screenshot-required task completes with `status=completed` and writes screenshot evidence.
- At least one valid `knowledge.record_candidate` succeeds and is promoted into reusable AttentionKnowledge in artifacts/store.

## Out Of Scope

- Broad architecture redesign of refinement runtime.
- Replacing pi-agent framework or MCP transport stack.
- Prompt-level behavioral workaround as primary fix for missing runtime capability.

## Critical Paths

1. Add missing tool capability (`act.screenshot`) through refine-react adapter chain.
2. Harden refine-react `listTools()` schemas so model receives exact call contracts.
3. Validate completion semantics and knowledge persistence in fresh E2E evidence.
4. Align terminal HITL UX with natural-language-first contract so runtime/operator handoff is clear and non-rigid.

## Frozen Contracts

- Refine-react exposed tool list becomes:
  - `observe.page`
  - `observe.query`
  - `act.click`
  - `act.type`
  - `act.press`
  - `act.navigate`
  - `act.screenshot` (new)
  - `hitl.request`
  - `knowledge.record_candidate`
  - `run.finish`
- `run.finish.reason` enum remains frozen as `goal_achieved | hard_failure`.
- `knowledge.record_candidate` required fields remain strict: `taskScope`, `page.origin`, `page.normalizedPath`, `category`, `cue`, `sourceObservationRef`.
- Schema provided to model must be field-level and machine-checkable via `listTools()` output.

## Architecture Invariants

- Refinement mode keeps adapter boundary: `AgentLoop -> RefineReactToolClient -> raw MCP browser tools`.
- Refine agent only sees refine-react surface, not raw browser MCP tool sprawl.
- Runtime remains explicit-failure oriented; no silent fallback that masks contract violations.

## Failure Policy

- Invalid tool arguments must fail explicitly with precise field-level error.
- Missing screenshot capability is treated as implementation defect (this spec closes it), not agent fault.
- When screenshot execution fails at runtime (site/permission/transient), allow HITL as recovery path with explicit evidence.

## Acceptance

- Contract tests updated and passing for new tool surface and strict schema exposure.
- Fresh E2E run for task `打开小红书，保存一个图文稿（不发布），标题为“agent测试+时间”，正文为“啦啦啦今天是（几月几号几点钟）”` ends with completed status and draft evidence.
- Draft content in artifacts must include:
  - title pattern: `agent测试+<time>`
  - body pattern: `啦啦啦今天是<MM月DD日HH点MM分>`
- Fresh E2E run shows at least one successful candidate knowledge record and one promoted knowledge event.
- Terminal HITL UX no longer prints structured schema-style labels (`issueType:`, `failureReason:`, `beforeState:`, `Human action taken:`, `Reusable next-time rule:`, `Resume instruction:`); instead it presents a natural-language incident brief and collects optional natural-language resume guidance.
- Verification gates pass:
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run test`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`

## Deferred Decisions

- Whether screenshot should be a dedicated action (`act.screenshot`) or folded into a generic evidence tool beyond v1.
- Whether knowledge promotion should remain end-of-run only or support mid-run partial promotion in future iterations.
