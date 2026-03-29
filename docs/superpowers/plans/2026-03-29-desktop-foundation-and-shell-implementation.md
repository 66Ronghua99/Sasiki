---
doc_type: plan
status: completed
implements:
  - docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md
supersedes: []
related:
  - apps/desktop/
  - docs/superpowers/plans/2026-03-29-electron-desktop-ui-v1-program-plan.md
---

# Desktop Foundation And Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Spec Path:** `docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md`

**Goal:** Create the `apps/desktop` Electron package, its build/test shell, and the frozen shared desktop contracts that let later lanes implement runtime, accounts, and renderer work in parallel.

**Architecture:** Add a standalone Electron app package without disturbing the current `apps/agent-runtime` CLI package shape. Freeze the desktop package layout (`main`, `preload`, `renderer`, `shared`) and expose skeletal IPC registration points so later worktrees can fill account and run logic without editing the same bootstrap files.

**Tech Stack:** Electron, electron-vite, React, TypeScript, Vitest

---

**Suggested Worktree:** branch `codex/desktop-foundation`

**Allowed Write Scope:** `apps/desktop/**`

**Verification Commands:** `npm --prefix apps/desktop install`, `npm --prefix apps/desktop run test -- test/shared/ipc-contracts.test.ts`, `npm --prefix apps/desktop run test`, `npm --prefix apps/desktop run typecheck`, `npm --prefix apps/desktop run build`

**Evidence Location:** focused `apps/desktop` terminal output plus successful build artifacts under `apps/desktop/out/` or `apps/desktop/dist/`

---

## File Map

- Create: `apps/desktop/package.json`
- Create: `apps/desktop/electron.vite.config.ts`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/tsconfig.node.json`
- Create: `apps/desktop/tsconfig.renderer.json`
- Create: `apps/desktop/vitest.config.ts`
- Create: `apps/desktop/main/index.ts`
- Create: `apps/desktop/main/register-ipc.ts`
- Create: `apps/desktop/main/ipc/register-runs-ipc.ts`
- Create: `apps/desktop/main/ipc/register-accounts-ipc.ts`
- Create: `apps/desktop/preload/index.ts`
- Create: `apps/desktop/renderer/index.html`
- Create: `apps/desktop/renderer/src/main.tsx`
- Create: `apps/desktop/renderer/src/App.tsx`
- Create: `apps/desktop/renderer/src/routes/WorkflowsPage.tsx`
- Create: `apps/desktop/renderer/src/routes/AccountsPage.tsx`
- Create: `apps/desktop/renderer/src/routes/RunsPage.tsx`
- Create: `apps/desktop/shared/ipc/contracts.ts`
- Create: `apps/desktop/shared/ipc/channels.ts`
- Create: `apps/desktop/shared/ipc/messages.ts`
- Create: `apps/desktop/shared/site-accounts.ts`
- Create: `apps/desktop/shared/runs.ts`
- Create: `apps/desktop/test/shared/ipc-contracts.test.ts`

## Tasks

### Task 1: Scaffold The Desktop Package And Tooling

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/electron.vite.config.ts`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/tsconfig.node.json`
- Create: `apps/desktop/tsconfig.renderer.json`
- Create: `apps/desktop/vitest.config.ts`

- [x] **Step 1: Confirm the red state before the package exists**

Run: `npm --prefix apps/desktop run build`
Expected: FAIL because `apps/desktop/package.json` does not exist yet

- [x] **Step 2: Add the desktop package manifest and toolchain config**

```json
{
  "name": "@sasiki/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "lint": "npm run typecheck && npm run test"
  }
}
```

Implementation notes:
- use `electron-vite` so main/preload/renderer build together under one package
- keep separate tsconfig files for node-facing and renderer-facing code
- do not add root workspace tooling in this lane

- [x] **Step 3: Install dependencies and confirm the package can resolve**

Run: `npm --prefix apps/desktop install`
Expected: PASS with a lockfile and installed desktop dependencies

- [x] **Step 4: Run the initial desktop build**

Run: `npm --prefix apps/desktop run build`
Expected: FAIL or stay red until the next task creates actual source files

### Task 2: Freeze Shared Desktop Contracts And Bootstrap Files

**Files:**
- Create: `apps/desktop/main/index.ts`
- Create: `apps/desktop/main/register-ipc.ts`
- Create: `apps/desktop/main/ipc/register-runs-ipc.ts`
- Create: `apps/desktop/main/ipc/register-accounts-ipc.ts`
- Create: `apps/desktop/preload/index.ts`
- Create: `apps/desktop/shared/ipc/contracts.ts`
- Create: `apps/desktop/shared/site-accounts.ts`
- Create: `apps/desktop/shared/runs.ts`
- Test: `apps/desktop/test/shared/ipc-contracts.test.ts`

- [x] **Step 1: Write the failing shared-contract test**

```ts
test("desktop foundation freezes the full api and transport contract surface", () => {
  const api = createDesktopApiShape();
  assert.deepEqual(Object.keys(api.accounts), ["list", "upsert", "launchEmbeddedLogin", "importCookieFile", "verifyCredential"]);
  assert.deepEqual(Object.keys(api.runs), ["startObserve", "startCompact", "startRefine", "interruptRun", "listRuns", "subscribe"]);
  assert.equal(desktopChannels.runs.startObserve, "runs:startObserve");
  assert.equal(desktopChannels.accounts.verifyCredential, "accounts:verifyCredential");
  assert.equal(desktopRunEventKinds.includes("run.finished"), true);
});
```

- [x] **Step 2: Run the focused contract test and confirm the red state**

Run: `npm --prefix apps/desktop run test -- test/shared/ipc-contracts.test.ts`
Expected: FAIL because the shared contract module does not exist yet

- [x] **Step 3: Create the shared DTOs and skeletal IPC registration points**

```ts
export interface SasikiDesktopApi {
  accounts: {
    list(): Promise<SiteAccountSummary[]>;
    upsert(input: UpsertSiteAccountInput): Promise<SiteAccountSummary>;
    launchEmbeddedLogin(input: { siteAccountId: string }): Promise<void>;
    importCookieFile(input: ImportCookieFileInput): Promise<CredentialCaptureResult>;
    verifyCredential(input: { siteAccountId: string }): Promise<CredentialVerificationResult>;
  };
  runs: {
    startObserve(input: ObserveRunInput): Promise<{ runId: string }>;
    startCompact(input: CompactRunInput): Promise<{ runId: string }>;
    startRefine(input: RefineRunInput): Promise<{ runId: string }>;
    interruptRun(runId: string): Promise<{ interrupted: boolean }>;
    listRuns(): Promise<DesktopRunSummary[]>;
    subscribe(runId: string, callback: (event: DesktopRunEvent) => void): () => void;
  };
  artifacts: {
    openRunArtifacts(runId: string): Promise<void>;
  };
  skills: {
    list(): Promise<SopSkillSummary[]>;
  };
}

export const desktopChannels = {
  accounts: {
    list: "accounts:list",
    upsert: "accounts:upsert",
    launchEmbeddedLogin: "accounts:launchEmbeddedLogin",
    importCookieFile: "accounts:importCookieFile",
    verifyCredential: "accounts:verifyCredential",
  },
  runs: {
    startObserve: "runs:startObserve",
    startCompact: "runs:startCompact",
    startRefine: "runs:startRefine",
    interruptRun: "runs:interruptRun",
    listRuns: "runs:listRuns",
    subscribe: "runs:subscribe",
  },
} as const;
```

Implementation notes:
- `register-runs-ipc.ts` and `register-accounts-ipc.ts` should be pure registration adapters that accept injected handler objects even if they only install placeholder handlers in this lane
- freeze DTO names, channel ids, request/response payloads, and the `DesktopRunEvent` discriminated union here so later lanes do not invent their own account/run payload shapes
- do not put business logic in these bootstrap files

- [x] **Step 4: Re-run the focused contract test and confirm the green state**

Run: `npm --prefix apps/desktop run test -- test/shared/ipc-contracts.test.ts`
Expected: PASS

### Task 3: Add A Minimal Main/Preload/Renderer Shell

**Files:**
- Create: `apps/desktop/renderer/index.html`
- Create: `apps/desktop/renderer/src/main.tsx`
- Create: `apps/desktop/renderer/src/App.tsx`
- Create: `apps/desktop/renderer/src/routes/WorkflowsPage.tsx`
- Create: `apps/desktop/renderer/src/routes/AccountsPage.tsx`
- Create: `apps/desktop/renderer/src/routes/RunsPage.tsx`
- Modify: `apps/desktop/main/index.ts`
- Modify: `apps/desktop/preload/index.ts`

- [x] **Step 1: Add the minimal Electron window bootstrap**

```ts
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  registerDesktopIpc({ ipcMain, app });
  await window.loadURL(process.env.ELECTRON_RENDERER_URL ?? `file://${join(__dirname, "../renderer/index.html")}`);
});
```

- [x] **Step 2: Add a renderer shell with three placeholder pages**

```tsx
export function App(): JSX.Element {
  const [route, setRoute] = useState<"workflows" | "accounts" | "runs">("workflows");
  return (
    <main>
      <nav>
        <button onClick={() => setRoute("workflows")}>Workflows</button>
        <button onClick={() => setRoute("accounts")}>Accounts</button>
        <button onClick={() => setRoute("runs")}>Runs</button>
      </nav>
      {route === "workflows" ? <WorkflowsPage /> : null}
      {route === "accounts" ? <AccountsPage /> : null}
      {route === "runs" ? <RunsPage /> : null}
    </main>
  );
}
```

- [x] **Step 3: Expose the typed API shell through preload**

```ts
contextBridge.exposeInMainWorld("sasiki", desktopApi);
```

Implementation notes:
- the preload layer may throw `not implemented` for commands that later lanes will wire up, but the namespace shape must be stable
- keep view components intentionally skeletal; real workflow/account/run behavior belongs to later plans

- [x] **Step 4: Run the full desktop package checks**

Run: `npm --prefix apps/desktop run test && npm --prefix apps/desktop run typecheck && npm --prefix apps/desktop run build`
Expected: PASS
