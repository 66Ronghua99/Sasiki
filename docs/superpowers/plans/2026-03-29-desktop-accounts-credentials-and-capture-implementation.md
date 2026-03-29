---
doc_type: plan
status: planned
implements:
  - docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md
supersedes: []
related:
  - apps/desktop/main/ipc/register-accounts-ipc.ts
  - apps/desktop/shared/site-accounts.ts
---

# Desktop Accounts, Credentials, And Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec Path:** `docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md`

**Goal:** Implement the main-process account system for site accounts, credential bundles, runtime profile allocation, embedded login capture, file import, and browser-extension cookie capture.

**Architecture:** Keep account and credential truth in Electron main using local stores under `~/.sasiki`, and treat the renderer as a thin client. Use a small site registry for login/capture metadata, keep runtime profile allocation internal, and accept browser-extension captures through a narrow localhost bridge that writes the same credential-bundle format as embedded login and file import.

**Tech Stack:** Electron main process, Node fs/http APIs, Chromium extension APIs, TypeScript, Vitest

---

**Suggested Worktree:** branch `codex/desktop-accounts`

**Allowed Write Scope:** `apps/desktop/main/accounts/**`, `apps/desktop/main/browser/**`, `apps/desktop/main/ipc/register-accounts-ipc.ts`, `apps/desktop/browser-extension/**`, `apps/desktop/test/main/accounts/**`

**Verification Commands:** `npm --prefix apps/desktop run test -- test/main/accounts/site-account-store.test.ts`, `npm --prefix apps/desktop run test -- test/main/accounts/embedded-login-service.test.ts`, `npm --prefix apps/desktop run test -- test/main/accounts/extension-capture-server.test.ts`, `npm --prefix apps/desktop run test`, `npm --prefix apps/desktop run typecheck`

**Evidence Location:** targeted desktop account tests plus successful local extension build output inside `apps/desktop/browser-extension/dist/`

---

## File Map

- Create: `apps/desktop/main/accounts/site-account-store.ts`
- Create: `apps/desktop/main/accounts/credential-bundle-store.ts`
- Create: `apps/desktop/main/accounts/runtime-profile-manager.ts`
- Create: `apps/desktop/main/accounts/site-registry.ts`
- Create: `apps/desktop/main/accounts/embedded-login-service.ts`
- Create: `apps/desktop/main/accounts/cookie-import-service.ts`
- Create: `apps/desktop/main/accounts/login-verifier.ts`
- Create: `apps/desktop/main/browser/extension-capture-server.ts`
- Modify: `apps/desktop/main/ipc/register-accounts-ipc.ts`
- Create: `apps/desktop/browser-extension/manifest.json`
- Create: `apps/desktop/browser-extension/src/service-worker.ts`
- Create: `apps/desktop/browser-extension/src/popup.html`
- Create: `apps/desktop/browser-extension/src/popup.ts`
- Create: `apps/desktop/test/main/accounts/site-account-store.test.ts`
- Create: `apps/desktop/test/main/accounts/embedded-login-service.test.ts`
- Create: `apps/desktop/test/main/accounts/extension-capture-server.test.ts`

## Tasks

### Task 1: Add Site Account, Credential Bundle, And Runtime Profile Stores

**Files:**
- Create: `apps/desktop/main/accounts/site-account-store.ts`
- Create: `apps/desktop/main/accounts/credential-bundle-store.ts`
- Create: `apps/desktop/main/accounts/runtime-profile-manager.ts`
- Create: `apps/desktop/main/accounts/site-registry.ts`
- Test: `apps/desktop/test/main/accounts/site-account-store.test.ts`

- [ ] **Step 1: Write the failing account-store test**

```ts
test("site account store persists multiple accounts under one site", async () => {
  await store.upsert({ id: "acct-1", site: "tiktok-shop", label: "Shop A" });
  await store.upsert({ id: "acct-2", site: "tiktok-shop", label: "Shop B" });
  const accounts = await store.list();
  assert.deepEqual(accounts.map((account) => account.label), ["Shop A", "Shop B"]);
});
```

- [ ] **Step 2: Run the focused account-store test and confirm the red state**

Run: `npm --prefix apps/desktop run test -- test/main/accounts/site-account-store.test.ts`
Expected: FAIL because the account store modules do not exist yet

- [ ] **Step 3: Implement the stores and profile allocator**

```ts
export interface SiteAccountRecord {
  id: string;
  site: string;
  label: string;
  activeCredentialId?: string;
  defaultRuntimeProfileId?: string;
}

export class RuntimeProfileManager {
  async allocate(input: { siteAccountId: string; allowParallel: boolean }): Promise<RuntimeProfileLease> {
    return input.allowParallel ? this.createIsolatedLease(input.siteAccountId) : this.reuseDefaultLease(input.siteAccountId);
  }
}
```

Implementation notes:
- persist under `~/.sasiki/accounts/`, `~/.sasiki/cookies/`, and `~/.sasiki/profiles/`
- keep one active credential bundle per site account
- do not expose runtime profile selection to the renderer

- [ ] **Step 4: Re-run the focused account-store test and confirm the green state**

Run: `npm --prefix apps/desktop run test -- test/main/accounts/site-account-store.test.ts`
Expected: PASS

### Task 2: Implement Embedded Login, File Import, And Login Verification

**Files:**
- Create: `apps/desktop/main/accounts/embedded-login-service.ts`
- Create: `apps/desktop/main/accounts/cookie-import-service.ts`
- Create: `apps/desktop/main/accounts/login-verifier.ts`
- Modify: `apps/desktop/main/ipc/register-accounts-ipc.ts`
- Test: `apps/desktop/test/main/accounts/embedded-login-service.test.ts`

- [ ] **Step 1: Write the failing embedded-login test**

```ts
test("embedded login saves cookies back into the selected site account", async () => {
  const result = await service.completeLogin({ siteAccountId: "acct-1" }, fakeWindowSession);
  assert.equal(result.siteAccountId, "acct-1");
  assert.equal(result.credentialSource, "embedded-login");
  assert.equal(await credentialStore.getActiveForAccount("acct-1")?.source, "embedded-login");
});
```

- [ ] **Step 2: Run the focused embedded-login test and confirm the red state**

Run: `npm --prefix apps/desktop run test -- test/main/accounts/embedded-login-service.test.ts`
Expected: FAIL because the embedded login service does not exist yet

- [ ] **Step 3: Implement the main-process account actions**

```ts
export class EmbeddedLoginService {
  async completeLogin(input: { siteAccountId: string }, session: Session): Promise<CredentialCaptureResult> {
    const cookies = await session.cookies.get({});
    return this.credentials.save({
      siteAccountId: input.siteAccountId,
      source: "embedded-login",
      cookies,
    });
  }
}
```

Implementation notes:
- `register-accounts-ipc.ts` should expose `listAccounts`, `upsertAccount`, `launchEmbeddedLogin`, `importCookieFile`, and `verifyAccountCredential`
- verification should use the site registry to choose a lightweight check URL and should return explicit success/failure metadata instead of silently succeeding
- file import must normalize imported JSON into the same credential-bundle shape used by embedded login

- [ ] **Step 4: Re-run the focused embedded-login test and confirm the green state**

Run: `npm --prefix apps/desktop run test -- test/main/accounts/embedded-login-service.test.ts`
Expected: PASS

### Task 3: Add Browser-Extension Capture And Desktop Ingress

**Files:**
- Create: `apps/desktop/main/browser/extension-capture-server.ts`
- Create: `apps/desktop/browser-extension/manifest.json`
- Create: `apps/desktop/browser-extension/src/service-worker.ts`
- Create: `apps/desktop/browser-extension/src/popup.html`
- Create: `apps/desktop/browser-extension/src/popup.ts`
- Modify: `apps/desktop/main/ipc/register-accounts-ipc.ts`
- Test: `apps/desktop/test/main/accounts/extension-capture-server.test.ts`

- [ ] **Step 1: Write the failing extension-capture test**

```ts
test("extension capture server persists a browser-plugin credential bundle", async () => {
  await server.handleCapture({
    site: "tiktok-shop",
    cookies: [{ name: "sessionid", value: "abc" }],
    accountId: "acct-1",
  });
  assert.equal(await credentialStore.getActiveForAccount("acct-1")?.source, "browser-plugin");
});
```

- [ ] **Step 2: Run the focused extension-capture test and confirm the red state**

Run: `npm --prefix apps/desktop run test -- test/main/accounts/extension-capture-server.test.ts`
Expected: FAIL because the extension ingress server does not exist yet

- [ ] **Step 3: Implement the localhost ingress and extension payload sender**

```ts
const cookies = await chrome.cookies.getAll({ domain: targetDomain });
await fetch("http://127.0.0.1:55173/extension/capture", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ site, cookies, accountId }),
});
```

Implementation notes:
- the extension should do only one-click cookie capture
- the desktop ingress must validate payload size and required fields before persisting
- if no `accountId` is supplied, write a pending capture record that the Accounts view can confirm later

- [ ] **Step 4: Re-run the focused extension-capture test and confirm the green state**

Run: `npm --prefix apps/desktop run test -- test/main/accounts/extension-capture-server.test.ts`
Expected: PASS

