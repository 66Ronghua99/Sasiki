---
doc_type: plan
status: draft
implements:
  - docs/superpowers/specs/2026-03-20-refine-react-tool-surface-hardening.md
verified_by: []
supersedes: []
related:
  - docs/superpowers/specs/2026-03-20-refine-agent-react-contracts.md
  - docs/superpowers/plans/2026-03-20-refine-agent-react-implementation.md
---

# Refine React Tool Surface Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Spec Path:** `docs/superpowers/specs/2026-03-20-refine-react-tool-surface-hardening.md`

**Goal:** Close refinement tool-surface defects by adding screenshot capability and strict schema injection so screenshot-required tasks complete with stable contracts and reusable knowledge output.

**Allowed Write Scope:**
- `apps/agent-runtime/src/domain/**`
- `apps/agent-runtime/src/runtime/replay-refinement/**`
- `apps/agent-runtime/src/infrastructure/hitl/**`
- `apps/agent-runtime/src/core/**`
- `apps/agent-runtime/test/replay-refinement/**`
- `apps/agent-runtime/test/hitl/**`
- `docs/superpowers/specs/**`
- `docs/superpowers/plans/**`
- `PROGRESS.md`
- `NEXT_STEP.md`
- `MEMORY.md`

**Verification Commands:**
- `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-contracts.test.ts`
- `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-tool-client.test.ts`
- `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-run-executor.test.ts`
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

**Evidence Location:**
- `artifacts/e2e/<run_id>/`
- `artifacts/debug/tool-schema-snapshot-*.json`

**Rule:** Do not expand scope during implementation. New requests must be recorded through `CHANGE_REQUEST_TEMPLATE.md`.

---

## File Map

- Modify: `apps/agent-runtime/src/domain/refine-react.ts`
- Modify: `apps/agent-runtime/src/runtime/replay-refinement/refine-react-tool-client.ts`
- Modify: `apps/agent-runtime/src/runtime/replay-refinement/refine-browser-tools.ts`
- Modify: `apps/agent-runtime/src/runtime/replay-refinement/refine-runtime-tools.ts`
- Modify: `apps/agent-runtime/src/infrastructure/hitl/terminal-hitl-controller.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-contracts.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`
- Add/Modify: `apps/agent-runtime/test/hitl/**`
- Modify: `docs/superpowers/specs/2026-03-20-refine-agent-react-contracts.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

## Tasks

### Task 1: Extend Refine Tool Surface With Screenshot Capability

- [ ] Add `act.screenshot` to refine-react contracts (`tool names`, request/response type, and action result mapping).
- [ ] Implement adapter path in `refine-browser-tools.ts` to call browser screenshot MCP tool with deterministic argument mapping and stable evidence output.
- [ ] Ensure screenshot tool is only exposed via refine-react surface (not raw MCP passthrough).
- [ ] Add/adjust focused tests for screenshot action success and required argument validation.

### Task 2: Harden listTools Schema Injection

- [ ] Replace generic `type: object` schemas in refine-react `listTools()` with field-level JSON schema.
- [ ] Freeze required fields and enums for `act.*`, `knowledge.record_candidate`, and `run.finish`.
- [ ] Add assertions in tool-client tests that verify emitted schema shape, required keys, and enum values.
- [ ] Generate a fresh schema snapshot artifact and confirm injected schema to pi-agent matches frozen contracts.

### Task 3: Align Terminal HITL UX To Natural-Language-First

- [ ] Replace terminal HITL structured field-style output with a natural-language incident brief.
- [ ] Remove legacy three-prompt rigid input flow (`Human action taken` / `Reusable next-time rule` / `Resume instruction`) from terminal UX.
- [ ] Keep internal response contract compatibility (`humanAction`, `nextTimeRule`, `resumeInstruction`) while deriving defaults from natural-language interaction.
- [ ] Add focused tests for terminal HITL formatter/output to prevent regression to schema-like prompt labels.

### Task 4: Stabilize Finish Semantics and Knowledge Persistence

- [ ] Ensure tests cover `run.finish.reason` strict enum behavior and reject/flag non-frozen values.
- [ ] Ensure at least one valid `knowledge.record_candidate` path succeeds end-to-end in executor tests.
- [ ] Ensure promoted knowledge is persisted and reloadable for next run in test harness.

### Task 5: End-To-End Verification On Real Task

- [ ] Run one real refinement task: `打开小红书，保存一个图文稿（不发布），标题为“agent测试+时间”，正文为“啦啦啦今天是（几月几号几点钟）”`.
- [ ] Verify run result is `status=completed` and draft evidence exists in run artifacts.
- [ ] Verify draft title/body match acceptance patterns (`agent测试+<time>`, `啦啦啦今天是<MM月DD日HH点MM分>`).
- [ ] Verify run artifacts include successful knowledge events (`candidate_recorded` and `knowledge_promoted`).
- [ ] If run fails, capture exact failing tool call and keep fix scope inside this spec.

### Task 6: Sync Project State Docs

- [ ] Update `PROGRESS.md` with fresh run ids, evidence paths, and resolved issues.
- [ ] Update `MEMORY.md` with only stable lessons (adapter/schema/handoff boundaries).
- [ ] Update `NEXT_STEP.md` to one executable pointer after this plan completes.

## Completion Checklist

- [ ] Spec requirements are covered
- [ ] Screenshot capability is exposed to refine agent through adapter tool surface
- [ ] Refine `listTools()` provides strict field-level schema
- [ ] Fresh E2E draft-save task completes successfully with evidence
- [ ] At least one AttentionKnowledge candidate and promotion event are present in fresh artifacts
- [ ] Verification commands were run fresh
- [ ] Evidence location is populated or explicitly noted
- [ ] Repository state docs are updated
