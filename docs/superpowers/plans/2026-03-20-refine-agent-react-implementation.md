---
doc_type: plan
status: archived
implements:
  - docs/superpowers/specs/2026-03-19-agent-architecture-redesign.md
verified_by: []
supersedes: []
related:
  - docs/superpowers/specs/archive/2026-03-20-agent-architecture-redesign-pre-plan-baseline.md
---

# Refine Agent ReAct Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec Path:** `docs/superpowers/specs/2026-03-19-agent-architecture-redesign.md`

**Goal:** Replace the current stitched replay/refinement stack with a high-authority ReAct `refine agent` that owns observe/act/HITL/knowledge decisions and persists reusable `AttentionKnowledge`.

**Architecture:** Introduce a dedicated refinement tool surface on top of the raw Playwright MCP client instead of exposing raw browser tools directly. Implement a new refinement executor around a session state that records page-grounded evidence, runtime-native tool results, promoted knowledge, and HITL resume semantics, then cut `WorkflowRuntime` over after the new path is verified.

**Tech Stack:** TypeScript, Node 20, `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, Playwright MCP, `tsx --test`, Harness docs.

**Allowed Write Scope:** `apps/agent-runtime/package.json`, `apps/agent-runtime/test/**`, `apps/agent-runtime/src/core/**`, `apps/agent-runtime/src/contracts/**`, `apps/agent-runtime/src/domain/**`, `apps/agent-runtime/src/runtime/**`, `apps/agent-runtime/src/infrastructure/hitl/**`, `docs/superpowers/specs/**`, `docs/superpowers/plans/**`, `docs/project/**`, `docs/architecture/**`, `docs/testing/**`, `PROGRESS.md`, `NEXT_STEP.md`, `MEMORY.md`.

**Verification Commands:**
- Current repo baseline before Task 2 adds a test script:
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run hardgate`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
- New verification layer introduced by this plan:
  - `npm --prefix apps/agent-runtime run test`
- `node "$HOME/.coding-cli/skills/harness-doc-health/scripts/doc-health.js" . --phase bootstrap`

**Evidence Location:** `artifacts/e2e/<run_id>/`, plus fresh lint/hardgate logs and, after Task 2 lands, focused test output from `npm --prefix apps/agent-runtime run test`.

**Rule:** Do not expand scope during implementation. New requests must be recorded through `CHANGE_REQUEST_TEMPLATE.md`.

---

## File Map

- Create: `docs/superpowers/specs/2026-03-20-refine-agent-react-contracts.md`
- Create: `apps/agent-runtime/test/replay-refinement/refine-react-contracts.test.ts`
- Create: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
- Create: `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`
- Create: `apps/agent-runtime/src/domain/refine-react.ts`
- Create: `apps/agent-runtime/src/domain/attention-knowledge.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/refine-react-tool-client.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/refine-browser-tools.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/refine-runtime-tools.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/refine-react-session.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/refine-hitl-resume-store.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/attention-guidance-loader.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/attention-knowledge-store.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts`
- Modify: `apps/agent-runtime/src/index.ts`
- Modify: `apps/agent-runtime/package.json`
- Modify: `apps/agent-runtime/src/core/agent-loop.ts`
- Modify: `apps/agent-runtime/src/domain/agent-types.ts`
- Modify: `apps/agent-runtime/src/runtime/artifacts-writer.ts`
- Modify: `apps/agent-runtime/src/runtime/runtime-config.ts`
- Modify: `apps/agent-runtime/src/runtime/workflow-runtime.ts`
- Modify: `docs/superpowers/specs/2026-03-19-agent-architecture-redesign.md`
- Modify: `docs/project/current-state.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/testing/strategy.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`
- Delete after cutover if unused: legacy stitched refinement gateway/orchestrator/decision stack.

## Tasks

### Task 1: Freeze Exact Contracts Before Runtime Code

**Files:**
- Create: `docs/superpowers/specs/2026-03-20-refine-agent-react-contracts.md`
- Modify: `docs/superpowers/specs/2026-03-19-agent-architecture-redesign.md`

- [x] Write the contract addendum spec that freezes exact request/response shapes for `observe.page`, `observe.query`, `act.*`, `hitl.request`, `knowledge.record_candidate`, `run.finish`, `PageIdentity`, `PageObservation`, `ActionExecutionResult`, and `AttentionKnowledge`.
- [x] Ensure the addendum explicitly freezes the allowed narrowing fields for `observe.query`, the `sourceObservationRef` linkage, and the minimal cross-run `N -> N+1` reuse handshake.
- [x] Link the addendum back to the active architecture spec through metadata or a clearly labeled related-doc pointer without changing the approved architecture scope.
- [x] Run `npm --prefix apps/agent-runtime run lint:docs` to confirm the contract-doc update does not break repo doc references.
- [x] Run `node "$HOME/.coding-cli/skills/harness-doc-health/scripts/doc-health.js" . --phase bootstrap` and confirm it stays green before any runtime code change.
- [ ] Commit only the contract docs with a scoped message such as `docs: freeze refine react contracts`.

### Task 2: Add a Focused Test Harness and Lock Core Domain Types

**Files:**
- Modify: `apps/agent-runtime/package.json`
- Create: `apps/agent-runtime/test/replay-refinement/refine-react-contracts.test.ts`
- Create: `apps/agent-runtime/src/domain/refine-react.ts`
- Create: `apps/agent-runtime/src/domain/attention-knowledge.ts`
- Modify: `apps/agent-runtime/src/domain/agent-types.ts`

- [x] Add a test script to `apps/agent-runtime/package.json` using `tsx --test test/**/*.test.ts`.
- [x] Write a failing contract test that asserts:
  - `observe.page` returns `page.url`, `page.origin`, `page.normalizedPath`, `page.title`, `snapshot`, and `observationRef`
  - `observe.query` matches must include `elementRef`, `sourceObservationRef`, `role`, `rawText`, and `normalizedText`
  - paused HITL is represented as a distinct run status/result shape rather than a fake completion
- [x] Implement `apps/agent-runtime/src/domain/refine-react.ts` with the exact contract objects and helper types used by the addendum spec.
- [x] Implement `apps/agent-runtime/src/domain/attention-knowledge.ts` with the v1 categories (`keep`, `ignore`, `action-target`, `success-indicator`) and the promoted-knowledge handshake fields required for later reuse.
- [x] Update `apps/agent-runtime/src/domain/agent-types.ts` so refinement can report an explicit paused/HITL-awaiting state without overloading `completed` or `failed`.
- [x] Run `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-contracts.test.ts`, then `npm --prefix apps/agent-runtime run lint`, then `npm --prefix apps/agent-runtime run typecheck`.
- [ ] Commit the harness and domain contract changes with a scoped message such as `test: add refine react contract coverage`.

### Task 3: Implement the Composite Refinement Tool Surface

**Files:**
- Create: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/refine-react-tool-client.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/refine-browser-tools.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/refine-runtime-tools.ts`

- [x] Write a failing tool-client test around a stub raw `ToolClient` that verifies the exposed tool catalog is exactly:
  - `observe.page`
  - `observe.query`
  - `act.click`
  - `act.type`
  - `act.press`
  - `act.navigate`
  - `hitl.request`
  - `knowledge.record_candidate`
  - `run.finish`
- [x] In the same test, assert that `observe.query` ignores free-form `intent` for candidate inclusion/exclusion/reranking and only applies deterministic narrowing over the frozen structured fields.
- [x] Implement `refine-browser-tools.ts` so browser-facing tools delegate to the raw Playwright MCP client, normalize responses into the frozen contract shapes, and preserve `sourceObservationRef` provenance.
- [x] Implement `refine-runtime-tools.ts` so runtime-native tools mutate only refinement session state:
  - `hitl.request` records a pause request and either blocks for human input or returns a paused marker
  - `knowledge.record_candidate` appends candidate knowledge without promoting it yet
  - `run.finish` records the agent's finish intent and completion summary
- [x] Implement `refine-react-tool-client.ts` as a composite `ToolClient` that exposes the nine agent-facing tools above and internally routes browser calls versus runtime-native calls without leaking raw MCP browser tools.
- [x] Run `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-tool-client.test.ts`, then `npm --prefix apps/agent-runtime run lint`, then `npm --prefix apps/agent-runtime run typecheck`.
- [ ] Commit the tool-layer changes with a scoped message such as `feat: add refine react tool surface`.

### Task 4: Build the New ReAct Refinement Executor and Attention Knowledge Flow

**Files:**
- Create: `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/refine-react-session.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/refine-hitl-resume-store.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/attention-guidance-loader.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/attention-knowledge-store.ts`
- Create: `apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts`
- Modify: `apps/agent-runtime/src/core/agent-loop.ts`
- Modify: `apps/agent-runtime/src/runtime/artifacts-writer.ts`

- [x] Write a failing executor test that covers:
  - browser observe/action calls flowing through the composite tool client
  - `hitl.request` resuming the same refinement session after human input
  - explicit paused status plus persisted resume payload when human input cannot be completed inline
  - `run.finish` being required for successful completion
  - at least one promoted `AttentionKnowledge` record being written and then available for the next run by coarse `taskScope + PageIdentity`
  - `budget_exhausted` returning the expected runtime safety-fuse result
- [x] Implement `refine-react-session.ts` to hold per-run state:
  - latest page observations
  - runtime-native tool side effects
  - candidate knowledge
  - promoted knowledge
  - finish markers
  - paused/HITL markers
- [x] Implement `refine-hitl-resume-store.ts` so a paused refinement run can persist the minimum state needed to reattach the same run after human input instead of falling back to a new control flow.
- [x] Implement `attention-guidance-loader.ts` so promoted `AttentionKnowledge` is not only persisted, but also loaded into the next refinement run as compact guidance keyed by coarse `taskScope + PageIdentity`.
- [x] Implement `attention-knowledge-store.ts` as the new persistence boundary for `AttentionKnowledge`, keeping the minimal `N promote -> N+1 load` handshake explicit and auditable.
- [x] Modify `artifacts-writer.ts` to add new artifact writers for the refinement ReAct path, including turn logs, browser observations, action executions, knowledge events, and the final run summary without relying on the old orchestrator-specific record shapes.
- [x] Modify `agent-loop.ts` only as needed to support a refinement-specific system prompt and any required completion marker handling; do not broaden it into a second orchestrator.
- [x] Implement `react-refinement-run-executor.ts` around one `AgentLoop` session using the composite tool client, preserving same-run HITL continuation and explicit paused status when human input cannot be completed inline.
- [x] Run `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-run-executor.test.ts`, then `npm --prefix apps/agent-runtime run lint`, then `npm --prefix apps/agent-runtime run typecheck`, and `npm --prefix apps/agent-runtime run build`.
- [ ] Commit the executor and artifact changes with a scoped message such as `feat: add react refinement executor`.

### Task 5: Cut WorkflowRuntime Over and Remove the Stitched Refinement Stack

**Files:**
- Modify: `apps/agent-runtime/src/index.ts`
- Modify: `apps/agent-runtime/src/runtime/workflow-runtime.ts`
- Modify: `apps/agent-runtime/src/runtime/runtime-config.ts`
- Delete if unused: legacy stitched refinement gateway/orchestrator/decision stack.

- [x] Modify `workflow-runtime.ts` so `refinementEnabled` instantiates the new refinement-specific `AgentLoop` and `react-refinement-run-executor.ts` instead of the old orchestrator stack.
- [x] Modify `index.ts` and the runtime entry surface so a paused refinement run has an explicit resume path, for example `--resume-run-id <run_id>`, that reattaches the persisted HITL resume state to the same refinement run.
- [x] Keep the existing config shape stable in `runtime-config.ts`, but stop treating `refinementMode` as an active semantic behavior switch; if the field remains for compatibility, log it as ignored/no-op in the new path.
- [ ] Remove old replay/refinement files only after all of the following are true:
  - focused tests pass
  - the runtime safety fuse is covered by a fresh test
  - one fresh end-to-end refinement smoke has produced a new artifact directory
  - the new path is the only implementation behind `refinementEnabled`
- [x] Run `npm --prefix apps/agent-runtime run lint`, `npm --prefix apps/agent-runtime run hardgate`, `npm --prefix apps/agent-runtime run test`, `npm --prefix apps/agent-runtime run typecheck`, and `npm --prefix apps/agent-runtime run build`.
- [x] Run one mandatory refinement smoke through the built CLI in an environment with CDP, cookies, and MCP, capture the resulting `artifacts/e2e/<run_id>/` path, and treat missing environment prerequisites as a blocker for old-path deletion rather than a reason to skip the check.
- [ ] Commit the runtime cutover with a scoped message such as `refactor: replace stitched refinement runtime`.

### Task 6: Sync Repository Truth Back to Harness Docs

**Files:**
- Modify: `docs/project/current-state.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/testing/strategy.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

- [x] Update the project state docs so they describe the new refinement runtime, the new artifact set, and the paused/resume HITL semantics accurately.
- [x] Update `MEMORY.md` only with stable lessons learned during implementation, not task diary notes.
- [x] Update `PROGRESS.md` with fresh verification evidence and note the old orchestrator path as replaced.
- [x] Update `NEXT_STEP.md` to the single next actionable pointer after implementation and verification complete.
- [x] Run `npm --prefix apps/agent-runtime run lint:docs` to confirm doc references and active pointers remain valid after the final sync.
- [x] Run `node "$HOME/.coding-cli/skills/harness-doc-health/scripts/doc-health.js" . --phase bootstrap` one last time and record the fresh verification commands and evidence paths in the final task notes.
- [ ] Commit the doc sync with a scoped message such as `docs: sync refine react runtime state`.

## Completion Checklist

- [x] Contract addendum exists and matches the approved architecture spec
- [x] New refinement path uses agent-facing tools instead of raw browser MCP tool sprawl
- [x] `observe.query` narrowing is deterministic and structurally bounded
- [x] HITL resumes the same refinement run rather than forking control flow
- [x] At least one promoted `AttentionKnowledge` record can be loaded by a later run
- [x] Paused HITL runs have an explicit resume entrypoint and persisted reattachment state
- [x] Old stitched refinement stack is removed or fully disconnected from the active runtime flag
- [x] `npm --prefix apps/agent-runtime run lint` was run fresh
- [x] `npm --prefix apps/agent-runtime run hardgate` was run fresh
- [x] `npm --prefix apps/agent-runtime run test` was run fresh
- [x] `npm --prefix apps/agent-runtime run typecheck` was run fresh
- [x] `npm --prefix apps/agent-runtime run build` was run fresh
- [x] Harness bootstrap docs health passes
- [x] Evidence location is populated or explicitly noted
- [x] Repository state docs are updated
