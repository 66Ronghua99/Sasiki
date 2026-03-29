---
doc_type: plan
status: planned
implements:
  - docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md
supersedes: []
related:
  - apps/agent-runtime/src/application/shell/workflow-runtime.ts
  - apps/agent-runtime/src/application/shell/runtime-composition-root.ts
  - apps/desktop/main/ipc/register-runs-ipc.ts
---

# Desktop Runtime Facade And Run Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec Path:** `docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md`

**Goal:** Expose a programmatic runtime facade from `apps/agent-runtime` and wire a desktop `RunManager` that can start, observe, and interrupt `observe`, `sop-compact`, and `refine` runs without re-implementing workflow logic.

**Architecture:** Keep workflow semantics in `apps/agent-runtime` by wrapping the existing host/composition path in a new runtime service that accepts request objects and emits typed lifecycle/log events. In `apps/desktop/main`, map renderer-originated run requests into that runtime service and fan typed updates back through a run event bus and IPC subscriptions.

**Tech Stack:** TypeScript, existing runtime host/composition, Electron main process, Vitest

---

**Suggested Worktree:** branch `codex/desktop-runtime`

**Allowed Write Scope:** `apps/agent-runtime/src/application/shell/**`, `apps/agent-runtime/src/infrastructure/logging/**`, `apps/agent-runtime/test/application/shell/**`, `apps/desktop/main/runs/**`, `apps/desktop/main/ipc/register-runs-ipc.ts`, `apps/desktop/test/main/runs/**`

**Verification Commands:** `npm --prefix apps/agent-runtime run test -- test/application/shell/runtime-service.test.ts`, `npm --prefix apps/desktop run test -- test/main/runs/run-manager.test.ts`, `npm --prefix apps/agent-runtime run lint`, `npm --prefix apps/agent-runtime run test`, `npm --prefix apps/agent-runtime run typecheck`, `npm --prefix apps/agent-runtime run build`, `npm --prefix apps/desktop run test`, `npm --prefix apps/desktop run typecheck`

**Evidence Location:** targeted shell/runtime test output plus fresh repo gate output during the integration lane

---

## File Map

- Create: `apps/agent-runtime/src/application/shell/runtime-service.ts`
- Create: `apps/agent-runtime/src/infrastructure/logging/callback-telemetry-sink.ts`
- Create: `apps/agent-runtime/test/application/shell/runtime-service.test.ts`
- Modify: `apps/agent-runtime/src/application/shell/workflow-runtime.ts`
- Modify: `apps/agent-runtime/src/application/shell/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/src/index.ts`
- Create: `apps/desktop/main/runs/run-manager.ts`
- Create: `apps/desktop/main/runs/run-request-mapper.ts`
- Create: `apps/desktop/main/runs/run-event-bus.ts`
- Modify: `apps/desktop/main/ipc/register-runs-ipc.ts`
- Create: `apps/desktop/test/main/runs/run-manager.test.ts`

## Tasks

### Task 1: Add A Programmatic Runtime Service In `apps/agent-runtime`

**Files:**
- Create: `apps/agent-runtime/src/application/shell/runtime-service.ts`
- Create: `apps/agent-runtime/src/infrastructure/logging/callback-telemetry-sink.ts`
- Create: `apps/agent-runtime/test/application/shell/runtime-service.test.ts`
- Modify: `apps/agent-runtime/src/application/shell/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/src/application/shell/workflow-runtime.ts`

- [ ] **Step 1: Write the failing runtime-service tests**

```ts
test("runtime service executes observe and emits lifecycle events", async () => {
  const events: RuntimeServiceEvent[] = [];
  const result = await service.runObserve({ task: "record a baidu search" }, { onEvent: (event) => events.push(event) });
  assert.equal(result.mode, "observe");
  assert.equal(events[0]?.type, "run.started");
  assert.equal(events.at(-1)?.type, "run.finished");
});
```

- [ ] **Step 2: Run the focused runtime-service test and confirm the red state**

Run: `npm --prefix apps/agent-runtime run test -- test/application/shell/runtime-service.test.ts`
Expected: FAIL because `runtime-service.ts` does not exist yet

- [ ] **Step 3: Implement the runtime service and callback sink**

```ts
export interface RuntimeServiceHooks {
  onEvent?(event: RuntimeServiceEvent): void;
}

export class RuntimeService {
  async runObserve(request: { task: string }, hooks: RuntimeServiceHooks = {}): Promise<ObserveRunResult> {
    hooks.onEvent?.({ type: "run.started", workflow: "observe" });
    const result = await this.workflowRuntime.execute({ command: "observe", task: request.task });
    hooks.onEvent?.({ type: "run.finished", workflow: "observe", status: result.status });
    return result;
  }
}
```

Implementation notes:
- the callback sink should translate runtime lifecycle/log output into typed events instead of writing to terminal only
- keep `WorkflowRuntime` as the workflow selector/host adapter; `RuntimeService` wraps it, not replaces it
- do not import desktop-only types into `apps/agent-runtime`

- [ ] **Step 4: Re-run the focused runtime-service test and confirm the green state**

Run: `npm --prefix apps/agent-runtime run test -- test/application/shell/runtime-service.test.ts`
Expected: PASS

### Task 2: Keep The CLI On The Shared Runtime Path

**Files:**
- Modify: `apps/agent-runtime/src/index.ts`
- Modify: `apps/agent-runtime/src/application/shell/runtime-service.ts`

- [ ] **Step 1: Write one focused CLI-path regression test or smoke assertion**

```ts
test("cli main still prints the final workflow result json through runtime service", async () => {
  const writes: string[] = [];
  await runCliMainForTest(["observe", "demo task"], { writeStdout: (text) => writes.push(text) });
  assert.match(writes.join(""), /"mode": "observe"/);
});
```

- [ ] **Step 2: Run the focused shell test and confirm the red state**

Run: `npm --prefix apps/agent-runtime run test -- test/application/shell/runtime-service.test.ts`
Expected: FAIL until the CLI path is redirected through the new runtime service helper

- [ ] **Step 3: Refactor `index.ts` to use the shared runtime service**

```ts
const service = new RuntimeService(config);
const result = await service.runFromCliArguments(args, {
  onEvent: () => {
    // CLI keeps using terminal sinks through runtime composition
  },
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
```

Implementation notes:
- preserve current CLI usage and interrupt behavior
- do not regress `observe`, `sop-compact list`, `sop-compact --run-id`, or `refine --resume-run-id`

- [ ] **Step 4: Run the existing runtime shell checks**

Run: `npm --prefix apps/agent-runtime run lint && npm --prefix apps/agent-runtime run test && npm --prefix apps/agent-runtime run typecheck && npm --prefix apps/agent-runtime run build`
Expected: PASS

### Task 3: Build The Desktop Run Manager And Run IPC Surface

**Files:**
- Create: `apps/desktop/main/runs/run-manager.ts`
- Create: `apps/desktop/main/runs/run-request-mapper.ts`
- Create: `apps/desktop/main/runs/run-event-bus.ts`
- Modify: `apps/desktop/main/ipc/register-runs-ipc.ts`
- Create: `apps/desktop/test/main/runs/run-manager.test.ts`

- [ ] **Step 1: Write the failing `RunManager` tests**

```ts
test("run manager starts refine, stores status, and relays streamed events", async () => {
  const handle = await runManager.startRefine({ task: "check inbox", siteAccountId: "acct-1" });
  assert.equal(handle.runId.startsWith("desktop-"), true);
  assert.equal(runManager.getRun(handle.runId)?.workflow, "refine");
  assert.equal(eventBus.eventsFor(handle.runId)[0]?.type, "run.started");
});
```

- [ ] **Step 2: Run the focused desktop run-manager test and confirm the red state**

Run: `npm --prefix apps/desktop run test -- test/main/runs/run-manager.test.ts`
Expected: FAIL because the run manager modules do not exist yet

- [ ] **Step 3: Implement the run manager and IPC registrations**

```ts
export class RunManager {
  async startObserve(input: ObserveRunInput): Promise<{ runId: string }> {
    const runId = this.ids.create("observe");
    this.store.set(runId, { workflow: "observe", status: "starting", input });
    void this.runtime.runObserve({ task: input.task }, { onEvent: (event) => this.events.publish(runId, event) });
    return { runId };
  }
}
```

Implementation notes:
- map desktop `siteAccountId` to runtime-ready request shapes in `run-request-mapper.ts`
- `register-runs-ipc.ts` should install `startObserve`, `startCompact`, `startRefine`, `interruptRun`, `listRuns`, and `subscribe` endpoints from the frozen transport contract
- keep all desktop run state in main process, not in renderer

- [ ] **Step 4: Re-run the focused run-manager test and confirm the green state**

Run: `npm --prefix apps/desktop run test -- test/main/runs/run-manager.test.ts`
Expected: PASS
