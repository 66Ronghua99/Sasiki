---
doc_type: plan
status: draft
implements:
  - docs/superpowers/specs/2026-03-22-pi-agent-hook-adapter-refactor-design.md
verified_by:
  - npm --prefix apps/agent-runtime run lint
  - npm --prefix apps/agent-runtime run test
  - npm --prefix apps/agent-runtime run typecheck
  - npm --prefix apps/agent-runtime run build
  - npm --prefix apps/agent-runtime run hardgate
  - git diff --check
supersedes: []
related:
  - docs/superpowers/specs/2026-03-22-pi-agent-hook-adapter-refactor-design.md
  - apps/agent-runtime/src/contracts/tool-client.ts
  - apps/agent-runtime/src/kernel/agent-loop.ts
  - apps/agent-runtime/src/kernel/mcp-tool-bridge.ts
  - apps/agent-runtime/src/application/refine/refine-workflow.ts
  - apps/agent-runtime/src/application/refine/react-refinement-run-executor.ts
  - apps/agent-runtime/src/application/refine/refine-react-tool-client.ts
  - apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts
  - apps/agent-runtime/src/application/refine/tools/refine-tool-surface.ts
  - apps/agent-runtime/src/application/refine/tools/refine-tool-hook-pipeline.ts
  - apps/agent-runtime/src/application/refine/tools/refine-tool-hook-observer.ts
  - apps/agent-runtime/test/kernel/agent-loop-telemetry.test.ts
  - apps/agent-runtime/test/kernel/mcp-tool-bridge.test.ts
  - apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts
  - apps/agent-runtime/test/application/refine/refine-workflow.test.ts
  - apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts
---

# Pi-Agent Hook Adapter Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the kernel entrypoints to `PiAgentLoop` and `PiAgentToolAdapter`, move hook execution to the `pi-agent-core` adapter path only, and replace bridge classification with exact `toolName` hook registration.

**Architecture:** Keep `ToolClient` as the generic direct-call contract, and make the kernel own a single `ToolClient -> AgentTool[]` adapter with explicit `before/after` hook registrations keyed by tool name. Remove direct-call hook execution from refine surface code, rewire refine to export adapter-compatible hook registrations, and delete the old observer/classification seam once rename and tests are green.

**Tech Stack:** TypeScript, Node built-in test runner via `tsx --test`, `@mariozechner/pi-agent-core`, existing `ToolClient` contract, existing refine tool composition and workflow wiring.

---

## Planned File Map

### New files

- `apps/agent-runtime/src/kernel/pi-agent-loop.ts`
  Canonical renamed loop around `pi-agent-core`.
- `apps/agent-runtime/src/kernel/pi-agent-tool-adapter.ts`
  Canonical renamed `ToolClient -> AgentTool[]` adapter and the only runtime hook execution entrypoint.
- `apps/agent-runtime/src/kernel/pi-agent-tool-hooks.ts`
  Defines `PiAgentToolExecutionContext`, `PiAgentToolHook`, and the tool-name registry shape.
- `apps/agent-runtime/src/application/refine/tools/refine-pi-agent-tool-hooks.ts`
  Adapts refine-owned hook logic into exact `toolName` registrations for the kernel adapter.
- `apps/agent-runtime/test/kernel/pi-agent-loop-telemetry.test.ts`
  Renamed loop telemetry regression coverage.
- `apps/agent-runtime/test/kernel/pi-agent-tool-adapter.test.ts`
  Covers adapter result shaping, hook registration, and direct tool execution behavior.

### Existing files to modify

- `apps/agent-runtime/src/application/refine/refine-workflow.ts`
  Rewire imports and assembly from `AgentLoop` / `McpToolBridge` semantics to `PiAgentLoop` / `PiAgentToolAdapter` semantics.
- `apps/agent-runtime/src/application/refine/react-refinement-run-executor.ts`
  Update loop imports and hook-context wiring to the renamed kernel API.
- `apps/agent-runtime/src/application/refine/refine-react-tool-client.ts`
  Remove compatibility placeholders for surface-owned hooks so the client remains a pure direct-call facade.
- `apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts`
  Stop exporting bridge observer objects; export adapter-compatible tool-name hook registrations instead.
- `apps/agent-runtime/src/application/refine/tools/refine-tool-surface.ts`
  Remove before/after hook execution from direct `callTool(...)`.
- `apps/agent-runtime/src/application/refine/tools/refine-tool-hook-pipeline.ts`
  Keep refine-owned hook logic, but narrow it to being a hook logic source rather than a direct call interception path.
- `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
  Update expectations so direct surface calls no longer execute pi-agent hooks.
- `apps/agent-runtime/test/application/refine/refine-workflow.test.ts`
  Update assembly assertions to the renamed kernel APIs and hook registration handoff.
- `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`
  Update fake loop types and hook context expectations to the renamed API.
- `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
  Keep direct call behavior explicit and hook-free.
- `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
  Preserve direct bootstrap `observe.page` behavior without hook side effects.
- `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`
  Update imports and front-door wiring assertions after kernel rename.
- `docs/architecture/overview.md`
  Update canonical kernel filenames.
- `docs/project/current-state.md`
  Sync architecture truth and next active baseline after implementation.
- `PROGRESS.md`
  Record completion and evidence.
- `MEMORY.md`
  Record the new stable boundary around pi-agent-only hooks.
- `NEXT_STEP.md`
  Replace the current pointer with the next directly executable action after refactor completion.

### Existing files to delete after migration

- `apps/agent-runtime/src/kernel/agent-loop.ts`
- `apps/agent-runtime/src/kernel/mcp-tool-bridge.ts`
- `apps/agent-runtime/src/application/refine/tools/refine-tool-hook-observer.ts`
- `apps/agent-runtime/test/kernel/agent-loop-telemetry.test.ts`
- `apps/agent-runtime/test/kernel/mcp-tool-bridge.test.ts`

Delete only after the renamed files and replacement tests are green and all imports have been updated.

## Task 1: Freeze The New Hook Boundary With Tests

**Files:**
- Create: `apps/agent-runtime/test/kernel/pi-agent-tool-adapter.test.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
- Modify: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`

- [ ] **Step 1: Write the failing adapter hook-registration tests**

```ts
test("registered tool-name hooks run before and after adapter execution", async () => {
  const calls: string[] = [];
  const adapter = new PiAgentToolAdapter(rawClient, {
    hooks: new Map([
      [
        "act.click",
        [
          {
            async before(context) {
              calls.push(`before:${context.toolName}`);
              return { note: "capture" };
            },
            async after(context, result) {
              calls.push(`after:${context.toolName}`);
              return {
                ...result,
                content: [{ type: "text", text: "hooked click" }],
              };
            },
          },
        ],
      ],
    ]),
  });

  const [tool] = await adapter.buildAgentTools();
  const result = await tool.execute("call-1", { ref: "buy" });

  assert.deepEqual(calls, ["before:act.click", "after:act.click"]);
  assert.equal(result.content[0]?.text, "hooked click");
});
```

- [ ] **Step 2: Write the failing direct-call bypass tests**

```ts
test("refine direct tool surface calls do not execute pi-agent hooks", async () => {
  const observed: string[] = [];
  const surface = new RefineToolSurface({ registry, contextRef });

  await surface.callTool("observe.page", {});

  assert.deepEqual(observed, []);
});
```

- [ ] **Step 3: Run the targeted tests to verify they fail first**

Run: `npm --prefix apps/agent-runtime run test -- test/kernel/pi-agent-tool-adapter.test.ts test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts test/runtime/refine-run-bootstrap-provider.test.ts`
Expected: FAIL because the renamed adapter and new hook boundary do not exist yet.

- [ ] **Step 4: Commit the failing-test checkpoint**

```bash
git add apps/agent-runtime/test/kernel/pi-agent-tool-adapter.test.ts \
  apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts \
  apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts \
  apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts
git commit -m "test: define pi-agent hook adapter boundary"
```

## Task 2: Rename The Kernel Files And Symbols

**Files:**
- Create: `apps/agent-runtime/src/kernel/pi-agent-loop.ts`
- Create: `apps/agent-runtime/src/kernel/pi-agent-tool-adapter.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-workflow.ts`
- Modify: `apps/agent-runtime/src/application/refine/react-refinement-run-executor.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-workflow.test.ts`
- Create: `apps/agent-runtime/test/kernel/pi-agent-loop-telemetry.test.ts`
- Modify: `apps/agent-runtime/test/runtime/runtime-composition-root.test.ts`

- [ ] **Step 1: Copy the existing kernel files into renamed canonical homes**

```ts
export class PiAgentLoop { /* existing AgentLoop implementation, unchanged except rename */ }

export class PiAgentToolAdapter { /* existing McpToolBridge implementation, temporary carry-over */ }
```

- [ ] **Step 2: Update imports and symbol names without changing behavior yet**

```ts
import { PiAgentLoop } from "../../kernel/pi-agent-loop.js";
```

- [ ] **Step 3: Create the renamed loop telemetry test file and point it at `PiAgentLoop`**

Run: `npm --prefix apps/agent-runtime run test -- test/kernel/pi-agent-loop-telemetry.test.ts test/application/refine/refine-workflow.test.ts test/runtime/runtime-composition-root.test.ts`
Expected: PASS after all imports are updated.

- [ ] **Step 4: Delete the old kernel entrypoint imports only after renamed coverage passes**

```bash
git add apps/agent-runtime/src/kernel/pi-agent-loop.ts \
  apps/agent-runtime/src/kernel/pi-agent-tool-adapter.ts \
  apps/agent-runtime/src/application/refine/refine-workflow.ts \
  apps/agent-runtime/src/application/refine/react-refinement-run-executor.ts \
  apps/agent-runtime/test/kernel/pi-agent-loop-telemetry.test.ts \
  apps/agent-runtime/test/application/refine/refine-workflow.test.ts \
  apps/agent-runtime/test/runtime/runtime-composition-root.test.ts
git commit -m "refactor: rename pi-agent kernel entrypoints"
```

## Task 3: Replace Bridge Observer Hooks With Tool-Name Hook Registration

**Files:**
- Create: `apps/agent-runtime/src/kernel/pi-agent-tool-hooks.ts`
- Modify: `apps/agent-runtime/src/kernel/pi-agent-tool-adapter.ts`
- Modify: `apps/agent-runtime/src/kernel/pi-agent-loop.ts`
- Modify: `apps/agent-runtime/test/kernel/pi-agent-tool-adapter.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`

- [ ] **Step 1: Write the failing tests for exact tool-name registration and result replacement**

```ts
test("unregistered tools bypass hooks and preserve raw tool text", async () => {
  const adapter = new PiAgentToolAdapter(rawClient, {
    hooks: new Map(),
  });

  const [tool] = await adapter.buildAgentTools();
  const result = await tool.execute("call-1", { ref: "buy" });

  assert.equal(result.content[0]?.text, "clicked");
});
```

- [ ] **Step 2: Introduce the new kernel hook types**

```ts
export interface PiAgentToolExecutionContext {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
  runtimeContext?: Record<string, unknown>;
}

export interface PiAgentToolHook {
  before?(context: PiAgentToolExecutionContext): Promise<unknown>;
  after?(
    context: PiAgentToolExecutionContext,
    result: ToolCallResult,
    capture: unknown,
  ): Promise<ToolCallResult | void>;
}
```

- [ ] **Step 3: Replace `setToolHookObserver(...)` with hook-registry injection on `PiAgentLoop`**

```ts
setToolHooks(hooks: PiAgentToolHookRegistry): void {
  this.toolAdapter.setHooks(hooks);
}
```

- [ ] **Step 4: Replace adapter observer execution with per-tool hook lookup**

```ts
const hooks = this.hooks.get(name) ?? [];
const captures = await Promise.all(hooks.map((hook) => hook.before?.(context)));
let nextResult = await this.client.callTool(name, args);
for (const [index, hook] of hooks.entries()) {
  nextResult = (await hook.after?.(context, nextResult, captures[index])) ?? nextResult;
}
```

- [ ] **Step 5: Run the targeted kernel and executor tests**

Run: `npm --prefix apps/agent-runtime run test -- test/kernel/pi-agent-tool-adapter.test.ts test/kernel/pi-agent-loop-telemetry.test.ts test/replay-refinement/refine-react-run-executor.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/agent-runtime/src/kernel/pi-agent-tool-hooks.ts \
  apps/agent-runtime/src/kernel/pi-agent-tool-adapter.ts \
  apps/agent-runtime/src/kernel/pi-agent-loop.ts \
  apps/agent-runtime/test/kernel/pi-agent-tool-adapter.test.ts \
  apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts
git commit -m "refactor: add pi-agent tool-name hook registry"
```

## Task 4: Remove Direct-Call Hook Execution From Refine Surface

**Files:**
- Modify: `apps/agent-runtime/src/application/refine/tools/refine-tool-surface.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/refine-tool-hook-pipeline.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-react-tool-client.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
- Modify: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`

- [ ] **Step 1: Write the failing tests that assert direct `callTool(...)` stays hook-free**

```ts
test("bootstrap observe.page remains a plain direct call", async () => {
  const client = new RefineReactToolClient({ rawClient, session });
  const observed = await client.callTool("observe.page", {});
  assert.ok((observed as Record<string, unknown>).observation);
  assert.deepEqual(hookEvents, []);
});
```

- [ ] **Step 2: Remove hook execution from `RefineToolSurface.callTool(...)`**

```ts
async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const definition = this.registry.getDefinition(name);
  return definition.invoke(args, this.contextRef.get());
}
```

- [ ] **Step 3: Remove no-op compatibility hook placeholders from `RefineReactToolClient` composition shims**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts test/runtime/refine-run-bootstrap-provider.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/agent-runtime/src/application/refine/tools/refine-tool-surface.ts \
  apps/agent-runtime/src/application/refine/tools/refine-tool-hook-pipeline.ts \
  apps/agent-runtime/src/application/refine/refine-react-tool-client.ts \
  apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts \
  apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts \
  apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts
git commit -m "refactor: remove direct-call refine hook execution"
```

## Task 5: Rewire Refine To Export Pi-Agent Hook Registrations

**Files:**
- Create: `apps/agent-runtime/src/application/refine/tools/refine-pi-agent-tool-hooks.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-workflow.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-workflow.test.ts`
- Modify: `apps/agent-runtime/test/kernel/pi-agent-tool-adapter.test.ts`

- [ ] **Step 1: Write the failing workflow assembly test for hook registration handoff**

```ts
assert.equal(typeof loop.setToolHooks, "function");
assert.equal(receivedHooks instanceof Map, true);
```

- [ ] **Step 2: Replace `hookObserver` exports with adapter hook registrations**

```ts
const toolHooks = createRefinePiAgentToolHooks({
  pipeline: hookPipeline,
  resolveContext: () => contextRef.get(),
});
```

- [ ] **Step 3: Wire `RefineWorkflow` to call `loop.setToolHooks(toolComposition.toolHooks)`**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-workflow.test.ts test/kernel/pi-agent-tool-adapter.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/agent-runtime/src/application/refine/tools/refine-pi-agent-tool-hooks.ts \
  apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts \
  apps/agent-runtime/src/application/refine/refine-workflow.ts \
  apps/agent-runtime/test/application/refine/refine-workflow.test.ts \
  apps/agent-runtime/test/kernel/pi-agent-tool-adapter.test.ts
git commit -m "refactor: wire refine hooks through pi-agent adapter"
```

## Task 6: Delete Old Seam And Sync Docs

**Files:**
- Delete: `apps/agent-runtime/src/application/refine/tools/refine-tool-hook-observer.ts`
- Delete: `apps/agent-runtime/src/kernel/agent-loop.ts`
- Delete: `apps/agent-runtime/src/kernel/mcp-tool-bridge.ts`
- Delete: `apps/agent-runtime/test/kernel/agent-loop-telemetry.test.ts`
- Delete: `apps/agent-runtime/test/kernel/mcp-tool-bridge.test.ts`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/project/current-state.md`
- Modify: `PROGRESS.md`
- Modify: `MEMORY.md`
- Modify: `NEXT_STEP.md`

- [ ] **Step 1: Delete the obsolete observer seam and old kernel filenames**

```bash
rm apps/agent-runtime/src/application/refine/tools/refine-tool-hook-observer.ts
rm apps/agent-runtime/src/kernel/agent-loop.ts
rm apps/agent-runtime/src/kernel/mcp-tool-bridge.ts
rm apps/agent-runtime/test/kernel/agent-loop-telemetry.test.ts
rm apps/agent-runtime/test/kernel/mcp-tool-bridge.test.ts
```

- [ ] **Step 2: Update architecture docs and project truth files**

```md
- kernel canonical files are now `pi-agent-loop.ts` and `pi-agent-tool-adapter.ts`
- pi-agent hooks execute only through the adapter path
- direct `ToolClient.callTool(...)` stays hook-free
```

- [ ] **Step 3: Run full project gates**

Run: `npm --prefix apps/agent-runtime run lint`
Expected: PASS

Run: `npm --prefix apps/agent-runtime run test`
Expected: PASS

Run: `npm --prefix apps/agent-runtime run typecheck`
Expected: PASS

Run: `npm --prefix apps/agent-runtime run build`
Expected: PASS

Run: `npm --prefix apps/agent-runtime run hardgate`
Expected: PASS

Run: `git diff --check`
Expected: no output

- [ ] **Step 4: Commit the completed refactor**

```bash
git add docs/architecture/overview.md \
  docs/project/current-state.md \
  PROGRESS.md MEMORY.md NEXT_STEP.md \
  apps/agent-runtime/src \
  apps/agent-runtime/test
git commit -m "refactor: align pi-agent hook adapter boundary"
```

## Execution Notes

- Preserve the refine-facing tool contracts exactly; this refactor changes ownership and execution boundaries, not product semantics.
- Do not leave compatibility shims for the old bridge observer API once the new registry path is live.
- Keep `runtimeContext` in the kernel hook types generic; do not reintroduce refine-specific page/session fields into the kernel API unless a concrete need appears in tests.
- Prefer import-path updates and file renames in isolated commits before deleting old files.
- Only update `NEXT_STEP.md` after the code and verification evidence are fresh; until then, leave the current execution pointer unchanged.
