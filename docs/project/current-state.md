# Current State

## Product Baseline

- `apps/agent-runtime` remains the canonical workflow runtime and CLI front door for `observe`, `sop-compact`, and `refine`.
- `apps/desktop` is now the first desktop UI front door. It is implemented as a separate Electron app package and does not replace the runtime ownership in `apps/agent-runtime`.
- Desktop UI v1 is complete in the current worktree baseline:
  - `Accounts` manages `site account`, embedded login, file import, Chromium extension capture, and credential verification.
  - `Workflows` triggers `observe`, `sop-compact`, and `refine` without exposing internal `runtime profile` details.
  - `Runs` shows status, logs, artifacts, and interrupt controls.
- Limited parallel run support is now handled in Electron main via runtime-profile leasing and run orchestration.
- The first release is Chromium-only and aimed at macOS first. Windows compatibility has only been prepared at the architecture/process-boundary level.

## Fresh Verification

- Desktop gates:
  - `npm --prefix apps/desktop run lint`
  - `npm --prefix apps/desktop run test`
  - `npm --prefix apps/desktop run typecheck`
  - `npm --prefix apps/desktop run build`
- Runtime gates:
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run test`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
  - `npm --prefix apps/agent-runtime run hardgate`
- Fresh hardgate evidence:
  - `artifacts/code-gate/2026-03-29T19-40-41-051Z/report.json`

## Current Entry Commands

- Runtime / CLI:
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run test`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
  - `npm --prefix apps/agent-runtime run hardgate`
  - `node apps/agent-runtime/dist/index.js observe "打开百度，搜索咖啡豆，读取第一页搜索结果并截图"`
  - `node apps/agent-runtime/dist/index.js refine "打开百度搜索咖啡豆，点击第一条搜索结果链接。"`
- Desktop:
  - `npm --prefix apps/desktop install`
  - `npm --prefix apps/desktop run dev`
  - `npm --prefix apps/desktop run test`
  - `npm --prefix apps/desktop run typecheck`
  - `npm --prefix apps/desktop run build`

## Canonical Architecture

```text
apps/agent-runtime/
  src/application/shell/   - shared runtime facade, CLI parsing, workflow host, composition root
  src/application/observe/ - observe workflow semantics
  src/application/compact/ - sop-compact workflow semantics
  src/application/refine/  - refine bootstrap, prompts, tooling, executor, orchestration
  src/kernel/              - shared execution kernel
  src/infrastructure/      - browser, config, logging, persistence, MCP, HITL adapters

apps/desktop/
  main/                    - desktop orchestration owner
  preload/                 - safe renderer bridge
  renderer/                - UI-only client
  shared/                  - desktop DTO and IPC contracts
  browser-extension/       - Chromium cookie capture extension
```

Key ownership truth:

- Workflow semantics remain owned by `apps/agent-runtime`.
- Electron main owns desktop privileges: accounts, credential capture, runtime-profile allocation, run manager, and artifact access.
- Renderer is a thin client over `window.sasiki`.
- `site account` is the user-facing desktop object.
- `runtime profile` is an internal execution container and should not be a normal workflow-form parameter.

## Current Risks

- `apps/desktop/main/index.ts` startup-failure cleanup now catches rejected `stop()` promises, but that branch still lacks a focused automated test.
- `createDesktopMainContext.start()` still has a residual partial-startup asymmetry risk that has been acknowledged but not yet isolated in its own follow-up slice.
- Desktop validation is still build/test heavy rather than live end-to-end UI smoke. The next acceptance step should use a real macOS Chromium session and a real `site account`.
- Runtime-side redirect/path-mismatch recovery for the TikTok customer-service flow remains open, but it is not a blocker for the desktop UI baseline.

## Current Documentation Truth

- Entry docs:
  - `PROGRESS.md`
  - `NEXT_STEP.md`
  - `MEMORY.md`
  - `AGENT_INDEX.md`
  - `.harness/bootstrap.toml`
  - `PROJECT_LOGS.md`
  - `docs/project/current-state.md`
  - `docs/architecture/overview.md`
- Active completed desktop spec / plan chain:
  - `docs/superpowers/specs/2026-03-29-electron-desktop-ui-v1-design.md`
  - `docs/superpowers/plans/2026-03-29-electron-desktop-ui-v1-program-plan.md`
  - `docs/superpowers/plans/2026-03-29-desktop-foundation-and-shell-implementation.md`
  - `docs/superpowers/plans/2026-03-29-desktop-runtime-facade-and-run-orchestration-implementation.md`
  - `docs/superpowers/plans/2026-03-29-desktop-accounts-credentials-and-capture-implementation.md`
  - `docs/superpowers/plans/2026-03-29-desktop-renderer-workflows-accounts-runs-implementation.md`
  - `docs/superpowers/plans/2026-03-29-desktop-integration-and-hardening-implementation.md`

## Follow-Up

- The current P0 is no longer the metric semantics slice.
- The next direct execution step is to run a live desktop smoke / acceptance pass on macOS Chromium with a real `site account`, then decide whether the next slice should be startup-symmetry hardening or Windows-first compatibility work.
- See `NEXT_STEP.md` for the exact pointer.
