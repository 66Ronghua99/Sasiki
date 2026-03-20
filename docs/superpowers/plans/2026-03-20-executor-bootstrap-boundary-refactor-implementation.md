---
doc_type: plan
status: active
implements:
  - docs/superpowers/specs/2026-03-20-executor-bootstrap-boundary-refactor.md
verified_by: []
supersedes:
  - docs/superpowers/plans/2026-03-20-provider-composition-root-refactor-implementation.md
related:
  - docs/superpowers/specs/2026-03-20-executor-bootstrap-boundary-refactor.md
  - apps/agent-runtime/src/runtime/run-executor.ts
  - apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts
  - apps/agent-runtime/src/runtime/runtime-composition-root.ts
  - apps/agent-runtime/scripts/lint-architecture.mjs
---

# Executor And Bootstrap Boundary Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract legacy and refine run bootstrap logic out of executor implementations, then lock the new boundary with lint, focused tests, full repo verification, and one fresh refinement e2e.

**Architecture:** Keep the previous provider/composition-root main flow, but narrow this slice to executor/bootstrap boundaries only. Add focused bootstrap providers, keep executors responsible for runtime control flow and artifacts, and enforce the new boundary through `lint:arch` plus targeted provider tests.

**Tech Stack:** TypeScript, Node 20, existing `AgentLoop`, Playwright MCP, runtime docs under `docs/superpowers/`.

**Allowed Write Scope:** `apps/agent-runtime/src/runtime/**`, `apps/agent-runtime/scripts/lint-architecture.mjs`, `apps/agent-runtime/test/**`, `docs/superpowers/specs/**`, `docs/superpowers/plans/**`, `docs/project/**`, `docs/architecture/**`, `docs/testing/**`, `PROGRESS.md`, `NEXT_STEP.md`, `MEMORY.md`, `AGENTS.md`

**Verification Commands:**
- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`
- one fresh refinement e2e using:
  - `env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY`
  - `NO_PROXY=localhost,127.0.0.1,::1 no_proxy=localhost,127.0.0.1,::1`
  - `node apps/agent-runtime/dist/index.js --config apps/agent-runtime/runtime.config.json "打开小红书创作服务平台，创建一条长文笔记草稿（不要发布），填写任意标题后点击暂存离开；正文可留空。"`

**Evidence Location:** `artifacts/code-gate/<timestamp>/report.json`, plus one fresh `artifacts/e2e/<run_id>/`.

---

## File Map

- Create: `apps/agent-runtime/src/runtime/providers/legacy-run-bootstrap-provider.ts`
- Create: `apps/agent-runtime/src/runtime/providers/refine-run-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/src/runtime/providers/prompt-provider.ts`
- Modify: `apps/agent-runtime/src/runtime/run-executor.ts`
- Modify: `apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts`
- Modify: `apps/agent-runtime/src/runtime/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`
- Create: `apps/agent-runtime/test/runtime/legacy-run-bootstrap-provider.test.ts`
- Create: `apps/agent-runtime/test/runtime/run-executor-regression.test.ts`
- Create: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`
- Modify: `docs/project/current-state.md`
- Modify: `docs/architecture/overview.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

## Architecture Lint And Test Acceptance

### Architecture Lint Acceptance

- [ ] Extend `apps/agent-runtime/scripts/lint-architecture.mjs` so `run-executor.ts` can no longer import `runtime/sop-consumption-context.ts` after cutover.
- [ ] Extend `lint:arch` so `react-refinement-run-executor.ts` can no longer import `attention-guidance-loader.ts`, `attention-knowledge-store.ts`, or `refine-hitl-resume-store.ts` after cutover.
- [ ] Keep new bootstrap-provider files under default size budgets and do not add legacy-size exceptions.
- [ ] Keep bootstrap collaborator assembly inside approved provider/composition-root paths, not in executors.

### Test Acceptance

- [ ] Add failing tests first for legacy bootstrap preparation.
- [ ] Add failing tests first for refine bootstrap preparation.
- [ ] Update executor/composition-root tests only after the new providers exist.
- [ ] Keep full repo `npm --prefix apps/agent-runtime run test` green.
- [ ] Treat one fresh refinement e2e as a blocking acceptance step after code verification is green.
- [ ] Preserve these named regression cases:
  - legacy fallback consumption metadata
  - legacy final-screenshot failure shaping
  - legacy intervention learning + resume flow
  - refine paused-hitl persistence and same-run resume
  - refine missing-`run.finish` / budget-exhausted status shaping
  - refine promoted-knowledge-on-completed-only behavior

## Tasks

### Task 1: Legacy Bootstrap Failing Tests

**Files:**
- Create: `apps/agent-runtime/test/runtime/legacy-run-bootstrap-provider.test.ts`

- [ ] Write failing tests for the future legacy bootstrap provider:
  - consumption-enabled path returns prepared task plus record
  - no-provider fallback path preserves the request task and emits fallback metadata
- [ ] Run `npm --prefix apps/agent-runtime run test -- test/runtime/legacy-run-bootstrap-provider.test.ts` and confirm the red phase fails because `../../src/runtime/providers/legacy-run-bootstrap-provider.js` does not exist yet (`ERR_MODULE_NOT_FOUND` or equivalent module-resolution failure).

### Task 2: Extract Legacy Run Bootstrap Provider

**Files:**
- Create: `apps/agent-runtime/src/runtime/providers/legacy-run-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/src/runtime/run-executor.ts`
- Modify: `apps/agent-runtime/src/runtime/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/test/runtime/legacy-run-bootstrap-provider.test.ts`
- Create: `apps/agent-runtime/test/runtime/run-executor-regression.test.ts`

- [ ] Implement a focused legacy bootstrap provider that prepares loop task + consumption record.
- [ ] Cut `run-executor.ts` over to the provider so it no longer imports `sop-consumption-context.ts`.
- [ ] Add exact regression coverage in `test/runtime/run-executor-regression.test.ts` for:
  - fallback consumption metadata
  - completed run becomes failed when final screenshot capture is missing
  - intervention learning is written when HITL resume flow is triggered
- [ ] Re-run `npm --prefix apps/agent-runtime run test -- test/runtime/legacy-run-bootstrap-provider.test.ts test/runtime/run-executor-regression.test.ts`.

### Task 3: Write Refine Bootstrap Failing Tests

**Files:**
- Create: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`

- [ ] Write failing tests for refine bootstrap preparation:
  - resume record load
  - pre-observation page extraction
  - guidance preload count
  - prompt ingredients handed to prompt-provider-owned assembly
- [ ] Run `npm --prefix apps/agent-runtime run test -- test/runtime/refine-run-bootstrap-provider.test.ts` and confirm the red phase fails because `../../src/runtime/providers/refine-run-bootstrap-provider.js` does not exist yet (`ERR_MODULE_NOT_FOUND` or equivalent module-resolution failure).

### Task 4: Extract Refine Bootstrap Provider

**Files:**
- Create: `apps/agent-runtime/src/runtime/providers/refine-run-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/src/runtime/providers/prompt-provider.ts`
- Modify: `apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts`
- Modify: `apps/agent-runtime/src/runtime/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`

- [ ] Implement a refine bootstrap provider that owns run-id resolution, resume context load, pre-observation, guidance load, and prompt ingredients only.
- [ ] Keep final refine start-prompt assembly in `apps/agent-runtime/src/runtime/providers/prompt-provider.ts`; do not create a second prompt-owner elsewhere.
- [ ] Cut `react-refinement-run-executor.ts` over to prepared bootstrap input so it no longer imports knowledge/resume bootstrap collaborators directly.
- [ ] Preserve these exact refine regressions in `test/replay-refinement/refine-react-run-executor.test.ts`:
  - paused-hitl persists resume payload
  - resumed execution reuses the same run id
  - missing `run.finish` still fails
  - budget-exhausted status still triggers on turn-budget fuse
  - promoted knowledge is persisted only on completed runs
- [ ] Re-run `npm --prefix apps/agent-runtime run test -- test/runtime/refine-run-bootstrap-provider.test.ts test/replay-refinement/refine-react-run-executor.test.ts test/runtime/runtime-composition-root.test.ts`.

### Task 5: Lock The Boundary With Lint And Wiring Tests

**Files:**
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`
- Modify: `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`

- [ ] Add architecture-lint rules for executor import boundaries.
- [ ] Update composition-root tests so they cover the new bootstrap-provider wiring.
- [ ] Run `lint:arch` before moving to repo-wide verification.

### Task 6: Full Verification And E2E

**Files:**
- Modify: `docs/project/current-state.md`
- Modify: `docs/architecture/overview.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

- [ ] Run `lint:arch`, `lint`, `test`, `typecheck`, `build`, and `hardgate`.
- [ ] Run the exact documented refinement e2e command:
  - `env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY NO_PROXY=localhost,127.0.0.1,::1 no_proxy=localhost,127.0.0.1,::1 node apps/agent-runtime/dist/index.js --config apps/agent-runtime/runtime.config.json "打开小红书创作服务平台，创建一条长文笔记草稿（不要发布），填写任意标题后点击暂存离开；正文可留空。"`
- [ ] Validate the e2e evidence with the exact runbook checks:
  - `refine_run_summary.json.status === "completed"`
  - `steps.json` includes `run.finish` with `reason=goal_achieved`
  - `refine_action_executions.jsonl` shows title input plus “暂存离开” click and a saved-success signal
  - if a new tab opens, either `act.select_tab` appears before critical actions or the stale-tab guard fails explicitly
- [ ] Record the report path, `run_id`, proxy handling, and tab/context result in docs.

## Sequencing Notes

- Recommended order is Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5 -> Task 6.
- Keep Task 2 and Task 4 separate; do not mix legacy and refine bootstrap extraction into one unreviewable patch.
- Do not pull the full `runtime-bootstrap-provider.ts` split into this slice.
- Each coding task should be implemented by a fresh subagent and reviewed before moving on.

## Completion Checklist

- [ ] legacy executor bootstrap is provider-owned
- [ ] refine executor bootstrap is provider-owned
- [ ] executor import boundaries are locked by `lint:arch`
- [ ] focused provider tests exist and stay green
- [ ] repo-wide verification passes
- [ ] one fresh refinement e2e is recorded
