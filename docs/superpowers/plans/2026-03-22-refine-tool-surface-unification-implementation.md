---
doc_type: plan
status: completed
implements:
  - docs/superpowers/specs/2026-03-22-refine-tool-surface-unification-design.md
verified_by:
  - npm --prefix apps/agent-runtime run lint
  - npm --prefix apps/agent-runtime run test
  - npm --prefix apps/agent-runtime run typecheck
  - npm --prefix apps/agent-runtime run build
  - npm --prefix apps/agent-runtime run hardgate
  - git diff --check
supersedes: []
related:
  - docs/superpowers/specs/2026-03-22-refine-tool-surface-unification-design.md
  - apps/agent-runtime/src/contracts/tool-client.ts
  - apps/agent-runtime/src/application/refine/refine-react-tool-client.ts
  - apps/agent-runtime/src/application/refine/refine-react-tool-registry.ts
  - apps/agent-runtime/src/application/refine/refine-react-browser-tool-adapter.ts
  - apps/agent-runtime/src/application/refine/refine-react-runtime-tool-adapter.ts
  - apps/agent-runtime/src/application/refine/tools/runtime/refine-browser-tools.ts
  - apps/agent-runtime/src/application/refine/tools/runtime/refine-runtime-tools.ts
  - apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts
  - apps/agent-runtime/src/application/refine/react-refinement-run-executor.ts
  - apps/agent-runtime/src/application/refine/refine-workflow.ts
  - apps/agent-runtime/src/kernel/mcp-tool-bridge.ts
  - apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts
  - apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts
---

# Refine Tool Surface Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `refine` tooling around first-class tool definitions, a dedicated tool surface, and an explicit hook pipeline while preserving the existing 12-tool contract and current bootstrap/executor behavior.

**Architecture:** Introduce a new refine-local `tools/` subsystem with `ToolDefinition`, `ToolRegistry`, `ToolSurface`, `ToolHookPipeline`, and run-scoped providers. Migrate `RefineReactToolClient` into a thin compatibility facade over this subsystem, keep `AgentLoop` and the current `McpToolBridge` integration stable, and delete the old adapter-centric dispatch path only after the new surface is covered by regression tests.

**Tech Stack:** TypeScript, Node built-in test runner via `tsx --test`, `@mariozechner/pi-agent-core`, existing `ToolClient` / `AgentLoop` contracts, current refine browser/runtime helpers.

---

## Planned File Map

### New files

- `apps/agent-runtime/src/application/refine/tools/refine-tool-definition.ts`
  Defines the first-class refine tool contract.
- `apps/agent-runtime/src/application/refine/tools/refine-tool-context.ts`
  Defines the run-scoped context and mutable context reference used by the surface.
- `apps/agent-runtime/src/application/refine/tools/refine-tool-hook-pipeline.ts`
  Defines hook interfaces and the default no-op / composed pipeline behavior.
- `apps/agent-runtime/src/application/refine/tools/refine-tool-hook-observer.ts`
  Adapts the refine-owned hook pipeline into the current `McpToolCallHookObserver` seam used by `AgentLoop`.
- `apps/agent-runtime/src/application/refine/tools/refine-tool-order.ts`
  Holds the explicit refine-owned ordered tool-name contract so it no longer lives in `domain/`.
- `apps/agent-runtime/src/application/refine/tools/refine-tool-registry.ts`
  Registers first-class tool definitions, enforces uniqueness, and exposes ordered lookup.
- `apps/agent-runtime/src/application/refine/tools/refine-tool-surface.ts`
  Owns the unified `list/call/connect/disconnect` entrypoint for refine.
- `apps/agent-runtime/src/application/refine/tools/refine-tool-surface-lifecycle.ts`
  Owns connect/disconnect sequencing and partial-connect rollback after registry stops owning adapter lifecycle.
- `apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts`
  Owns refine tool-surface assembly so composition no longer lives in `RefineReactToolClient`.
- `apps/agent-runtime/src/application/refine/tools/providers/refine-browser-provider.ts`
  Wraps browser-facing helper behavior needed by refine browser tools.
- `apps/agent-runtime/src/application/refine/tools/providers/refine-runtime-provider.ts`
  Wraps runtime/session/HITL/finish behavior needed by runtime tools.
- `apps/agent-runtime/src/application/refine/tools/definitions/observe-page-tool.ts`
- `apps/agent-runtime/src/application/refine/tools/definitions/observe-query-tool.ts`
- `apps/agent-runtime/src/application/refine/tools/definitions/act-click-tool.ts`
- `apps/agent-runtime/src/application/refine/tools/definitions/act-type-tool.ts`
- `apps/agent-runtime/src/application/refine/tools/definitions/act-press-tool.ts`
- `apps/agent-runtime/src/application/refine/tools/definitions/act-navigate-tool.ts`
- `apps/agent-runtime/src/application/refine/tools/definitions/act-select-tab-tool.ts`
- `apps/agent-runtime/src/application/refine/tools/definitions/act-screenshot-tool.ts`
- `apps/agent-runtime/src/application/refine/tools/definitions/act-file-upload-tool.ts`
- `apps/agent-runtime/src/application/refine/tools/definitions/hitl-request-tool.ts`
- `apps/agent-runtime/src/application/refine/tools/definitions/knowledge-record-candidate-tool.ts`
- `apps/agent-runtime/src/application/refine/tools/definitions/run-finish-tool.ts`
  One file per agent-visible refine tool so schema, description, and invoke behavior live together.
- `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
  Covers registry ordering, duplicate rejection, hook routing, and surface call behavior.
- `apps/agent-runtime/test/kernel/mcp-tool-bridge.test.ts`
  Freezes current bridge behavior at the `AgentLoop` boundary, especially the current refine-name hook mismatch.

### Existing files to modify

- `apps/agent-runtime/src/application/refine/refine-react-tool-client.ts`
  Convert to a thin compatibility facade over the new refine tool surface.
- `apps/agent-runtime/src/application/refine/tools/runtime/refine-browser-tools.ts`
  Either narrow to provider-facing helpers or extract behavior into browser provider internals.
- `apps/agent-runtime/src/application/refine/tools/runtime/refine-runtime-tools.ts`
  Either narrow to provider-facing helpers or extract behavior into runtime provider internals.
- `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
  Keep current caller contract, but switch to the new surface/context seam without changing returned behavior.
- `apps/agent-runtime/src/application/refine/react-refinement-run-executor.ts`
  Keep `getSession()`-based runtime behavior intact after surface migration.
- `apps/agent-runtime/src/application/refine/refine-workflow.ts`
  Rewire refine assembly to build the new surface and preserve current `AgentLoop` injection.
- `apps/agent-runtime/src/domain/refine-react.ts`
  Remove refine-owned tool ordering from the domain layer.
- `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
  Extend current contract tests to lock result-shape and facade behavior during migration.
- `apps/agent-runtime/test/replay-refinement/refine-react-contracts.test.ts`
  Move tool-order contract assertions to the new refine-owned contract location.
- `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
  Lock bootstrap-visible `observe.page` response assumptions and session wiring behavior.
- `apps/agent-runtime/test/application/refine/refine-workflow.test.ts`
  Keep assembly expectations aligned with the new facade.
- `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`
  Preserve constructor/facade compatibility for executor tests that instantiate the client directly.
- `apps/agent-runtime/test/application/refine/refine-telemetry-artifacts.test.ts`
  Preserve constructor/facade compatibility for telemetry-focused refine tests.

### Existing files to delete after migration

- `apps/agent-runtime/src/application/refine/refine-react-tool-registry.ts`
- `apps/agent-runtime/src/application/refine/refine-react-browser-tool-adapter.ts`
- `apps/agent-runtime/src/application/refine/refine-react-runtime-tool-adapter.ts`

Delete only after the new surface fully replaces their behavior and all regression tests pass.

## Task 1: Freeze Current Surface, Bootstrap, And Bridge Behavior

**Files:**
- Create: `apps/agent-runtime/test/kernel/mcp-tool-bridge.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
- Modify: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`

- [x] **Step 1: Write the failing bridge regression test**

```ts
test("mcp tool bridge keeps current refine-name hook behavior unchanged", async () => {
  const calls: string[] = [];
  const client: ToolClient = {
    async connect() {},
    async disconnect() {},
    async listTools() {
      return [{ name: "act.click", description: "click", inputSchema: { type: "object", properties: {} } }];
    },
    async callTool() {
      return { content: [{ type: "text", text: "clicked" }] };
    },
  };

  const bridge = new McpToolBridge(client, {
    hookObserver: {
      async beforeToolCall() {
        calls.push("before");
        return null;
      },
      async afterToolCall() {
        calls.push("after");
        return null;
      },
    },
  });

  const [tool] = await bridge.buildAgentTools();
  const result = await tool.execute("call-1", {});

  assert.equal(result.content[0]?.text, "clicked");
  assert.deepEqual(calls, []);
});
```

- [x] **Step 2: Run targeted tests to verify the new bridge assertion fails first**

Run: `npm --prefix apps/agent-runtime run test -- test/kernel/mcp-tool-bridge.test.ts`
Expected: FAIL because the test file does not exist yet or imports are incomplete.

- [x] **Step 3: Extend current tool-client contract tests with explicit result-shape locks**

```ts
test("observe.page keeps bootstrap-visible observation payload shape", async () => {
  const raw = new StubRawToolClient();
  const session = createRefineReactSession("run-shape", "task", { taskScope: "shape" });
  const client = new RefineReactToolClient({ rawClient: raw, session });

  const observed = (await client.callTool("observe.page", {})) as Record<string, unknown>;
  const observation = observed.observation as Record<string, unknown>;
  const page = observation.page as Record<string, unknown>;

  assert.equal(typeof observation.observationRef, "string");
  assert.equal(typeof observation.snapshot, "string");
  assert.equal(typeof page.origin, "string");
  assert.equal(typeof page.normalizedPath, "string");
  assert.equal(typeof page.title, "string");
});
```

- [x] **Step 4: Extend bootstrap tests to lock current `setSession` / `setHitlAnswerProvider` caller contract**

```ts
assert.equal(typeof input.toolClient.setSession, "function");
assert.equal(typeof input.toolClient.setHitlAnswerProvider, "function");
```

- [x] **Step 5: Run all targeted regression tests and verify they pass**

Run: `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-tool-client.test.ts test/runtime/refine-run-bootstrap-provider.test.ts test/kernel/mcp-tool-bridge.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts \
  apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts \
  apps/agent-runtime/test/kernel/mcp-tool-bridge.test.ts
git commit -m "test: freeze refine tool surface and bridge behavior"
```

## Task 2: Introduce Core Tool Contracts, Order Contract, Registry, And Surface

**Files:**
- Create: `apps/agent-runtime/src/application/refine/tools/refine-tool-definition.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/refine-tool-context.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/refine-tool-hook-pipeline.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/refine-tool-order.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/refine-tool-registry.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/refine-tool-surface.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/refine-tool-surface-lifecycle.ts`
- Create: `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-contracts.test.ts`
- Modify: `apps/agent-runtime/src/domain/refine-react.ts`

- [x] **Step 1: Write the failing registry/surface tests first**

```ts
test("registry rejects duplicate tool names and preserves explicit order", async () => {
  const registry = new RefineToolRegistry({
    definitions: [toolA, toolB],
    orderedToolNames: ["tool.b", "tool.a"],
  });

  assert.deepEqual(registry.listDefinitions().map((item) => item.name), ["tool.b", "tool.a"]);
});

test("tool surface lists definitions in explicit refine-owned order", async () => {
  const surface = new RefineToolSurface({ registry, contextRef, lifecycle });
  assert.deepEqual(surface.listTools().map((item) => item.name), ["tool.b", "tool.a"]);
});
```

- [x] **Step 2: Run the new test file and confirm it fails**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts`
Expected: FAIL because the new contracts and surface do not exist yet.

- [x] **Step 3: Add the minimal new contracts, explicit order contract, and no-op lifecycle implementation**

```ts
export interface RefineToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  invoke(args: Record<string, unknown>, context: RefineToolContext): Promise<ToolCallResult>;
}

export interface RefineToolContextRef {
  get(): RefineToolContext;
  set(next: RefineToolContext): void;
}

export const REFINE_TOOL_ORDER = [
  "observe.page",
  // ...
  "run.finish",
] as const;
```

- [x] **Step 4: Implement the registry with duplicate protection and ordered lookup**

```ts
const byName = new Map(definitions.map((definition) => [definition.name, definition]));
for (const name of orderedToolNames) {
  if (!byName.has(name)) {
    throw new Error(`missing refine tool definition: ${name}`);
  }
}
```

- [x] **Step 5: Implement the surface with `listTools()` / `callTool()` plus hook routing**
- [x] **Step 5: Implement the surface with `listTools()` / `callTool()` and explicit order consumption**

```ts
async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const definition = this.registry.get(name);
  if (!definition) {
    throw new Error(`unknown refine tool: ${name}`);
  }
  const context = this.contextRef.get();
  return definition.invoke(args, context);
}
```

- [x] **Step 6: Move refine tool ordering out of `domain/refine-react.ts` and update contract tests**

```ts
import { REFINE_TOOL_ORDER } from "../../src/application/refine/tools/refine-tool-order.js";
```

- [x] **Step 7: Run the new surface/order tests and verify they pass**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-contracts.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/agent-runtime/src/application/refine/tools \
  apps/agent-runtime/src/domain/refine-react.ts \
  apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts \
  apps/agent-runtime/test/replay-refinement/refine-react-contracts.test.ts
git commit -m "refactor: add refine tool surface core abstractions"
```

## Task 3: Add Hook Pipeline, Bridge Observer Adapter, And Run-Scoped Context Ownership

**Files:**
- Create: `apps/agent-runtime/src/application/refine/tools/refine-tool-hook-observer.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/providers/refine-browser-provider.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/providers/refine-runtime-provider.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/runtime/refine-browser-tools.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/runtime/refine-runtime-tools.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- Modify: `apps/agent-runtime/test/kernel/mcp-tool-bridge.test.ts`

- [x] **Step 1: Write failing tests for context swaps and lifecycle rollback**

```ts
test("surface lifecycle rolls back partial connect failures", async () => {
  const events: string[] = [];
  const lifecycle = new RefineToolSurfaceLifecycle([
    { async connect() { events.push("a.connect"); }, async disconnect() { events.push("a.disconnect"); } },
    { async connect() { events.push("b.connect"); throw new Error("boom"); }, async disconnect() { events.push("b.disconnect"); } },
  ]);

  await assert.rejects(() => lifecycle.connect(), /boom/);
  assert.deepEqual(events, ["a.connect", "b.connect", "a.disconnect"]);
});

test("hook pipeline adapts into the current bridge observer seam", async () => {
  const pipeline = createRefineToolHookPipeline({
    beforeCall: async () => ({ captureStatus: "skipped" }),
  });
  const observer = createRefineToolHookObserver(pipeline);
  assert.equal(typeof observer.beforeToolCall, "function");
});
```

- [x] **Step 2: Run the surface tests to confirm the lifecycle cases fail first**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts`
Expected: FAIL because provider-backed lifecycle and rollback behavior are not implemented yet.

- [x] **Step 3: Add provider interfaces that wrap capability-oriented browser/runtime behavior**

```ts
export interface RefineBrowserProvider {
  capturePageObservation(): Promise<ObservePageResponse>;
  queryObservation(request: ObserveQueryRequest): Promise<ObserveQueryResponse>;
  executeElementAction(input: { kind: "click" | "type" | "press"; args: Record<string, unknown> }): Promise<{ result: ActionExecutionResult }>;
  navigateFromObservation(args: { url: string; sourceObservationRef: string }): Promise<{ result: ActionExecutionResult }>;
  switchActiveTab(args: { tabIndex: number; sourceObservationRef: string }): Promise<{ result: ActionExecutionResult }>;
  captureScreenshot(args: { sourceObservationRef: string; fullPage?: boolean; filename?: string }): Promise<{ result: ActionExecutionResult }>;
  handleFileUpload(args: { sourceObservationRef: string; paths?: string[] }): Promise<{ result: ActionExecutionResult }>;
}
```

- [x] **Step 4: Implement provider-backed lifecycle ownership and a bridge-observer adapter over the new hook pipeline**

```ts
for (const participant of this.participants) {
  await participant.connect?.();
  connected.push(participant);
}
```

- [x] **Step 5: Keep `RefineBrowserTools` and `RefineRuntimeTools` as internal engines for now, but map them through capability-oriented providers**

```ts
export class RefineBrowserProviderImpl implements RefineBrowserProvider {
  constructor(private readonly tools: RefineBrowserTools) {}
  capturePageObservation() {
    return this.tools.observePage();
  }
}
```

- [x] **Step 6: Re-run the surface tests and verify provider/lifecycle behavior passes**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add apps/agent-runtime/src/application/refine/tools/providers \
  apps/agent-runtime/src/application/refine/tools/refine-tool-hook-observer.ts \
  apps/agent-runtime/src/application/refine/tools/runtime/refine-browser-tools.ts \
  apps/agent-runtime/src/application/refine/tools/runtime/refine-runtime-tools.ts \
  apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts \
  apps/agent-runtime/test/kernel/mcp-tool-bridge.test.ts
git commit -m "refactor: add refine hook pipeline and provider layer"
```

## Task 4: Migrate Runtime Tools To First-Class Definitions

**Files:**
- Create: `apps/agent-runtime/src/application/refine/tools/definitions/hitl-request-tool.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/definitions/knowledge-record-candidate-tool.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/definitions/run-finish-tool.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`

- [x] **Step 1: Write failing tests that runtime tools are registered from first-class definitions**

```ts
test("runtime tool definitions expose frozen schemas and invoke provider behavior", async () => {
  const tools = surface.listTools();
  assert.equal(findTool(tools, "run.finish").description.includes("completion"), true);

  const result = await surface.callTool("run.finish", {
    reason: "goal_achieved",
    summary: "done",
  });

  assert.deepEqual(result, { accepted: true, finalStatus: "completed" });
});
```

- [x] **Step 2: Run targeted tests and verify failure**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts`
Expected: FAIL because runtime tool definitions are not registered yet.

- [x] **Step 3: Implement the three runtime tool definition files with colocated schema and invoke**

```ts
export const runFinishTool: RefineToolDefinition = {
  name: "run.finish",
  description: "Explicitly mark refine run completion or hard failure with a summary.",
  inputSchema: { /* existing schema */ },
  async invoke(args, context) {
    return context.runtime.finishRun({
      reason: readEnumArg(args, "reason", RUN_FINISH_REASONS),
      summary: readStringArg(args, "summary"),
    }) as unknown as ToolCallResult;
  },
};
```

- [x] **Step 4: Register the runtime definitions in the new surface while keeping old adapters untouched**

```ts
const definitions = [
  hitlRequestTool,
  knowledgeRecordCandidateTool,
  runFinishTool,
];
```

- [x] **Step 5: Re-run targeted tests and verify pass**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add apps/agent-runtime/src/application/refine/tools/definitions \
  apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts \
  apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts
git commit -m "refactor: move refine runtime tools to first-class definitions"
```

## Task 5: Migrate Core Browser Tools To First-Class Definitions

**Files:**
- Create: `apps/agent-runtime/src/application/refine/tools/definitions/observe-page-tool.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/definitions/observe-query-tool.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/definitions/act-click-tool.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/definitions/act-type-tool.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/definitions/act-press-tool.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/definitions/act-navigate-tool.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/definitions/act-select-tab-tool.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`

- [x] **Step 1: Write failing tests for browser-definition registration and behavior parity**

```ts
test("browser tool definitions preserve current tool order", async () => {
  assert.deepEqual(surface.listTools().slice(0, 7).map((item) => item.name), [
    "observe.page",
    "observe.query",
    "act.click",
    "act.type",
    "act.press",
    "act.navigate",
    "act.select_tab",
  ]);
});
```

- [x] **Step 2: Run targeted browser-surface tests and verify failure**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts`
Expected: FAIL because browser definitions are not registered yet.

- [x] **Step 3: Implement first-class definitions for observe/query/click/type/press/navigate/select_tab**

```ts
export const actClickTool: RefineToolDefinition = {
  name: "act.click",
  description: "Click a UI element from a specific source observation.",
  inputSchema: { /* existing schema */ },
  async invoke(args, context) {
    return context.browser.executeElementAction({
      kind: "click",
      args: {
        elementRef: readStringArg(args, "elementRef"),
        sourceObservationRef: readStringArg(args, "sourceObservationRef"),
      },
    });
  },
};
```

- [x] **Step 4: Register these definitions ahead of screenshot/file-upload to preserve current order**

```ts
const orderedDefinitions = [
  observePageTool,
  observeQueryTool,
  actClickTool,
  actTypeTool,
  actPressTool,
  actNavigateTool,
  actSelectTabTool,
];
```

- [x] **Step 5: Re-run targeted tests and verify pass**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add apps/agent-runtime/src/application/refine/tools/definitions \
  apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts \
  apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts
git commit -m "refactor: move core refine browser tools to definitions"
```

## Task 6: Migrate Screenshot And File Upload With Compatibility Negotiation Intact

**Files:**
- Create: `apps/agent-runtime/src/application/refine/tools/definitions/act-screenshot-tool.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/definitions/act-file-upload-tool.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/providers/refine-browser-provider.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`

- [x] **Step 1: Write failing compatibility tests for screenshot fallback and file-upload behavior**

```ts
test("act.screenshot keeps raw screenshot capability negotiation", async () => {
  const raw = new StubRawToolClient({ screenshotToolName: "browser_screenshot" });
  const client = buildClientFromNewSurface(raw);

  await client.callTool("observe.page", {});
  const result = await client.callTool("act.screenshot", {
    sourceObservationRef: "obs_run-1_1",
    filename: "capture.png",
  });

  assert.match(JSON.stringify(result), /capture\.png/);
  assert.equal(raw.calls.some((call) => call.name === "browser_screenshot"), true);
});
```

- [x] **Step 2: Run targeted tests and verify failure**

Run: `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-tool-client.test.ts`
Expected: FAIL because screenshot/file-upload definitions are not wired through the new surface yet.

- [x] **Step 3: Implement `act.screenshot` as a first-class definition that delegates to the browser provider**

```ts
export const actScreenshotTool: RefineToolDefinition = {
  name: "act.screenshot",
  description: "Capture a screenshot and optionally write it to a file path.",
  inputSchema: { /* existing schema */ },
  async invoke(args, context) {
    return context.browser.captureScreenshot({
      sourceObservationRef: readStringArg(args, "sourceObservationRef"),
      fullPage: readBooleanArg(args, "fullPage"),
      filename: readScreenshotOutputArg(args),
    });
  },
};
```

- [x] **Step 4: Keep the existing raw-tool probing logic inside the browser provider**

```ts
const candidates = [
  { name: "browser_take_screenshot", args: buildScreenshotArgs(input, "always") },
  { name: "browser_screenshot", args: buildScreenshotArgs(input, "optional") },
];
```

- [x] **Step 5: Re-run targeted tests and verify pass**

Run: `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-tool-client.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add apps/agent-runtime/src/application/refine/tools/definitions/act-screenshot-tool.ts \
  apps/agent-runtime/src/application/refine/tools/definitions/act-file-upload-tool.ts \
  apps/agent-runtime/src/application/refine/tools/providers/refine-browser-provider.ts \
  apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts
git commit -m "refactor: preserve browser tool compatibility in new refine surface"
```

## Task 7: Rebuild `RefineReactToolClient` As A Compatibility Facade And Remove Old Adapters

**Files:**
- Create: `apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-react-tool-client.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-workflow.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/src/application/refine/react-refinement-run-executor.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-workflow.test.ts`
- Modify: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-telemetry-artifacts.test.ts`
- Delete: `apps/agent-runtime/src/application/refine/refine-react-tool-registry.ts`
- Delete: `apps/agent-runtime/src/application/refine/refine-react-browser-tool-adapter.ts`
- Delete: `apps/agent-runtime/src/application/refine/refine-react-runtime-tool-adapter.ts`

- [x] **Step 1: Write failing workflow-level tests for composition ownership and facade compatibility**

```ts
test("refine workflow assembly builds tool composition outside the client facade", async () => {
  const composition = createRefineToolComposition({ rawToolClient });

  assert.equal(typeof composition.surface.callTool, "function");
  assert.equal(typeof composition.contextRef.set, "function");
});

test("refine workflow assembly still injects a RefineReactToolClient-compatible facade", async () => {
  assert.equal(input.toolClient instanceof RefineReactToolClient, true);
  assert.equal(typeof input.toolClient.setSession, "function");
  assert.equal(typeof input.toolClient.getSession, "function");
  assert.equal(typeof input.toolClient.setHitlAnswerProvider, "function");
});
```

- [x] **Step 2: Run workflow/bootstrap tests and verify failure**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-workflow.test.ts test/runtime/refine-run-bootstrap-provider.test.ts test/replay-refinement/refine-react-run-executor.test.ts test/application/refine/refine-telemetry-artifacts.test.ts`
Expected: FAIL because composition ownership is still client-centric and direct constructor call sites are not yet updated for the new facade internals.

- [x] **Step 3: Introduce explicit refine tool composition and keep `RefineReactToolClientOptions` constructor compatibility**

```ts
export function createRefineToolComposition(input: RefineToolCompositionInput): RefineToolComposition {
  const providers = createRefineToolProviders(input);
  const registry = createRefineToolRegistry(buildRefineToolDefinitions(providers));
  const contextRef = createRefineToolContextRef({ providers, session: null });
  const surface = new RefineToolSurface(registry, contextRef, providers.hookPipeline);

  return { providers, registry, contextRef, surface };
}

export class RefineReactToolClient implements ToolClient {
  private readonly composition: RefineToolComposition;

  constructor(optionsOrSurface: RefineReactToolClientOptions | RefineToolSurface, contextRef?: RefineToolContextRef) {
    this.composition = isRefineReactToolClientOptions(optionsOrSurface)
      ? createRefineToolCompositionFromLegacyOptions(optionsOrSurface)
      : { surface: optionsOrSurface, contextRef: assertPresent(contextRef), ...emptyCompositionDeps };
  }

  setSession(session: RefineReactSession): void {
    this.composition.contextRef.set({ ...this.composition.contextRef.get(), session });
  }

  setHitlAnswerProvider(provider?: HitlAnswerProvider): void {
    this.composition.contextRef.set({
      ...this.composition.contextRef.get(),
      runtime: this.composition.contextRef.get().runtime.withHitlAnswerProvider(provider),
    });
  }
}
```

- [x] **Step 4: Rewire refine workflow assembly and tests to depend on `createRefineToolComposition(...)`, not client-internal assembly**

```ts
const composition = createRefineToolComposition({
  rawToolClient: options.rawToolClient,
  runtimeTools,
  browserProviderFactory,
});

const toolClient = new RefineReactToolClient(composition.surface, composition.contextRef);
const loop = createLoop({ ..., toolClient, ... });
loop.setToolHookObserver(createRefineToolHookObserver(composition.providers.hookPipeline));
```

Keep `createBootstrapRefineReactToolClient(...)` only as a compatibility shim if still needed by call sites; its implementation should delegate to `createRefineToolComposition(...)` rather than remain the architectural owner of registration/assembly.

After bootstrap/run execution creates the concrete refine run, update the hook context from the runtime owner (`refine-run-bootstrap-provider.ts` or `react-refinement-run-executor.ts`) using only the supported `Partial<ToolCallHookContext>` fields that are actually known at that point, for example:

```ts
loop.setToolHookContext({
  runId: session.runId,
  sessionId: session.runId,
  stepIndex: session.actionHistory().length,
});
```

- [x] **Step 5: Delete the old adapter-centric files only after the new facade passes tests**

```bash
git rm apps/agent-runtime/src/application/refine/refine-react-tool-registry.ts \
  apps/agent-runtime/src/application/refine/refine-react-browser-tool-adapter.ts \
  apps/agent-runtime/src/application/refine/refine-react-runtime-tool-adapter.ts
```

- [x] **Step 6: Run targeted integration tests and verify pass**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-workflow.test.ts test/runtime/refine-run-bootstrap-provider.test.ts test/replay-refinement/refine-react-tool-client.test.ts test/replay-refinement/refine-react-run-executor.test.ts test/application/refine/refine-telemetry-artifacts.test.ts`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts \
  apps/agent-runtime/src/application/refine/refine-react-tool-client.ts \
  apps/agent-runtime/src/application/refine/refine-workflow.ts \
  apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts \
  apps/agent-runtime/src/application/refine/react-refinement-run-executor.ts \
  apps/agent-runtime/test/application/refine/refine-workflow.test.ts \
  apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts \
  apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts \
  apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts \
  apps/agent-runtime/test/application/refine/refine-telemetry-artifacts.test.ts
git commit -m "refactor: rebuild refine react tool client around tool surface"
```

## Task 8: Verify Full Integration, Clean Up, And Sync Project Docs

**Files:**
- Modify: `PROGRESS.md`
- Modify: `MEMORY.md`
- Modify: `NEXT_STEP.md`
- Modify: `docs/project/current-state.md`

- [x] **Step 1: Run the full refine-focused test slice before full gates**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/*.test.ts test/replay-refinement/*.test.ts test/runtime/refine-run-bootstrap-provider.test.ts test/kernel/*.test.ts`
Expected: PASS

- [x] **Step 2: Run full project verification**

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

- [x] **Step 3: Update project-truth docs with the new refine tool-surface architecture and fresh evidence**

```md
- refine tooling now routes through first-class tool definitions, a dedicated tool surface, and an explicit hook pipeline
- `RefineReactToolClient` remains as a compatibility facade for workflow/bootstrap callers
- update `docs/project/current-state.md` active architecture section so the active spec and active plan point at `2026-03-22-refine-tool-surface-unification-design.md` and `2026-03-22-refine-tool-surface-unification-implementation.md`
- sync `PROGRESS.md` with the completed implementation milestone and evidence commands
```

- [x] **Step 4: Set the next pointer to the next highest-value refine stability task**

```md
- `P0` run one fresh refine smoke e2e against the new tool surface and inspect bridge/hook telemetry behavior
```

- [x] **Step 5: Commit**

```bash
git add PROGRESS.md MEMORY.md NEXT_STEP.md docs/project/current-state.md
git commit -m "docs: sync refine tool surface unification results"
```
