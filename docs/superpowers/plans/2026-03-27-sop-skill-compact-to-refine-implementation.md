---
doc_type: plan
status: completed
implements:
  - docs/superpowers/specs/2026-03-27-sop-skill-compact-to-refine-design.md
verified_by:
  - artifacts/code-gate/2026-03-27T04-49-22-654Z/report.json
supersedes: []
related:
  - apps/agent-runtime/src/application/compact/interactive-sop-compact.ts
  - apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts
  - apps/agent-runtime/src/application/shell/command-router.ts
---

# SOP Skill Compact To Refine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Spec Path:** `docs/superpowers/specs/2026-03-27-sop-skill-compact-to-refine-design.md`

**Goal:** Turn `observe -> sop-compact -> refine` into a named user-level SOP skill workflow where compact writes `SKILL.md` files under `~/.sasiki/skills/`, refine loads all frontmatter by default, and refine can read one selected skill body on demand.

**Architecture:** Introduce a durable SOP skill file model and a user-level store that discovers skills by scanning `~/.sasiki/skills/*/SKILL.md` and parsing YAML frontmatter. Rework `sop-compact` so its durable output is a named `SKILL.md` instead of only `compact_capability_output.json`, then thread the resulting skill catalog into refine bootstrap plus a narrow `skill.reader` tool. Keep CLI management minimal in this pass by adding `sop-compact list` rather than a new top-level command surface.

**Tech Stack:** TypeScript, Node 20 fs/path APIs, existing `agent-runtime` workflow shell, refine tool surface, repo tests via `tsx --test`

---

**Allowed Write Scope:** `apps/agent-runtime/src/**`, `apps/agent-runtime/test/**`, `docs/superpowers/specs/**`, `docs/superpowers/plans/**`, `PROGRESS.md`, `NEXT_STEP.md`, `MEMORY.md`, `docs/project/current-state.md`, `docs/architecture/overview.md`

**Verification Commands:** `npm --prefix apps/agent-runtime run test -- test/infrastructure/persistence/sop-skill-store.test.ts`, `npm --prefix apps/agent-runtime run test -- test/application/compact/interactive-sop-compact.test.ts test/runtime/command-router.test.ts`, `npm --prefix apps/agent-runtime run test -- test/runtime/refine-run-bootstrap-provider.test.ts test/application/refine/prompt-provider.test.ts`, `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts`, `npm --prefix apps/agent-runtime run lint`, `npm --prefix apps/agent-runtime run test`, `npm --prefix apps/agent-runtime run typecheck`, `npm --prefix apps/agent-runtime run build`, `npm --prefix apps/agent-runtime run hardgate`

**Evidence Location:** `artifacts/code-gate/<timestamp>/report.json` plus fresh targeted test output captured in the terminal session for each task

**Rule:** Do not expand scope during implementation. New requests must be recorded through `CHANGE_REQUEST_TEMPLATE.md`.

---

## File Map

- Create: `apps/agent-runtime/src/domain/sop-skill.ts`
- Create: `apps/agent-runtime/src/infrastructure/persistence/sop-skill-store.ts`
- Create: `apps/agent-runtime/test/infrastructure/persistence/sop-skill-store.test.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/services/refine-skill-service.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/definitions/skill-reader-tool.ts`
- Modify: `apps/agent-runtime/src/application/compact/interactive-sop-compact.ts`
- Modify: `apps/agent-runtime/src/application/compact/interactive-sop-compact-prompts.ts`
- Modify: `apps/agent-runtime/src/application/compact/compact-runtime-support.ts`
- Modify: `apps/agent-runtime/src/domain/compact-reasoning.ts`
- Modify: `apps/agent-runtime/src/domain/agent-types.ts`
- Modify: `apps/agent-runtime/src/application/shell/command-router.ts`
- Modify: `apps/agent-runtime/src/application/shell/workflow-runtime.ts`
- Modify: `apps/agent-runtime/src/application/shell/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/src/index.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-workflow.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/src/application/refine/prompt-provider.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/refine-runtime-tool-registry.ts`
- Test: `apps/agent-runtime/test/application/compact/interactive-sop-compact.test.ts`
- Test: `apps/agent-runtime/test/runtime/command-router.test.ts`
- Test: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
- Test: `apps/agent-runtime/test/application/refine/prompt-provider.test.ts`
- Test: `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- Test: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`

## Tasks

### Task 1: Add A Durable SOP Skill File Model And Store

**Files:**
- Create: `apps/agent-runtime/src/domain/sop-skill.ts`
- Create: `apps/agent-runtime/src/infrastructure/persistence/sop-skill-store.ts`
- Test: `apps/agent-runtime/test/infrastructure/persistence/sop-skill-store.test.ts`

- [x] **Step 1: Write the failing store tests**

```ts
test("store discovers ~/.sasiki/skills/*/SKILL.md and returns frontmatter only", async () => {
  const list = await store.listMetadata();
  assert.deepEqual(list[0], {
    name: "tiktok-customer-service",
    description: "Check whether new customer chats need handling.",
  });
});

test("store reads a selected skill body and preserves markdown text", async () => {
  const skill = await store.readSkill("tiktok-customer-service");
  assert.match(skill.body, /## Goal/);
});
```

- [x] **Step 2: Run the focused test and confirm the red state**

Run: `npm --prefix apps/agent-runtime run test -- test/infrastructure/persistence/sop-skill-store.test.ts`
Expected: FAIL because `sop-skill-store.ts` and its domain types do not exist yet.

- [x] **Step 3: Implement the minimal domain and store**

```ts
export interface SopSkillMetadata {
  name: string;
  description: string;
}

export interface SopSkillDocument extends SopSkillMetadata {
  body: string;
  path: string;
}
```

Implementation notes:
- parse only top-of-file `--- ... ---` frontmatter
- require `name` and `description`
- scan `~/.sasiki/skills/<skill-name>/SKILL.md`
- return deterministic name ordering for `listMetadata()`
- fail explicitly when a referenced skill file is missing or invalid

- [x] **Step 4: Run the focused test and confirm the green state**

Run: `npm --prefix apps/agent-runtime run test -- test/infrastructure/persistence/sop-skill-store.test.ts`
Expected: PASS

- [x] **Step 5: Record the file contract in code comments or types where needed**

Capture:
- canonical storage root
- `SKILL.md` discovery rule
- required frontmatter fields

### Task 2: Rework SOP Compact To Persist `SKILL.md`

**Files:**
- Modify: `apps/agent-runtime/src/application/compact/interactive-sop-compact.ts`
- Modify: `apps/agent-runtime/src/application/compact/interactive-sop-compact-prompts.ts`
- Modify: `apps/agent-runtime/src/application/compact/compact-runtime-support.ts`
- Modify: `apps/agent-runtime/src/domain/compact-reasoning.ts`
- Test: `apps/agent-runtime/test/application/compact/interactive-sop-compact.test.ts`

- [x] **Step 1: Write the failing compact persistence test**

```ts
test("compact persists a named SKILL.md with frontmatter and markdown body", async () => {
  const result = await service.compact("run-123");
  const skill = await readFile(result.skillPath, "utf8");
  assert.match(skill, /^---\nname: /);
  assert.match(skill, /\ndescription: /);
  assert.match(skill, /\n---\n\n#/);
});
```

- [x] **Step 2: Run the focused compact test and confirm the red state**

Run: `npm --prefix apps/agent-runtime run test -- test/application/compact/interactive-sop-compact.test.ts`
Expected: FAIL because compact still writes `compact_capability_output.json` as the main durable output.

- [x] **Step 3: Change compact output from capability summary to skill document**

```ts
interface CompactSkillOutput {
  skillName: string;
  description: string;
  body: string;
}
```

Implementation notes:
- keep `--run-id <run_id>` as input provenance
- update compact prompts so the model writes:
  - one skill name
  - one short description
  - one markdown body
- persist `~/.sasiki/skills/<skill-name>/SKILL.md`
- preserve source observe run id inside frontmatter or nearby provenance fields
- allow transitional writing of `compact_capability_output.json` only if needed for compatibility, but make `SKILL.md` the main product truth

- [x] **Step 4: Re-run the focused compact test and confirm the green state**

Run: `npm --prefix apps/agent-runtime run test -- test/application/compact/interactive-sop-compact.test.ts`
Expected: PASS

- [x] **Step 5: Verify compact result shape stays explicit**

Check that the compact result returned to CLI now surfaces:
- selected skill name
- path to written `SKILL.md`
- source observe run provenance

### Task 3: Add CLI Discovery Through `sop-compact list`

**Files:**
- Modify: `apps/agent-runtime/src/domain/agent-types.ts`
- Modify: `apps/agent-runtime/src/application/shell/command-router.ts`
- Modify: `apps/agent-runtime/src/application/shell/workflow-runtime.ts`
- Modify: `apps/agent-runtime/src/application/shell/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/src/index.ts`
- Test: `apps/agent-runtime/test/runtime/command-router.test.ts`

- [x] **Step 1: Write the failing command-router test**

```ts
assert.deepEqual(parseCliArguments(["sop-compact", "list"]), {
  command: "sop-compact",
  action: "list",
  configPath: undefined,
});
```

- [x] **Step 2: Run the command-router test and confirm the red state**

Run: `npm --prefix apps/agent-runtime run test -- test/runtime/command-router.test.ts`
Expected: FAIL because `sop-compact` currently requires a run id and has no list action.

- [x] **Step 3: Implement list command plumbing**

```ts
type SopCompactCliArguments =
  | { command: "sop-compact"; action: "run"; runId: string; semanticMode?: RuntimeSemanticMode }
  | { command: "sop-compact"; action: "list" };
```

Implementation notes:
- keep `sop-compact --run-id <run_id>` behavior unchanged under `action: "run"`
- add `sop-compact list` as the minimal management interface
- inject the SOP skill store into shell composition
- return JSON with skill `name` and `description`
- update usage text in `index.ts`

- [x] **Step 4: Re-run the command-router test and confirm the green state**

Run: `npm --prefix apps/agent-runtime run test -- test/runtime/command-router.test.ts`
Expected: PASS

- [x] **Step 5: Run one end-to-end dry check for the list path**

Run: `node apps/agent-runtime/dist/index.js sop-compact list`
Expected: JSON array result shape after build completes later in the plan

### Task 4: Load SOP Frontmatter Into Refine Bootstrap

**Files:**
- Modify: `apps/agent-runtime/src/domain/agent-types.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-workflow.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/src/application/refine/prompt-provider.ts`
- Modify: `apps/agent-runtime/src/application/shell/workflow-runtime.ts`
- Modify: `apps/agent-runtime/src/application/shell/command-router.ts`
- Modify: `apps/agent-runtime/src/application/shell/runtime-composition-root.ts`
- Test: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
- Test: `apps/agent-runtime/test/application/refine/prompt-provider.test.ts`

- [x] **Step 1: Write the failing refine bootstrap tests**

```ts
assert.deepEqual(promptCalls[0].availableSkills, [
  { name: "tiktok-customer-service", description: "Check whether new customer chats need handling." },
]);
assert.equal(result.selectedSkillName, "tiktok-customer-service");
```

- [x] **Step 2: Run bootstrap and prompt tests to confirm the red state**

Run: `npm --prefix apps/agent-runtime run test -- test/runtime/refine-run-bootstrap-provider.test.ts test/application/refine/prompt-provider.test.ts`
Expected: FAIL because refine does not yet know about SOP skills or `--skill <name>`.

- [x] **Step 3: Thread skill metadata through the refine request and prompt**

```ts
interface AgentRunRequest {
  task: string;
  skillName?: string;
  resumeRunId?: string;
}
```

Implementation notes:
- add `--skill <name>` to `refine`
- load all skill frontmatter at bootstrap
- resolve the optional named skill explicitly and fail if missing
- extend the start prompt with:
  - available skill names and descriptions
  - explicitly requested skill name when present
- keep prompt-only and skill-only execution valid

- [x] **Step 4: Re-run bootstrap and prompt tests to confirm the green state**

Run: `npm --prefix apps/agent-runtime run test -- test/runtime/refine-run-bootstrap-provider.test.ts test/application/refine/prompt-provider.test.ts`
Expected: PASS

- [x] **Step 5: Keep startup loading lightweight**

Verify in code review:
- only frontmatter is loaded at bootstrap
- full body is not injected into the start prompt

### Task 5: Add The `skill.reader` Refine Tool

**Files:**
- Create: `apps/agent-runtime/src/application/refine/tools/services/refine-skill-service.ts`
- Create: `apps/agent-runtime/src/application/refine/tools/definitions/skill-reader-tool.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/refine-runtime-tool-registry.ts`
- Test: `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- Test: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`

- [x] **Step 1: Write the failing tool-surface tests**

```ts
assert.ok((await surface.listTools()).some((tool) => tool.name === "skill.reader"));
const result = await surface.callTool("skill.reader", { skillName: "tiktok-customer-service" });
assert.match(result.body, /## Goal/);
```

- [x] **Step 2: Run the refine tool tests and confirm the red state**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts`
Expected: FAIL because no skill-reading runtime tool exists yet.

- [x] **Step 3: Implement the skill-reading service and tool definition**

```ts
interface SkillReaderRequest {
  skillName: string;
}

interface SkillReaderResponse {
  name: string;
  description: string;
  body: string;
}
```

Implementation notes:
- back the service with the same SOP skill store from Task 1
- register the tool in the runtime tool registry
- make the tool fail explicitly when the skill does not exist
- keep the surface narrow: this is not a generic file reader

- [x] **Step 4: Re-run the refine tool tests and confirm the green state**

Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts`
Expected: PASS

- [x] **Step 5: Confirm the runtime tool count/order assertions still match the intended surface**

Update test snapshots or fixed counts only where the new tool is intentionally added.

### Task 6: Closeout Verification And Doc Sync

**Files:**
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`
- Modify: `docs/project/current-state.md`
- Modify: `docs/architecture/overview.md`

- [x] **Step 1: Run focused verification for each completed slice**

Run the targeted commands from Tasks 1-5 and keep the outputs available in the session.

- [x] **Step 2: Run full repository verification**

Run:
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`

Expected: all commands PASS

- [x] **Step 3: Record fresh evidence paths**

Capture:
- fresh hardgate report path under `artifacts/code-gate/<timestamp>/report.json`
- any relevant targeted verification notes

- [x] **Step 4: Update front-door project docs**

Document:
- new user-level SOP skill storage root
- `sop-compact list` management surface
- refine default frontmatter loading and `skill.reader`
- any active follow-up that remains deferred

- [x] **Step 5: Update `NEXT_STEP.md` to one direct pointer**

Set the next P0 to the highest-value follow-up left after the implementation lands.

## Completion Checklist

- [x] Spec requirements are covered
- [x] Verification commands were run fresh
- [x] Evidence location is populated or explicitly noted
- [x] Repository state docs are updated

## Closeout Notes

- Fresh full-repo verification passed after the final doc sync: `npm --prefix apps/agent-runtime run lint`, `test`, `typecheck`, `build`, and `hardgate`.
- Fresh hardgate evidence for this slice: `artifacts/code-gate/2026-03-27T04-49-22-654Z/report.json`.
- Built CLI dry check `node apps/agent-runtime/dist/index.js sop-compact list` returned `[]` in the empty local skill-store state.
- Strict reviewer recheck under `harness:refactor` reported no current findings after the final `skill.reader` conditioning fixes.
- `harness:lint-test-design` proof for the new seam lives in the updated structural and focused coverage, especially `test/application/layer-boundaries.test.ts`, `test/application/compact/interactive-sop-compact.test.ts`, `test/application/refine/refine-tool-surface.test.ts`, and `test/runtime/refine-run-bootstrap-provider.test.ts`.
