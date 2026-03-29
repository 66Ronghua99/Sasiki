---
doc_type: plan
status: planned
implements:
  - docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md
supersedes: []
related:
  - PROGRESS.md
  - NEXT_STEP.md
  - MEMORY.md
  - docs/project/current-state.md
  - docs/architecture/overview.md
---

# Desktop Integration And Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec Path:** `docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md`

**Goal:** Merge the completed desktop lanes, close integration gaps, add missing smoke coverage, run repo quality gates, and sync front-door docs/evidence before any completion claim.

**Architecture:** This lane is the only place where cross-lane drift should be corrected. It should keep `apps/agent-runtime` as the workflow owner, keep Electron main as the desktop orchestration owner, and avoid backsliding into renderer-owned privilege or duplicated workflow logic.

**Tech Stack:** Electron, TypeScript, Vitest, existing repo quality gates, project front-door docs

---

**Suggested Worktree:** branch `codex/desktop-integration`

**Allowed Write Scope:** `apps/agent-runtime/**`, `apps/desktop/**`, `apps/desktop/README.md`, `README.md`, `PROGRESS.md`, `NEXT_STEP.md`, `MEMORY.md`, `docs/project/current-state.md`, `docs/architecture/overview.md`, `docs/superpowers/plans/*.md`

**Verification Commands:** `npm --prefix apps/desktop run lint`, `npm --prefix apps/desktop run test`, `npm --prefix apps/desktop run typecheck`, `npm --prefix apps/desktop run build`, `npm --prefix apps/agent-runtime run lint`, `npm --prefix apps/agent-runtime run test`, `npm --prefix apps/agent-runtime run typecheck`, `npm --prefix apps/agent-runtime run build`, `npm --prefix apps/agent-runtime run hardgate`

**Evidence Location:** fresh desktop terminal output, fresh `apps/agent-runtime` gate output, and updated project-state docs referencing the new desktop lane

---

## File Map

- Modify: cross-lane fixups across `apps/agent-runtime/**` and `apps/desktop/**`
- Create: `apps/desktop/README.md`
- Create: `apps/desktop/test/integration/desktop-launch-smoke.test.ts`
- Modify: `README.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`
- Modify: `docs/project/current-state.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/superpowers/plans/2026-03-29-electron-desktop-ui-v1-program-plan.md`
- Modify: `docs/superpowers/plans/2026-03-29-desktop-foundation-and-shell-implementation.md`
- Modify: `docs/superpowers/plans/2026-03-29-desktop-runtime-facade-and-run-orchestration-implementation.md`
- Modify: `docs/superpowers/plans/2026-03-29-desktop-accounts-credentials-and-capture-implementation.md`
- Modify: `docs/superpowers/plans/2026-03-29-desktop-renderer-workflows-accounts-runs-implementation.md`
- Modify: `docs/superpowers/plans/2026-03-29-desktop-integration-and-hardening-implementation.md`

## Tasks

### Task 1: Merge Lane Outputs And Close Contract Drift

**Files:**
- Modify: `apps/agent-runtime/**`
- Modify: `apps/desktop/**`

- [ ] **Step 1: Run a red-state integration smoke test before fixing drift**

```ts
test("desktop main boots and renderer can request the workflow list without crashing", async () => {
  const app = await launchDesktopAppForTest();
  const result = await app.renderer.invoke("skills.list");
  expect(Array.isArray(result)).toBe(true);
});
```

Run: `npm --prefix apps/desktop run test -- test/integration/desktop-launch-smoke.test.ts`
Expected: FAIL with missing IPC wiring, import drift, or contract mismatches after the lane merges

- [ ] **Step 2: Fix merged contract drift in one place**

```ts
assertDesktopApiContract(window.sasiki, {
  accounts: ["list", "upsert", "launchEmbeddedLogin", "importCookieFile", "verifyCredential"],
  runs: ["startObserve", "startCompact", "startRefine", "interruptRun", "listRuns", "subscribe"],
});
```

Implementation notes:
- correct DTO mismatches here instead of reopening completed lane scopes
- keep fixes narrow; do not redesign forms, stores, or runtime service contracts in this lane

- [ ] **Step 3: Re-run the integration smoke test and confirm the green state**

Run: `npm --prefix apps/desktop run test -- test/integration/desktop-launch-smoke.test.ts`
Expected: PASS

### Task 2: Add User-Facing Docs And Sync Front-Door Project State

**Files:**
- Create: `apps/desktop/README.md`
- Modify: `README.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`
- Modify: `docs/project/current-state.md`
- Modify: `docs/architecture/overview.md`

- [ ] **Step 1: Add a package-level desktop README**

```md
# Desktop App

This package hosts the Electron front door for Sasiki.

- `main/`: desktop orchestration owner
- `preload/`: safe renderer bridge
- `renderer/`: UI
- `shared/`: desktop DTOs and IPC contracts
```

- [ ] **Step 2: Update repo front-door docs with the new desktop truth**

Include:
- new `apps/desktop` entry in `README.md`
- desktop package and ownership truth in `docs/architecture/overview.md`
- active desktop UI program status in `PROGRESS.md`
- one new direct execution pointer in `NEXT_STEP.md`
- stable desktop lessons in `MEMORY.md` only if they are already durable

- [ ] **Step 3: Re-read the updated docs and confirm they match the code**

Run: `sed -n '1,220p' README.md && sed -n '1,220p' apps/desktop/README.md`
Expected: docs reflect the new dual-front-door shape (`apps/agent-runtime` + `apps/desktop`) without contradicting ownership boundaries

### Task 3: Run Final Quality Gates And Mark Plan Status

**Files:**
- Modify: `docs/superpowers/plans/2026-03-29-electron-desktop-ui-v1-program-plan.md`
- Modify: `docs/superpowers/plans/2026-03-29-desktop-foundation-and-shell-implementation.md`
- Modify: `docs/superpowers/plans/2026-03-29-desktop-runtime-facade-and-run-orchestration-implementation.md`
- Modify: `docs/superpowers/plans/2026-03-29-desktop-accounts-credentials-and-capture-implementation.md`
- Modify: `docs/superpowers/plans/2026-03-29-desktop-renderer-workflows-accounts-runs-implementation.md`
- Modify: `docs/superpowers/plans/2026-03-29-desktop-integration-and-hardening-implementation.md`

- [ ] **Step 1: Run desktop quality gates**

Run: `npm --prefix apps/desktop run lint && npm --prefix apps/desktop run test && npm --prefix apps/desktop run typecheck && npm --prefix apps/desktop run build`
Expected: PASS

- [ ] **Step 2: Run agent-runtime quality gates**

Run: `npm --prefix apps/agent-runtime run lint && npm --prefix apps/agent-runtime run test && npm --prefix apps/agent-runtime run typecheck && npm --prefix apps/agent-runtime run build && npm --prefix apps/agent-runtime run hardgate`
Expected: PASS

- [ ] **Step 3: Update plan statuses and capture the remaining next step**

Set:
- completed lanes to `status: completed`
- this integration plan to `status: completed` only after all commands above pass

Record in `NEXT_STEP.md`:
- one explicit next direct follow-up such as `Start Windows compatibility design` or `Start user-browser observe attachment design`; do not leave a vague `continue UI work`
