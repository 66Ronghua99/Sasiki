---
doc_type: plan
status: active
implements:
  - docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md
supersedes: []
related:
  - docs/superpowers/plans/2026-03-29-desktop-foundation-and-shell-implementation.md
  - docs/superpowers/plans/2026-03-29-desktop-runtime-facade-and-run-orchestration-implementation.md
  - docs/superpowers/plans/2026-03-29-desktop-accounts-credentials-and-capture-implementation.md
  - docs/superpowers/plans/2026-03-29-desktop-renderer-workflows-accounts-runs-implementation.md
  - docs/superpowers/plans/2026-03-29-desktop-integration-and-hardening-implementation.md
---

# Electron Desktop UI V1 Program Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec Path:** `docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md`

**Goal:** Deliver the first Electron desktop front door for Sasiki by landing one foundation lane, three parallel implementation lanes, and one final integration lane without duplicating workflow logic from `apps/agent-runtime`.

**Architecture:** The program is intentionally split into one prerequisite lane plus parallel worktree-safe lanes. The foundation lane freezes package/tooling/bootstrap and shared desktop contracts; the parallel lanes then implement runtime orchestration, account/cookie capture, and renderer UI against those frozen seams; the final lane merges everything, runs repo gates, and syncs docs/evidence.

**Tech Stack:** Electron, electron-vite, React, TypeScript, Vitest, existing `apps/agent-runtime` workflow runtime, repo docs/governance flow

---

**Required Skill Order Before Coding:** `using-git-worktrees` -> `subagent-driven-development`

**Lane Graph:**
- Lane A: `docs/superpowers/plans/2026-03-29-desktop-foundation-and-shell-implementation.md`
  - branch: `codex/desktop-foundation`
  - parallelism: prerequisite for all other lanes
- Lane B: `docs/superpowers/plans/2026-03-29-desktop-runtime-facade-and-run-orchestration-implementation.md`
  - branch: `codex/desktop-runtime`
  - parallelism: starts after Lane A lands
- Lane C: `docs/superpowers/plans/2026-03-29-desktop-accounts-credentials-and-capture-implementation.md`
  - branch: `codex/desktop-accounts`
  - parallelism: starts after Lane A lands, can run in parallel with Lane B and Lane D
- Lane D: `docs/superpowers/plans/2026-03-29-desktop-renderer-workflows-accounts-runs-implementation.md`
  - branch: `codex/desktop-renderer`
  - parallelism: starts after Lane A lands, can run in parallel with Lane B and Lane C
- Lane E: `docs/superpowers/plans/2026-03-29-desktop-integration-and-hardening-implementation.md`
  - branch: `codex/desktop-integration`
  - parallelism: starts only after Lanes B, C, and D are merged

**Recommended Subagent Topology:**
- Architecture review:
  - one `architect` subagent before Lane A implementation
  - one `architect` subagent before Lane E final hardening
- Coding:
  - one `worker` subagent per lane
- Code review:
  - one `reviewer` subagent after each lane finishes coding
- Verification:
  - one `worker` or `reviewer` subagent dedicated to Lane E full test/lint/build/hardgate execution

**Rule:** Do not let two coding subagents edit the same lane or the same write scope at the same time. Lane A merges first; Lanes B/C/D run in parallel only after Lane A freezes shared seams; Lane E is the only integration lane.

---

## File Ownership By Lane

- Lane A owns:
  - `apps/desktop/package.json`
  - `apps/desktop/electron.vite.config.ts`
  - `apps/desktop/tsconfig*.json`
  - `apps/desktop/vitest.config.ts`
  - `apps/desktop/shared/**`
  - `apps/desktop/main/index.ts`
  - `apps/desktop/main/register-ipc.ts`
  - `apps/desktop/main/ipc/register-runs-ipc.ts`
  - `apps/desktop/main/ipc/register-accounts-ipc.ts`
  - `apps/desktop/preload/index.ts`
  - `apps/desktop/renderer/**`
  - `apps/desktop/test/shared/**`
- Lane B owns:
  - `apps/agent-runtime/src/application/shell/**`
  - `apps/agent-runtime/src/infrastructure/logging/**`
  - `apps/agent-runtime/test/application/shell/**`
  - `apps/desktop/main/runs/**`
  - `apps/desktop/main/ipc/register-runs-ipc.ts`
  - `apps/desktop/test/main/runs/**`
- Lane C owns:
  - `apps/desktop/main/accounts/**`
  - `apps/desktop/main/browser/**`
  - `apps/desktop/main/ipc/register-accounts-ipc.ts`
  - `apps/desktop/browser-extension/**`
  - `apps/desktop/test/main/accounts/**`
- Lane D owns:
  - `apps/desktop/preload/index.ts`
  - `apps/desktop/renderer/**`
  - `apps/desktop/test/renderer/**`
- Lane E owns:
  - integration fixups across `apps/agent-runtime/**` and `apps/desktop/**`
  - `apps/desktop/README.md`
  - `README.md`
  - `PROGRESS.md`
  - `NEXT_STEP.md`
  - `MEMORY.md`
  - `docs/project/current-state.md`
  - `docs/architecture/overview.md`
  - plan status updates in these plan files

## Tasks

### Task 1: Land The Foundation Lane First

**Files:**
- Plan: `docs/superpowers/plans/2026-03-29-desktop-foundation-and-shell-implementation.md`

- [ ] **Step 1: Create the foundation worktree with the required branch name**

Run: `using-git-worktrees` with branch `codex/desktop-foundation`
Expected: isolated worktree ready for the new desktop package and shared contract scaffolding

- [ ] **Step 2: Dispatch the foundation coding lane**

Use:
- one `architect` subagent for a preflight read-only review of the package shape and ownership boundaries
- one `worker` subagent to implement the foundation plan

Expected: Lane A lands first and freezes `apps/desktop` package/tooling/bootstrap plus shared desktop contracts

- [ ] **Step 3: Run lane-level reviews before merging**

Use:
- one `reviewer` subagent for spec-compliance and correctness review
- one `reviewer` subagent or verification worker for focused `apps/desktop` build/test/typecheck checks

Expected: Lane A merges cleanly before any parallel lane begins

### Task 2: Launch The Parallel Coding Lanes

**Files:**
- Plan: `docs/superpowers/plans/2026-03-29-desktop-runtime-facade-and-run-orchestration-implementation.md`
- Plan: `docs/superpowers/plans/2026-03-29-desktop-accounts-credentials-and-capture-implementation.md`
- Plan: `docs/superpowers/plans/2026-03-29-desktop-renderer-workflows-accounts-runs-implementation.md`

- [ ] **Step 1: Create three isolated worktrees after Lane A merges**

Create:
- branch `codex/desktop-runtime`
- branch `codex/desktop-accounts`
- branch `codex/desktop-renderer`

Expected: each lane has its own isolated workspace and frozen shared contracts from Lane A

- [ ] **Step 2: Dispatch three coding subagents in parallel**

Use:
- one `worker` subagent for Lane B runtime facade/run orchestration
- one `worker` subagent for Lane C accounts/credentials/capture
- one `worker` subagent for Lane D renderer views/preload bindings

Expected: no overlapping write scopes outside the shared frozen seams from Lane A

- [ ] **Step 3: Run review loops independently per lane**

For each lane:
- run spec-compliance review first
- run code-quality/correctness review second
- keep fixes inside that lane's worktree until approved

Expected: each lane is individually review-clean before merge

### Task 3: Merge Parallel Lanes In A Stable Order

**Files:**
- Lane B branch
- Lane C branch
- Lane D branch

- [ ] **Step 1: Merge Lane B before Lane D if desktop IPC contracts changed**

Check:
- whether `apps/desktop/shared/**` or run event shapes changed

Expected: renderer lane rebases once against the final runtime IPC/event surface instead of accumulating repeated drift

- [ ] **Step 2: Merge Lane C before Lane D if account DTOs changed**

Check:
- whether account, credential, or capture-result DTOs changed

Expected: renderer lane consumes the final account/capture shape before integration

- [ ] **Step 3: Do not merge Lane D until its IPC clients match merged main-process handlers**

Verify:
- accounts actions map to actual account IPC handlers
- run actions/subscriptions map to actual run IPC handlers

Expected: no renderer-only merge that points at stale or missing IPC endpoints

### Task 4: Execute The Final Integration Lane

**Files:**
- Plan: `docs/superpowers/plans/2026-03-29-desktop-integration-and-hardening-implementation.md`

- [ ] **Step 1: Create the integration worktree after Lanes B/C/D are merged**

Run: `using-git-worktrees` with branch `codex/desktop-integration`
Expected: one clean worktree that contains all merged lane outputs

- [ ] **Step 2: Dispatch integration coding and architecture review**

Use:
- one `architect` subagent for read-only integration review
- one `worker` subagent to implement hardening and doc sync

Expected: contract drift, missing docs, and gate gaps are fixed in one place

- [ ] **Step 3: Dispatch final verification and code review**

Use:
- one verification-focused subagent to run desktop and agent-runtime gates
- one `reviewer` subagent for final regression review across the whole feature

Expected: fresh evidence exists before any completion claim

