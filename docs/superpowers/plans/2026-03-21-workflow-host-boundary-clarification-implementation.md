---
doc_type: plan
status: archived
implements:
  - docs/superpowers/specs/2026-03-21-workflow-host-boundary-clarification.md
verified_by:
  - artifacts/code-gate/2026-03-21T06-29-23-232Z/report.json
supersedes: []
related:
  - docs/superpowers/specs/2026-03-21-workflow-host-boundary-clarification.md
  - docs/architecture/overview.md
  - docs/project/current-state.md
  - apps/agent-runtime/src/application/shell/runtime-composition-root.ts
  - apps/agent-runtime/src/application/shell/workflow-runtime.ts
  - apps/agent-runtime/scripts/lint-architecture.mjs
---

# Workflow Host Boundary Clarification Implementation Plan

> Archived historical record. This planning draft corresponds to workflow-host work that was completed on March 21, 2026. It is preserved for background only; the current front-door truth lives in `docs/architecture/overview.md` and `docs/project/current-state.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the CLI workflow entry path so `observe`, `refine`, and `sop-compact` all run through one explicit workflow-host model while keeping their execution semantics separate and removing the long-term ambiguity around `application/providers` and `runtime/`.

**Architecture:** Build a shared shell-owned workflow host plus workflow registry, then move workflow-specific construction back into `application/observe/`, `application/refine/`, and `application/compact/`. The host should own only shared lifecycle and platform resources; each workflow should own its own bootstrap, execution, and interrupt behavior. `application/providers/` should disappear, and `runtime/agent-execution-runtime.ts` should be inlined into the shell host unless a real cross-workflow runtime primitive emerges.

**Tech Stack:** TypeScript, Node 20, `tsx --test`, project-local architecture lint, Playwright MCP, pi-agent execution kernel.

---

## Scope Freeze

- Keep the command surface exactly:
  - `observe`
  - `refine`
  - `sop-compact`
- Keep `observe` as a pure recording workflow.
- Keep `refine` as the only browser-agent workflow.
- Keep `compact` as an offline reasoning workflow over recorded artifacts.
- Do not redesign tool contracts, prompt semantics, or business behavior as part of this refactor.
- Do not keep `application/providers/` as a permanent directory layer.
- Prefer removing `runtime/agent-execution-runtime.ts` instead of preserving `runtime/` by habit.

## Allowed Write Scope

- `apps/agent-runtime/src/application/**`
- `apps/agent-runtime/src/runtime/**`
- `apps/agent-runtime/test/**`
- `apps/agent-runtime/scripts/lint-architecture.mjs`
- `docs/architecture/**`
- `docs/project/**`
- `docs/superpowers/specs/**`
- `docs/superpowers/plans/**`
- `PROGRESS.md`
- `NEXT_STEP.md`
- `MEMORY.md`

## Verification Commands

- `npm --prefix apps/agent-runtime run lint:docs`
- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`

## Evidence Location

- `artifacts/code-gate/<timestamp>/report.json`

## File Structure Lock

### New Files Expected

- `apps/agent-runtime/src/application/shell/runtime-host.ts`
- `apps/agent-runtime/src/application/shell/workflow-registry.ts`
- `apps/agent-runtime/src/application/shell/workflow-contract.ts`
- `apps/agent-runtime/src/application/observe/observe-workflow.ts`
- `apps/agent-runtime/src/application/refine/refine-workflow.ts`
- `apps/agent-runtime/src/application/compact/compact-workflow.ts`
- `apps/agent-runtime/test/application/shell/runtime-host.test.ts`
- `apps/agent-runtime/test/application/shell/workflow-registry.test.ts`

### Files Likely To Be Modified

- `apps/agent-runtime/src/index.ts`
- `apps/agent-runtime/src/application/shell/command-router.ts`
- `apps/agent-runtime/src/application/shell/runtime-composition-root.ts`
- `apps/agent-runtime/src/application/shell/workflow-runtime.ts`
- `apps/agent-runtime/src/application/providers/tool-surface-provider.ts`
- `apps/agent-runtime/src/application/providers/execution-context-provider.ts`
- `apps/agent-runtime/src/application/observe/observe-runtime.ts`
- `apps/agent-runtime/src/application/observe/observe-executor.ts`
- `apps/agent-runtime/src/application/refine/react-refinement-run-executor.ts`
- `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
- `apps/agent-runtime/src/application/compact/interactive-sop-compact.ts`
- `apps/agent-runtime/src/runtime/agent-execution-runtime.ts`
- `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`
- `apps/agent-runtime/test/application/providers/tool-surface-provider.test.ts`
- `apps/agent-runtime/test/application/providers/execution-context-provider.test.ts`
- `apps/agent-runtime/scripts/lint-architecture.mjs`
- `docs/architecture/overview.md`
- `docs/project/current-state.md`
- `PROGRESS.md`
- `NEXT_STEP.md`
- `MEMORY.md`

### Files Likely To Be Deleted

- `apps/agent-runtime/src/application/providers/tool-surface-provider.ts`
- `apps/agent-runtime/src/application/providers/execution-context-provider.ts`
- `apps/agent-runtime/src/runtime/agent-execution-runtime.ts`
- corresponding tests under `apps/agent-runtime/test/application/providers/` once ownership moves

## Task 1: Introduce Workflow Host Vocabulary And Registry Scaffold

**Files:**
- Create: `apps/agent-runtime/src/application/shell/workflow-contract.ts`
- Create: `apps/agent-runtime/src/application/shell/workflow-registry.ts`
- Create: `apps/agent-runtime/src/application/shell/runtime-host.ts`
- Modify: `apps/agent-runtime/src/index.ts`
- Modify: `apps/agent-runtime/src/application/shell/workflow-runtime.ts`
- Test: `apps/agent-runtime/test/application/shell/workflow-registry.test.ts`
- Test: `apps/agent-runtime/test/application/shell/runtime-host.test.ts`
- Modify: `apps/agent-runtime/test/runtime/command-router.test.ts`

- [ ] **Step 1: Write the failing workflow-registry test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { createWorkflowRegistry } from "../../../src/application/shell/workflow-registry.js";

test("registry resolves one workflow factory per command", () => {
  const registry = createWorkflowRegistry({} as never);
  assert.equal(typeof registry.resolve("observe"), "function");
  assert.equal(typeof registry.resolve("refine"), "function");
  assert.equal(typeof registry.resolve("sop-compact"), "function");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/agent-runtime run test -- application/shell/workflow-registry.test.ts`
Expected: FAIL with module-not-found or missing export for `workflow-registry.ts`

- [ ] **Step 3: Write the failing runtime-host test**

```ts
test("runtime host starts and executes only the selected workflow", async () => {
  const events: string[] = [];
  const workflow = {
    prepare: async () => events.push("prepare"),
    execute: async () => {
      events.push("execute");
      return { status: "completed" };
    },
    requestInterrupt: async () => false,
    dispose: async () => events.push("dispose"),
  };
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm --prefix apps/agent-runtime run test -- application/shell/runtime-host.test.ts`
Expected: FAIL with module-not-found or missing export for `runtime-host.ts`

- [ ] **Step 5: Implement the minimal host/registry scaffold**

```ts
export interface HostedWorkflow<T> {
  prepare(): Promise<void>;
  execute(): Promise<T>;
  requestInterrupt(signal: "SIGINT" | "SIGTERM"): Promise<boolean>;
  dispose(): Promise<void>;
}
```

Implementation notes:
- `workflow-contract.ts` should define the host-facing workflow interface only.
- `workflow-registry.ts` should map command -> factory without building every workflow eagerly.
- `runtime-host.ts` should own start/execute/interrupt/dispose orchestration, but not workflow-specific business logic.
- `index.ts` may still special-case argument validation, but execution should route through the registry/host path.
- `workflow-runtime.ts` may stay temporarily as an adapter wrapper if that keeps the slice green; if kept, mark it transitional in comments and tests.

- [ ] **Step 6: Run focused tests to verify the scaffold passes**

Run: `npm --prefix apps/agent-runtime run test -- application/shell/runtime-host.test.ts application/shell/workflow-registry.test.ts runtime/command-router.test.ts`
Expected: PASS

- [ ] **Step 7: Run typecheck**

Run: `npm --prefix apps/agent-runtime run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/agent-runtime/src/index.ts \
  apps/agent-runtime/src/application/shell/workflow-contract.ts \
  apps/agent-runtime/src/application/shell/workflow-registry.ts \
  apps/agent-runtime/src/application/shell/runtime-host.ts \
  apps/agent-runtime/src/application/shell/workflow-runtime.ts \
  apps/agent-runtime/test/application/shell/workflow-registry.test.ts \
  apps/agent-runtime/test/application/shell/runtime-host.test.ts \
  apps/agent-runtime/test/runtime/command-router.test.ts
git commit -m "refactor: add workflow host scaffold"
```

## Task 2: Rehome Observe Construction Into Observe-Owned Workflow Code

**Files:**
- Create: `apps/agent-runtime/src/application/observe/observe-workflow.ts`
- Modify: `apps/agent-runtime/src/application/observe/observe-runtime.ts`
- Modify: `apps/agent-runtime/src/application/observe/observe-executor.ts`
- Modify: `apps/agent-runtime/src/application/shell/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/src/application/providers/execution-context-provider.ts`
- Test: `apps/agent-runtime/test/application/observe/observe-runtime.test.ts`
- Test: `apps/agent-runtime/test/application/observe/observe-executor.test.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`

- [ ] **Step 1: Write the failing observe-workflow test**

```ts
test("observe workflow prepares browser state and delegates to observe executor", async () => {
  const calls: string[] = [];
  // assert prepareObserveSession happens before execute
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/agent-runtime run test -- application/observe/observe-runtime.test.ts`
Expected: FAIL because `observe-workflow.ts` does not exist yet or prepare ordering is not represented

- [ ] **Step 3: Implement the minimal observe workflow**

```ts
export class ObserveWorkflow implements HostedWorkflow<ObserveRunResult> {
  async prepare(): Promise<void> {
    await this.browserLifecycle.prepareObserveSession();
  }

  async execute(): Promise<ObserveRunResult> {
    return this.observeExecutor.execute(this.taskHint);
  }
}
```

Implementation notes:
- Move only observe-owned construction into `application/observe/`.
- If `ExecutionContextProvider` currently only provides `SopAssetStore` for observe, extract that construction into observe-owned code and delete the observe branch from the provider file.
- Do not introduce any agent-loop abstraction here.

- [ ] **Step 4: Update composition-root tests before changing production wiring**

Run: `npm --prefix apps/agent-runtime run test -- runtime/runtime-composition-root.test.ts`
Expected: FAIL on old composition expectations once tests assert registry/host + observe-owned construction

- [ ] **Step 5: Rewire composition to create observe workflow lazily**

```ts
const registry = createWorkflowRegistry({
  observe: () => createObserveWorkflow(shared, config),
});
```

- [ ] **Step 6: Run focused observe tests**

Run: `npm --prefix apps/agent-runtime run test -- application/observe/observe-executor.test.ts application/observe/observe-runtime.test.ts runtime/runtime-composition-root.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/agent-runtime/src/application/observe/observe-workflow.ts \
  apps/agent-runtime/src/application/observe/observe-runtime.ts \
  apps/agent-runtime/src/application/observe/observe-executor.ts \
  apps/agent-runtime/src/application/shell/runtime-composition-root.ts \
  apps/agent-runtime/src/application/providers/execution-context-provider.ts \
  apps/agent-runtime/test/application/observe/observe-runtime.test.ts \
  apps/agent-runtime/test/application/observe/observe-executor.test.ts \
  apps/agent-runtime/test/runtime/runtime-composition-root.test.ts
git commit -m "refactor: move observe construction into workflow"
```

## Task 3: Rehome Refine Construction And Remove `application/providers/`

**Files:**
- Create: `apps/agent-runtime/src/application/refine/refine-workflow.ts`
- Modify: `apps/agent-runtime/src/application/refine/react-refinement-run-executor.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-react-tool-client.ts`
- Modify: `apps/agent-runtime/src/application/shell/runtime-composition-root.ts`
- Delete: `apps/agent-runtime/src/application/providers/tool-surface-provider.ts`
- Delete or empty: `apps/agent-runtime/src/application/providers/execution-context-provider.ts`
- Test: `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`
- Test: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
- Test: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
- Delete or replace: `apps/agent-runtime/test/application/providers/tool-surface-provider.test.ts`
- Delete or replace: `apps/agent-runtime/test/application/providers/execution-context-provider.test.ts`

- [ ] **Step 1: Write the failing refine-workflow construction test**

```ts
test("refine workflow owns refine tool surface, bootstrap, and executor wiring", async () => {
  // assert no application/providers import is needed
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/agent-runtime run test -- replay-refinement/refine-react-run-executor.test.ts runtime/refine-run-bootstrap-provider.test.ts`
Expected: FAIL after updating expectations to require refine-owned construction

- [ ] **Step 3: Move refine-specific factory logic into `application/refine/`**

```ts
const refineToolClient = new RefineReactToolClient({ rawClient, session: bootstrapSession });
const bootstrapProvider = new RefineRunBootstrapProvider({ ... });
return new RefineWorkflow({ loop, executor, browserLifecycle });
```

Implementation notes:
- `ToolSurfaceProvider` should disappear; its refine-only logic belongs in refine-owned construction.
- The refine knowledge/resume collaborators should also move out of the generic provider layer.
- Keep `PromptProvider` if still useful, but it should be consumed from refine-owned construction, not a generic provider directory.
- This task is complete only when `application/providers/` is removed or contains no active source files.

- [ ] **Step 4: Delete provider tests and replace them with refine-owned tests**

Run: `npm --prefix apps/agent-runtime run test -- application/providers/tool-surface-provider.test.ts application/providers/execution-context-provider.test.ts`
Expected: FAIL before deletion/replacement because the provider layer is no longer the source of truth

- [ ] **Step 5: Run focused refine tests**

Run: `npm --prefix apps/agent-runtime run test -- replay-refinement/refine-react-tool-client.test.ts replay-refinement/refine-react-run-executor.test.ts runtime/refine-run-bootstrap-provider.test.ts runtime/runtime-composition-root.test.ts`
Expected: PASS

- [ ] **Step 6: Run architecture lint**

Run: `npm --prefix apps/agent-runtime run lint:arch`
Expected: PASS or only known failures tied to the next task

- [ ] **Step 7: Commit**

```bash
git add apps/agent-runtime/src/application/refine/refine-workflow.ts \
  apps/agent-runtime/src/application/refine/react-refinement-run-executor.ts \
  apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts \
  apps/agent-runtime/src/application/refine/refine-react-tool-client.ts \
  apps/agent-runtime/src/application/shell/runtime-composition-root.ts \
  apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts \
  apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts \
  apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts \
  apps/agent-runtime/test/runtime/runtime-composition-root.test.ts
git rm apps/agent-runtime/src/application/providers/tool-surface-provider.ts \
  apps/agent-runtime/src/application/providers/execution-context-provider.ts \
  apps/agent-runtime/test/application/providers/tool-surface-provider.test.ts \
  apps/agent-runtime/test/application/providers/execution-context-provider.test.ts
git commit -m "refactor: rehome refine wiring and remove provider layer"
```

## Task 4: Bring Compact Under The Shared Workflow Vocabulary

**Files:**
- Create: `apps/agent-runtime/src/application/compact/compact-workflow.ts`
- Modify: `apps/agent-runtime/src/application/compact/interactive-sop-compact.ts`
- Modify: `apps/agent-runtime/src/index.ts`
- Modify: `apps/agent-runtime/src/application/shell/workflow-registry.ts`
- Test: `apps/agent-runtime/test/application/compact/interactive-sop-compact.test.ts`
- Test: `apps/agent-runtime/test/application/shell/workflow-registry.test.ts`

- [ ] **Step 1: Write the failing compact-workflow registry test**

```ts
test("registry resolves sop-compact through the shared workflow vocabulary", () => {
  const workflow = registry.resolve("sop-compact");
  assert.equal(typeof workflow, "function");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/agent-runtime run test -- application/shell/workflow-registry.test.ts application/compact/interactive-sop-compact.test.ts`
Expected: FAIL because `sop-compact` still bypasses the host/registry execution path

- [ ] **Step 3: Add a compact workflow adapter without changing compact semantics**

```ts
export class CompactWorkflow implements HostedWorkflow<InteractiveSopCompactResult> {
  async prepare(): Promise<void> {}
  async execute(): Promise<InteractiveSopCompactResult> {
    return this.service.compact(this.runId);
  }
}
```

Implementation notes:
- A no-op `prepare()` is acceptable here.
- The goal is vocabulary alignment, not forcing browser lifecycle assumptions onto compact.
- Keep the existing `InteractiveSopCompactService` behavior intact.

- [ ] **Step 4: Route `index.ts` through the registry for all three commands**

Run: `npm --prefix apps/agent-runtime run test -- runtime/command-router.test.ts application/shell/workflow-registry.test.ts`
Expected: PASS

- [ ] **Step 5: Run focused compact tests**

Run: `npm --prefix apps/agent-runtime run test -- application/compact/interactive-sop-compact.test.ts application/compact/compact-session-machine.test.ts application/compact/compact-turn-normalizer.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/agent-runtime/src/application/compact/compact-workflow.ts \
  apps/agent-runtime/src/application/compact/interactive-sop-compact.ts \
  apps/agent-runtime/src/application/shell/workflow-registry.ts \
  apps/agent-runtime/src/index.ts \
  apps/agent-runtime/test/application/compact/interactive-sop-compact.test.ts \
  apps/agent-runtime/test/application/shell/workflow-registry.test.ts \
  apps/agent-runtime/test/runtime/command-router.test.ts
git commit -m "refactor: align compact with workflow host model"
```

## Task 5: Remove `runtime/agent-execution-runtime.ts` And Tighten Lint/Docs

**Files:**
- Modify: `apps/agent-runtime/src/application/shell/runtime-host.ts`
- Modify: `apps/agent-runtime/src/application/shell/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/src/application/shell/workflow-runtime.ts`
- Delete: `apps/agent-runtime/src/runtime/agent-execution-runtime.ts`
- Modify: `apps/agent-runtime/scripts/lint-architecture.mjs`
- Modify: `apps/agent-runtime/test/application/layer-boundaries.test.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/project/current-state.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

- [ ] **Step 1: Write the failing architecture-lint expectation**

```js
const FORBIDDEN_COMPAT_FILES = new Set([
  "runtime/agent-execution-runtime.ts",
]);
```

- [ ] **Step 2: Run architecture lint to verify it fails**

Run: `npm --prefix apps/agent-runtime run lint:arch`
Expected: FAIL until `runtime/agent-execution-runtime.ts` is removed and imports are updated

- [ ] **Step 3: Inline the remaining lifecycle wrapper into the shell host**

```ts
await workflow.prepare();
const result = await workflow.execute();
await workflow.dispose();
```

Implementation notes:
- `runtime-host.ts` should become the only top-level lifecycle owner.
- `workflow-runtime.ts` should either disappear or become a tiny compatibility-free wrapper with one obvious purpose. Prefer deletion if it no longer adds clarity.
- No remaining code should need the `runtime/` directory unless a real shared session primitive still exists.

- [ ] **Step 4: Update docs to match the new front door**

Run: `npm --prefix apps/agent-runtime run lint:docs`
Expected: PASS

Doc updates must explicitly state:
- host lives in `application/shell/`
- workflows live in `application/observe/`, `application/refine/`, `application/compact/`
- `application/providers/` is gone
- `runtime/` is removed or intentionally empty of workflow wrappers

- [ ] **Step 5: Run focused tests**

Run: `npm --prefix apps/agent-runtime run test -- application/shell/runtime-host.test.ts runtime/runtime-composition-root.test.ts application/layer-boundaries.test.ts`
Expected: PASS

- [ ] **Step 6: Run full repo verification**

Run: `npm --prefix apps/agent-runtime run lint && npm --prefix apps/agent-runtime run test && npm --prefix apps/agent-runtime run build && npm --prefix apps/agent-runtime run hardgate`
Expected: PASS with fresh hardgate evidence under `artifacts/code-gate/<timestamp>/report.json`

- [ ] **Step 7: Commit**

```bash
git add apps/agent-runtime/src/application/shell/runtime-host.ts \
  apps/agent-runtime/src/application/shell/runtime-composition-root.ts \
  apps/agent-runtime/src/application/shell/workflow-runtime.ts \
  apps/agent-runtime/scripts/lint-architecture.mjs \
  apps/agent-runtime/test/application/layer-boundaries.test.ts \
  apps/agent-runtime/test/runtime/runtime-composition-root.test.ts \
  docs/architecture/overview.md \
  docs/project/current-state.md \
  PROGRESS.md NEXT_STEP.md MEMORY.md
git rm apps/agent-runtime/src/runtime/agent-execution-runtime.ts
git commit -m "refactor: remove runtime wrapper and finalize workflow host boundaries"
```

## Final Acceptance Checklist

- [ ] `observe`, `refine`, and `sop-compact` all run through one explicit shell-owned workflow-host model.
- [ ] `observe` remains recording-only and does not depend on agent-loop abstractions.
- [ ] `refine` remains the only workflow owning refine-react bootstrap, tools, HITL, and knowledge semantics.
- [ ] `application/providers/` is removed.
- [ ] `runtime/agent-execution-runtime.ts` is removed unless a new shared runtime primitive is explicitly justified in code and docs.
- [ ] `lint:arch`, `test`, `typecheck`, `build`, and `hardgate` all pass.
- [ ] Active docs describe the new front door without relying on migration-era context.

## Notes For The Implementer

- Keep each task green before moving on.
- Do not mix workflow-boundary cleanup with unrelated refine stability work.
- Prefer moving construction logic into workflow-owned files instead of inventing new generic layers.
- If a helper is only used by one workflow, colocate it with that workflow instead of creating a shared directory too early.
