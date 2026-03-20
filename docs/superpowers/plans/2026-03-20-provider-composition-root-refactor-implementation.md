---
doc_type: plan
status: superseded
implements:
  - docs/superpowers/specs/2026-03-20-provider-composition-root-refactor.md
verified_by:
  - artifacts/code-gate/2026-03-20T12-31-06-702Z/report.json
supersedes: []
related:
  - docs/superpowers/specs/2026-03-20-provider-composition-root-refactor.md
  - apps/agent-runtime/src/index.ts
  - apps/agent-runtime/src/runtime/workflow-runtime.ts
---

# Provider And Composition Root Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec Path:** `docs/superpowers/specs/2026-03-20-provider-composition-root-refactor.md`

**Goal:** Replace the current CLI/runtime assembly collapse with explicit composition-root and provider seams, while preserving existing run/observe/refine behavior.

**Architecture:** Use an additive migration. First introduce explicit command routing and provider interfaces, then move concrete assembly out of `index.ts` and `WorkflowRuntime`, and finally narrow executors to consume prepared dependencies and bootstrap inputs instead of owning cross-cutting setup logic.

**Tech Stack:** TypeScript, Node 20, existing `AgentLoop`, Playwright MCP, runtime docs under `docs/superpowers/`.

**Allowed Write Scope:** `apps/agent-runtime/src/index.ts`, `apps/agent-runtime/src/runtime/**`, `apps/agent-runtime/src/infrastructure/**`, `apps/agent-runtime/scripts/lint-architecture.mjs`, `apps/agent-runtime/test/**`, `docs/superpowers/specs/**`, `docs/superpowers/plans/**`, `docs/project/**`, `docs/architecture/**`, `docs/testing/**`, `PROGRESS.md`, `NEXT_STEP.md`, `MEMORY.md`, `AGENTS.md`

**Verification Commands:**
- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`
- one fresh refinement e2e after environment prerequisites are restored

**Evidence Location:** `artifacts/code-gate/<timestamp>/report.json`, plus one fresh `artifacts/e2e/<run_id>/` when environment is ready.

**Rule:** This plan is now implemented for the first provider/composition-root slice. Keep later changes inside the same lint/test acceptance boundary unless a new approved spec supersedes it.
`npm --prefix apps/agent-runtime run test` is a blocking acceptance gate for this refactor, not an optional smoke check. Refactor-specific lint acceptance is owned by `lint:arch`.

---

## File Map

- Create: `apps/agent-runtime/src/runtime/command-router.ts`
- Create: `apps/agent-runtime/src/runtime/runtime-composition-root.ts`
- Create: `apps/agent-runtime/src/runtime/providers/prompt-provider.ts`
- Create: `apps/agent-runtime/src/runtime/providers/tool-surface-provider.ts`
- Create: `apps/agent-runtime/src/runtime/providers/execution-context-provider.ts`
- Create: `apps/agent-runtime/src/runtime/providers/runtime-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`
- Modify: `apps/agent-runtime/src/index.ts`
- Modify: `apps/agent-runtime/src/runtime/workflow-runtime.ts`
- Modify: `apps/agent-runtime/src/runtime/runtime-config.ts`
- Modify: `apps/agent-runtime/src/runtime/system-prompts.ts`
- Modify: `apps/agent-runtime/src/runtime/run-executor.ts`
- Modify: `apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts`
- Modify: `apps/agent-runtime/src/runtime/agent-execution-runtime.ts`
- Create: `apps/agent-runtime/test/runtime/command-router.test.ts`
- Create: `apps/agent-runtime/test/runtime/runtime-bootstrap-provider.test.ts`
- Create: `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`
- Modify: `docs/project/current-state.md`
- Modify: `docs/architecture/overview.md`

## Architecture Lint And Test Acceptance

### Architecture Lint Acceptance

- [ ] Keep `lint:arch` green during each task; do not defer layer or cycle regressions to the end.
- [ ] Extend `apps/agent-runtime/scripts/lint-architecture.mjs` so the composition-root file becomes the only allowed runtime importer of `infrastructure/mcp/*` after cutover.
- [ ] Extend `lint:arch` so `src/index.ts` and `runtime/command-router.ts` cannot directly import concrete infrastructure adapters or executor implementations.
- [ ] Extend `lint:arch` so direct prompt-constant imports are limited to the prompt-provider path after cutover.
- [ ] Keep `runtime/command-router.ts`, `runtime/runtime-composition-root.ts`, and `runtime/providers/*.ts` under default file budgets; do not add new legacy-size-budget exceptions for these files.
- [ ] Treat CLI parsing and provider extraction as boundary work enforced by lint, not review-only guidance.

### Test Acceptance

- [ ] Add or update tests for command parsing, including `run`, `observe`, `sop-compact`, and archived-command failures.
- [ ] Add or update tests for runtime bootstrap/config precedence and environment-sensitive defaults.
- [ ] Add or update tests for composition-root assembly selection across legacy run, refine run, observe, and resume paths.
- [ ] Keep existing runtime/refine-react tests green while the refactor lands.
- [ ] Treat `npm --prefix apps/agent-runtime run test` as required for completion.

## Tasks

### Task 1: Extract Command Routing

**Files:**
- Create: `apps/agent-runtime/src/runtime/command-router.ts`
- Modify: `apps/agent-runtime/src/index.ts`
- Create: `apps/agent-runtime/test/runtime/command-router.test.ts`
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`

- [ ] Define a small parsed-command model for `runtime` and `sop-compact`.
- [ ] Move argv parsing and validation out of `index.ts`.
- [ ] Keep `index.ts` focused on top-level process lifecycle only.
- [ ] Preserve current CLI grammar and archived-command errors.
- [ ] Add focused tests that lock the current CLI grammar before or alongside the extraction.
- [ ] Add architecture-lint protection so CLI parsing files cannot become hidden infrastructure assembly points.

### Task 2: Introduce Runtime Composition Root

**Files:**
- Create: `apps/agent-runtime/src/runtime/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/src/runtime/workflow-runtime.ts`
- Modify: `apps/agent-runtime/src/runtime/agent-execution-runtime.ts`
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`
- Create: `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`

- [ ] Introduce a composition-root module that owns concrete dependency assembly.
- [ ] Move browser/MCP/logger/HITL/executor construction out of `WorkflowRuntime`.
- [ ] Decide whether `WorkflowRuntime` remains as a thin facade or disappears behind the composition root.
- [ ] Keep observe/run lifecycle semantics unchanged.
- [ ] Update structural lint rules so runtime infrastructure imports converge on the composition root rather than `WorkflowRuntime`.
- [ ] Add focused tests for mode-specific composition-root assembly across legacy run, refine run, observe, and resume paths.

### Task 3: Extract Provider Seams

**Files:**
- Create: `apps/agent-runtime/src/runtime/providers/prompt-provider.ts`
- Create: `apps/agent-runtime/src/runtime/providers/tool-surface-provider.ts`
- Create: `apps/agent-runtime/src/runtime/providers/execution-context-provider.ts`
- Create: `apps/agent-runtime/src/runtime/providers/runtime-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/src/runtime/system-prompts.ts`
- Modify: `apps/agent-runtime/src/runtime/workflow-runtime.ts`
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`

- [ ] Introduce a prompt-provider boundary for run/refine prompt selection.
- [ ] Introduce a tool-surface provider for raw MCP vs refine-react tool-client assembly.
- [ ] Introduce an execution-context provider for SOP consumption, refinement guidance preload, and resume bootstrap.
- [ ] Introduce a runtime-bootstrap provider for normalized assembly inputs from config/env.
- [ ] Extend architecture lint so prompt constants stop leaking outside the prompt-provider boundary after cutover.
- [ ] Keep provider modules assembly-light enough that they stay readable and under default lint budgets.

### Task 4: Narrow Executors

**Files:**
- Modify: `apps/agent-runtime/src/runtime/run-executor.ts`
- Modify: `apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts`

- [ ] Reduce executor constructor inputs to prepared dependencies and focused runtime inputs.
- [ ] Move prompt/bootstrap/guidance assembly out of executors where possible.
- [ ] Keep artifact writing and execution semantics intact.
- [ ] Avoid changing refine-react tool contracts in this phase.

### Task 5: Split Config Normalization From Assembly Policy

**Files:**
- Modify: `apps/agent-runtime/src/runtime/runtime-config.ts`
- Modify: `apps/agent-runtime/src/runtime/providers/runtime-bootstrap-provider.ts`
- Create: `apps/agent-runtime/test/runtime/runtime-bootstrap-provider.test.ts`

- [ ] Separate config-source loading from runtime assembly policy.
- [ ] Keep current file/env precedence behavior, but make it discoverable through narrower functions or providers.
- [ ] Make environment-sensitive defaults easier to test and reason about.
- [ ] Add focused tests for config precedence and defaulting before deleting old loader branches.

### Task 6: Post-Cutover Cleanup

**Files:**
- Modify: `apps/agent-runtime/src/index.ts`
- Modify: `apps/agent-runtime/src/runtime/**`
- Modify: `docs/project/current-state.md`
- Modify: `docs/architecture/overview.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

- [ ] Delete transitional files only after imports, docs, and active runtime wiring no longer reference them.
- [ ] Rename surviving files only when the post-cutover boundary is stable and the new name is materially clearer.
- [ ] Keep broad rename/delete work out of the first boundary-extraction pass.
- [ ] Record any deferred retire/rename items explicitly if they are not safe in this phase.

### Task 7: Docs And Verification Sync

**Files:**
- Modify: `docs/project/current-state.md`
- Modify: `docs/architecture/overview.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

- [ ] Update architecture docs to point to the new composition-root and provider seams.
- [ ] Record any deferred follow-up items that should later become lint/test hard gates.
- [ ] Re-run `lint:arch`, `lint`, `test`, `typecheck`, `build`, and `hardgate`, then record evidence.
- [ ] Re-run one fresh refinement e2e after environment prerequisites are restored.

## Sequencing Notes

- Recommended order is Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5 -> Task 6 -> Task 7.
- Task 3 should not over-design a plugin system; keep providers concrete and repo-readable.
- Task 4 must preserve behavior before any later semantic redesign.
- Task 6 is the only phase allowed to do broad retire/rename cleanup, and only after cutover parity is established.
- This plan already treats lint/test hardening as part of delivery; do not defer the structural acceptance boundary to a later pass.

## Completion Checklist

- [ ] CLI parsing no longer directly assembles runtime dependencies
- [ ] composition root exists as an explicit repository surface
- [ ] prompt/tool/context/bootstrap seams are explicit and discoverable
- [ ] executors consume prepared dependencies rather than cross-cutting setup
- [ ] config loading and bootstrap policy are no longer collapsed into one large loader path
- [ ] architecture lint rules reflect the new composition-root and provider boundaries
- [ ] docs reflect the new architecture
- [ ] lint:arch, lint, test, typecheck, build, and hardgate pass
- [ ] one fresh e2e is recorded once environment prerequisites are restored
