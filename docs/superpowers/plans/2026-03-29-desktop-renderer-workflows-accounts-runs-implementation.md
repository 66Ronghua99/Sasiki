---
doc_type: plan
status: planned
implements:
  - docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md
supersedes: []
related:
  - apps/desktop/preload/index.ts
  - apps/desktop/renderer/src/App.tsx
---

# Desktop Renderer Workflows, Accounts, And Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec Path:** `docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md`

**Goal:** Build the renderer UI for the `Workflows`, `Accounts`, and `Runs` areas and connect it to the preload API without leaking filesystem or workflow logic into renderer code.

**Architecture:** Treat the renderer as a typed client of the preload bridge. Keep page-level state in renderer-only hooks/stores, keep all privileged actions behind `window.sasiki`, and build three focused views that match the spec's workflow/account/run semantics instead of mirroring internal runtime-profile details.

**Tech Stack:** React, TypeScript, Testing Library, Vitest, preload bridge

---

**Suggested Worktree:** branch `codex/desktop-renderer`

**Allowed Write Scope:** `apps/desktop/preload/index.ts`, `apps/desktop/renderer/**`, `apps/desktop/test/renderer/**`

**Verification Commands:** `npm --prefix apps/desktop run test -- test/renderer/accounts-page.test.tsx`, `npm --prefix apps/desktop run test -- test/renderer/workflows-page.test.tsx`, `npm --prefix apps/desktop run test -- test/renderer/runs-page.test.tsx`, `npm --prefix apps/desktop run test`, `npm --prefix apps/desktop run typecheck`, `npm --prefix apps/desktop run build`

**Evidence Location:** renderer-focused test output plus a successful desktop build

---

## File Map

- Modify: `apps/desktop/preload/index.ts`
- Modify: `apps/desktop/renderer/src/App.tsx`
- Create: `apps/desktop/renderer/src/lib/desktop-client.ts`
- Create: `apps/desktop/renderer/src/lib/use-run-subscription.ts`
- Modify: `apps/desktop/renderer/src/routes/AccountsPage.tsx`
- Modify: `apps/desktop/renderer/src/routes/WorkflowsPage.tsx`
- Modify: `apps/desktop/renderer/src/routes/RunsPage.tsx`
- Create: `apps/desktop/renderer/src/components/accounts/account-list.tsx`
- Create: `apps/desktop/renderer/src/components/workflows/observe-form.tsx`
- Create: `apps/desktop/renderer/src/components/workflows/compact-form.tsx`
- Create: `apps/desktop/renderer/src/components/workflows/refine-form.tsx`
- Create: `apps/desktop/renderer/src/components/runs/run-log-panel.tsx`
- Create: `apps/desktop/test/renderer/accounts-page.test.tsx`
- Create: `apps/desktop/test/renderer/workflows-page.test.tsx`
- Create: `apps/desktop/test/renderer/runs-page.test.tsx`

## Tasks

### Task 1: Finalize The Preload Bridge And Renderer Client

**Files:**
- Modify: `apps/desktop/preload/index.ts`
- Create: `apps/desktop/renderer/src/lib/desktop-client.ts`

- [ ] **Step 1: Write the failing renderer-client smoke test**

```tsx
test("renderer client calls window.sasiki instead of importing ipc directly", async () => {
  const client = createDesktopClient(windowStub);
  await client.accounts.list();
  assert.equal(windowStub.sasiki.accounts.listCalls, 1);
});
```

- [ ] **Step 2: Run the focused renderer test and confirm the red state**

Run: `npm --prefix apps/desktop run test -- test/renderer/accounts-page.test.tsx`
Expected: FAIL because the renderer client wrapper does not exist yet

- [ ] **Step 3: Implement the typed preload and client wrapper**

```ts
export function createDesktopClient(api: SasikiDesktopApi = window.sasiki): SasikiDesktopApi {
  return api;
}
```

Implementation notes:
- keep renderer imports pointed at `desktop-client.ts`, not directly at `window`
- `preload/index.ts` should preserve the stable namespace shape from Lane A and fill in the actual `ipcRenderer.invoke` / event-subscription logic

- [ ] **Step 4: Re-run the focused renderer test and confirm the green state**

Run: `npm --prefix apps/desktop run test -- test/renderer/accounts-page.test.tsx`
Expected: PASS

### Task 2: Build The Accounts View

**Files:**
- Modify: `apps/desktop/renderer/src/routes/AccountsPage.tsx`
- Create: `apps/desktop/renderer/src/components/accounts/account-list.tsx`
- Create: `apps/desktop/test/renderer/accounts-page.test.tsx`

- [ ] **Step 1: Write the failing Accounts page test**

```tsx
test("accounts page lists site accounts and exposes login/import/verify actions", async () => {
  render(<AccountsPage />);
  expect(await screen.findByText("TikTok / Shop A")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Login In Sasiki" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Import Cookie File" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Verify Login State" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused Accounts page test and confirm the red state**

Run: `npm --prefix apps/desktop run test -- test/renderer/accounts-page.test.tsx`
Expected: FAIL because the Accounts page is still a placeholder

- [ ] **Step 3: Implement the Accounts view and actions**

```tsx
export function AccountsPage(): JSX.Element {
  const { accounts, refresh } = useAccountsQuery();
  return (
    <section>
      <h1>Accounts</h1>
      <AccountList accounts={accounts} />
      <button onClick={() => desktop.accounts.launchEmbeddedLogin({ siteAccountId: selectedId })}>Login In Sasiki</button>
    </section>
  );
}
```

Implementation notes:
- surface `site account` as the main object
- show credential freshness, last verification, and running-task hints
- do not expose runtime-profile IDs in the normal page UI

- [ ] **Step 4: Re-run the focused Accounts page test and confirm the green state**

Run: `npm --prefix apps/desktop run test -- test/renderer/accounts-page.test.tsx`
Expected: PASS

### Task 3: Build The Workflows And Runs Views

**Files:**
- Modify: `apps/desktop/renderer/src/routes/WorkflowsPage.tsx`
- Modify: `apps/desktop/renderer/src/routes/RunsPage.tsx`
- Create: `apps/desktop/renderer/src/components/workflows/observe-form.tsx`
- Create: `apps/desktop/renderer/src/components/workflows/compact-form.tsx`
- Create: `apps/desktop/renderer/src/components/workflows/refine-form.tsx`
- Create: `apps/desktop/renderer/src/components/runs/run-log-panel.tsx`
- Create: `apps/desktop/renderer/src/lib/use-run-subscription.ts`
- Create: `apps/desktop/test/renderer/workflows-page.test.tsx`
- Create: `apps/desktop/test/renderer/runs-page.test.tsx`

- [ ] **Step 1: Write the failing Workflows page test**

```tsx
test("workflows page exposes observe, sop-compact, and refine forms with the correct fields", async () => {
  render(<WorkflowsPage />);
  expect(screen.getByLabelText("Observe Task")).toBeInTheDocument();
  expect(screen.getByLabelText("Source Observe Run")).toBeInTheDocument();
  expect(screen.getByLabelText("Refine Task")).toBeInTheDocument();
  expect(screen.queryByLabelText("Site")).toBeNull();
});
```

- [ ] **Step 2: Run the focused Workflows page test and confirm the red state**

Run: `npm --prefix apps/desktop run test -- test/renderer/workflows-page.test.tsx`
Expected: FAIL because the Workflows page is still a placeholder

- [ ] **Step 3: Implement the workflow forms**

```tsx
<ObserveForm onSubmit={(task, siteAccountId) => desktop.runs.startObserve({ task, siteAccountId })} />
<CompactForm onSubmit={(sourceRunId, semanticMode) => desktop.runs.startCompact({ sourceRunId, semanticMode })} />
<RefineForm onSubmit={(task, siteAccountId, skillName, resumeRunId) =>
  desktop.runs.startRefine({ task, siteAccountId, skillName, resumeRunId })
} />
```

Implementation notes:
- `observe` uses task + optional site account only
- `sop-compact` uses source observe run, with semantic mode hidden in an advanced section
- `refine` uses task or resume run plus optional site account and skill

- [ ] **Step 4: Write and run the failing Runs page test**

```tsx
test("runs page renders live status, logs, and artifact actions", async () => {
  render(<RunsPage />);
  expect(await screen.findByText("running")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Artifacts" })).toBeInTheDocument();
});
```

Run: `npm --prefix apps/desktop run test -- test/renderer/runs-page.test.tsx`
Expected: FAIL until the run subscription hook and log panel are implemented

- [ ] **Step 5: Implement the Runs page and subscription hook, then run full desktop checks**

```ts
export function useRunSubscription(runId: string): DesktopRunEvent[] {
  useEffect(() => desktop.runs.subscribe(runId, pushEvent), [runId]);
  return events;
}
```

Run: `npm --prefix apps/desktop run test && npm --prefix apps/desktop run typecheck && npm --prefix apps/desktop run build`
Expected: PASS

