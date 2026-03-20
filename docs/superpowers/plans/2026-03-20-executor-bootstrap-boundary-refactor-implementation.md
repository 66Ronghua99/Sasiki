---
doc_type: plan
status: superseded
implements:
  - docs/superpowers/specs/2026-03-20-executor-bootstrap-boundary-refactor.md
verified_by:
  - artifacts/code-gate/2026-03-20T14-35-51-808Z/report.json
  - artifacts/e2e/20260320_231626_543/refine_turn_logs.jsonl
  - artifacts/e2e/20260320_231626_543/steps.json
  - artifacts/code-gate/2026-03-20T15-43-32-639Z/report.json
  - artifacts/e2e/20260320_234350_187/refine_turn_logs.jsonl
  - artifacts/e2e/20260320_234350_187/steps.json
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

## Execution Truth

- Tasks 1-5 are implemented on `mvp-dev`; the corresponding providers, executor cutovers, lint boundaries, and focused tests are now in the codebase.
- Fresh repo verification for the refactor baseline is recorded in `artifacts/code-gate/2026-03-20T14-35-51-808Z/report.json`.
- Fresh refinement flow validation is recorded under `artifacts/e2e/20260320_231626_543/` and reached `agent_loop_initialized`.
- First-turn bootstrap stabilization is now landed as a prompt/bootstrap slice:
  - bootstrap prompt now exposes the initial observation ref/page
  - prompt now forbids synthetic `sourceObservationRef`
  - prompt now states that only `observe.page` / `observe.query` mint new observation refs and that page-changing actions require a fresh `observe.page`
- Fresh validation for that slice is recorded in:
  - `artifacts/code-gate/2026-03-20T15-43-32-639Z/report.json`
  - `artifacts/e2e/20260320_234009_829/`
  - `artifacts/e2e/20260320_234350_187/`
- The remaining stabilization blocker after this slice is no longer provenance/bootstrap drift; it is the real-page click failure on the publish-page `写长文` entrypoint.

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

- [x] Extend `apps/agent-runtime/scripts/lint-architecture.mjs` so `run-executor.ts` can no longer import `runtime/sop-consumption-context.ts` after cutover.
- [x] Extend `lint:arch` so `react-refinement-run-executor.ts` can no longer import `attention-guidance-loader.ts`, `attention-knowledge-store.ts`, or `refine-hitl-resume-store.ts` after cutover.
- [x] Keep new bootstrap-provider files under default size budgets and do not add legacy-size exceptions.
- [x] Keep bootstrap collaborator assembly inside approved provider/composition-root paths, not in executors.

### Test Acceptance

- [x] Add failing tests first for legacy bootstrap preparation.
- [x] Add failing tests first for refine bootstrap preparation.
- [x] Update executor/composition-root tests only after the new providers exist.
- [x] Keep full repo `npm --prefix apps/agent-runtime run test` green.
- [x] Treat one fresh refinement execution that reaches `agent_loop_initialized` as the blocking flow-acceptance step after code verification is green.
- [x] Preserve these named regression cases:
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

- [x] Write failing tests for the future legacy bootstrap provider:
  - consumption-enabled path returns prepared task plus record
  - no-provider fallback path preserves the request task and emits fallback metadata
- [x] Run `npm --prefix apps/agent-runtime run test -- test/runtime/legacy-run-bootstrap-provider.test.ts` and confirm the red phase fails because `../../src/runtime/providers/legacy-run-bootstrap-provider.js` does not exist yet (`ERR_MODULE_NOT_FOUND` or equivalent module-resolution failure).

### Task 2: Extract Legacy Run Bootstrap Provider

**Files:**
- Create: `apps/agent-runtime/src/runtime/providers/legacy-run-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/src/runtime/run-executor.ts`
- Modify: `apps/agent-runtime/src/runtime/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/test/runtime/legacy-run-bootstrap-provider.test.ts`
- Create: `apps/agent-runtime/test/runtime/run-executor-regression.test.ts`

- [x] Implement a focused legacy bootstrap provider that prepares loop task + consumption record.
- [x] Cut `run-executor.ts` over to the provider so it no longer imports `sop-consumption-context.ts`.
- [x] Add exact regression coverage in `test/runtime/run-executor-regression.test.ts` for:
  - fallback consumption metadata
  - completed run becomes failed when final screenshot capture is missing
  - intervention learning is written when HITL resume flow is triggered
- [x] Re-run `npm --prefix apps/agent-runtime run test -- test/runtime/legacy-run-bootstrap-provider.test.ts test/runtime/run-executor-regression.test.ts`.

### Task 3: Write Refine Bootstrap Failing Tests

**Files:**
- Create: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`

- [x] Write failing tests for refine bootstrap preparation:
  - resume record load
  - pre-observation page extraction
  - guidance preload count
  - prompt ingredients handed to prompt-provider-owned assembly
- [x] Run `npm --prefix apps/agent-runtime run test -- test/runtime/refine-run-bootstrap-provider.test.ts` and confirm the red phase fails because `../../src/runtime/providers/refine-run-bootstrap-provider.js` does not exist yet (`ERR_MODULE_NOT_FOUND` or equivalent module-resolution failure).

### Task 4: Extract Refine Bootstrap Provider

**Files:**
- Create: `apps/agent-runtime/src/runtime/providers/refine-run-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/src/runtime/providers/prompt-provider.ts`
- Modify: `apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts`
- Modify: `apps/agent-runtime/src/runtime/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`

- [x] Implement a refine bootstrap provider that owns run-id resolution, resume context load, pre-observation, guidance load, and prompt ingredients only.
- [x] Keep final refine start-prompt assembly in `apps/agent-runtime/src/runtime/providers/prompt-provider.ts`; do not create a second prompt-owner elsewhere.
- [x] Cut `react-refinement-run-executor.ts` over to prepared bootstrap input so it no longer imports knowledge/resume bootstrap collaborators directly.
- [x] Preserve these exact refine regressions in `test/replay-refinement/refine-react-run-executor.test.ts`:
  - paused-hitl persists resume payload
  - resumed execution reuses the same run id
  - missing `run.finish` still fails
  - budget-exhausted status still triggers on turn-budget fuse
  - promoted knowledge is persisted only on completed runs
- [x] Re-run `npm --prefix apps/agent-runtime run test -- test/runtime/refine-run-bootstrap-provider.test.ts test/replay-refinement/refine-react-run-executor.test.ts test/runtime/runtime-composition-root.test.ts`.

### Task 5: Lock The Boundary With Lint And Wiring Tests

**Files:**
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`
- Modify: `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`

- [x] Add architecture-lint rules for executor import boundaries.
- [x] Update composition-root tests so they cover the new bootstrap-provider wiring.
- [x] Run `lint:arch` before moving to repo-wide verification.

### Task 6: Full Verification And Flow E2E

**Files:**
- Modify: `docs/project/current-state.md`
- Modify: `docs/architecture/overview.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

- [x] Run `lint:arch`, `lint`, `test`, `typecheck`, `build`, and `hardgate`.
- [x] Run the exact documented refinement e2e command:
  - `env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY NO_PROXY=localhost,127.0.0.1,::1 no_proxy=localhost,127.0.0.1,::1 node apps/agent-runtime/dist/index.js --config apps/agent-runtime/runtime.config.json "打开小红书创作服务平台，创建一条长文笔记草稿（不要发布），填写任意标题后点击暂存离开；正文可留空。"`
- [x] Validate the flow evidence for the fresh run:
  - fresh `artifacts/e2e/<run_id>/` exists
  - browser startup, cookie injection, CDP ready, and model resolution all succeed
  - `agent_loop_initialized` is observed
  - if the business task still fails after loop start, record the failure as a stabilization follow-up instead of blocking structural acceptance
- [x] Record the report path, `run_id`, proxy handling, and first-turn bootstrap result in docs.
- [x] Stabilize first-turn navigation bootstrap so the first action never invents synthetic `sourceObservationRef` values under system Chrome `about:blank` / omnibox startup state.

## Sequencing Notes

- Recommended order is Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5 -> Task 6.
- Keep Task 2 and Task 4 separate; do not mix legacy and refine bootstrap extraction into one unreviewable patch.
- Do not pull the full `runtime-bootstrap-provider.ts` split into this slice.
- Each coding task should be implemented by a fresh subagent and reviewed before moving on.

## Completion Checklist

- [x] legacy executor bootstrap is provider-owned
- [x] refine executor bootstrap is provider-owned
- [x] executor import boundaries are locked by `lint:arch`
- [x] focused provider tests exist and stay green
- [x] repo-wide verification passes
- [x] one fresh refinement execution reaches `agent_loop_initialized`
- [x] first-turn navigation bootstrap is stable on system Chrome `about:blank` / omnibox startup state
