---
doc_type: spec
status: accepted
supersedes: []
related:
  - README.md
  - apps/agent-runtime/src/index.ts
  - apps/agent-runtime/src/application/shell/command-router.ts
  - apps/agent-runtime/src/application/shell/runtime-host.ts
  - apps/agent-runtime/src/application/shell/workflow-runtime.ts
  - apps/agent-runtime/src/application/shell/runtime-composition-root.ts
  - apps/agent-runtime/src/application/observe/
  - apps/agent-runtime/src/application/compact/
  - apps/agent-runtime/src/application/refine/
---

# Electron Desktop UI V1 Design

## Problem

Sasiki currently exposes only a CLI front door. The runtime truth for `observe`, `sop-compact`, and `refine` is already fairly well-bounded, but the product still lacks a desktop control surface that lets a user:

- manage login state without manually copying cookie JSON around
- manage multiple site accounts under the same site
- trigger the three workflows from a simple UI
- inspect running tasks, logs, and artifacts without living in a terminal

At the same time, the first UI pass should not throw away the current architecture truth by re-implementing workflow logic inside Electron. The new UI needs to stay thin at the rendering layer while still introducing the right ownership seams for account state, cookie ingestion, runtime profile allocation, and limited parallel execution.

## Success

- A new Electron desktop app exists under `apps/desktop`.
- The desktop app is the first UI front door for the existing three workflow surfaces:
  - `observe`
  - `sop-compact`
  - `refine`
- `apps/agent-runtime` remains the shared workflow runtime instead of being replaced by Electron-specific logic.
- The desktop app supports a user-visible `site account` model, where one site may have multiple accounts.
- Cookie acquisition is first-class and supports all three paths:
  - Sasiki-managed embedded login
  - Chromium browser extension one-click capture
  - cookie file import as a fallback
- Workflow pages stay simple and only expose parameters that are meaningful to the user.
- The product supports limited parallel runs, with runtime profile allocation handled internally by Sasiki.
- The first release is Chromium-only and optimized for macOS, while keeping the process boundaries and path ownership compatible with a later Windows pass.

## Non-Goals

- No support in this pass for attaching `observe` to a user's already-running personal browser.
- No Firefox or Safari support in this pass.
- No heavy visual workflow builder or planner UI.
- No advanced queueing or multi-tenant scheduler in this pass.
- No cross-device sync for accounts or runtime state in this pass.
- No requirement that end users understand or manually configure runtime profiles for ordinary workflow use.
- No plugin-owned workflow execution. The browser extension is only for cookie capture.

## Product Language

The UI and product docs for this pass should use the following terms consistently:

- `Sasiki account`
  - the Sasiki-side user or workspace identity
- `site account`
  - the real target account on an external site that the user wants to automate
- `credential bundle`
  - the current cookie/session snapshot Sasiki can use for a site account
- `runtime profile`
  - an internal Sasiki execution container that wraps Chromium profile state and related run isolation details

The user-facing desktop UI should center on `site account`, not on `runtime profile`.

## Chosen Direction

The desktop app should be implemented as a new Electron application that sits on top of a shared runtime facade. The facade becomes the programmatic entry point for the existing workflow runtime, and both CLI and Electron call into it.

This keeps the product shape aligned with the existing architecture truth:

- workflow semantics remain owned by `apps/agent-runtime`
- Electron main process becomes the desktop orchestration owner
- renderer stays focused on display and interaction
- runtime profiles, cookie ingestion, and workflow execution stay out of renderer code

This is intentionally not the thinnest possible wrapper around the CLI. A child-process-only UI shell would be faster to start, but it would force awkward follow-up rewrites for run events, interrupt handling, profile allocation, plugin bridging, and later Windows support.

## Process Model

The desktop architecture should use three layers.

### Renderer

The renderer owns:

- navigation between desktop views
- account/workflow/run presentation
- user input
- subscribing to run and account updates

The renderer does not own:

- filesystem access
- direct workflow execution
- cookie persistence
- runtime profile allocation
- Chromium discovery or path logic

### Electron Main

Electron main is the desktop orchestration owner.

It owns:

- site account management
- embedded login window launch and cookie extraction
- browser extension ingress
- credential bundle persistence
- runtime profile lifecycle and allocation
- workflow run startup, interrupt, and state tracking
- artifact indexing
- IPC surface exposed to renderer

### Shared Runtime Facade

The shared runtime facade is the programmatic desktop/CLI seam above the existing workflow runtime.

It should expose narrow operations such as:

- run `observe`
- run `sop-compact`
- run `refine`
- list SOP skills
- request run interrupt
- stream run events or status updates

It should reuse the current workflow composition and host lifecycle instead of duplicating workflow logic inside the desktop app.

## Repository Shape

This pass should add a new app instead of folding UI code into the existing runtime package.

Target shape:

```text
apps/
  agent-runtime/
    src/
      application/
      domain/
      kernel/
      infrastructure/
    ...
  desktop/
    main/
    preload/
    renderer/
    shared/
```

Guidance:

- `apps/agent-runtime` stays the product runtime owner for workflow semantics.
- `apps/desktop/main/` owns Electron main-process services.
- `apps/desktop/preload/` owns the safe bridge exposed to renderer.
- `apps/desktop/renderer/` owns UI code only.
- `apps/desktop/shared/` owns IPC contracts and shared desktop DTOs.

## Account Model

The desktop app should manage `site account` as a first-class object.

Each site account should be able to represent:

- the target site
- a user-facing account label
- the currently active credential bundle
- the latest verification status
- the default runtime profile binding

One site may have multiple site accounts. This is the core reason the desktop UI must not treat `site` alone as the primary selection concept.

## Credential Model

Each site account should resolve to one active credential bundle by default.

The credential bundle should capture:

- cookie/session payload
- source type
- created-at / updated-at metadata
- optional provenance for debugging

Supported source types in this pass:

- `embedded-login`
- `browser-plugin`
- `file-import`

The product should be able to retain historical bundles for auditing or rollback, but ordinary workflow execution should consume the active bundle only.

## Runtime Profile Model

`runtime profile` is an internal resource model, not a core user-facing object.

The system should support:

- a default runtime profile bound to a site account
- temporary or additional runtime profiles when limited parallel execution requires isolation
- multiple Chromium instances when needed for concurrent work

The desktop UI should not force ordinary users to choose a runtime profile in the workflow form. Sasiki should decide which runtime profile to use based on:

- selected site account
- active credential bundle
- current run occupancy
- need for parallel isolation

If advanced debug controls are ever added, they should live behind an advanced settings boundary rather than in the normal workflow entry flow.

## Cookie Acquisition Flows

All cookie acquisition paths should converge into the same credential-bundle persistence path.

### Embedded Login

The desktop app should support a Sasiki-managed login flow:

- user chooses a site account
- Electron main launches a managed Chromium login window
- user logs in normally
- Sasiki extracts the resulting cookie/session state
- the credential bundle is saved back to the chosen site account

This is the default first-class login path.

### Browser Extension Capture

The desktop app should also support a Chromium extension for one-click cookie capture from the user's own browser session.

The extension should stay intentionally narrow:

- collect cookie/session data for the current site
- send the payload to the local Sasiki desktop app
- not execute workflows
- not own account management or business logic

Electron main owns:

- receiving the payload
- validating it
- normalizing it into the credential-bundle shape
- binding it to the selected or confirmed site account
- persisting the resulting credential bundle

### File Import

Cookie file import remains as a fallback path for migration and manual recovery. It is not the preferred long-term user journey, but it should remain available in v1.

## Desktop Information Architecture

The desktop app should use three top-level product areas:

- `Workflows`
- `Accounts`
- `Runs`

This is better than making `site account` a global sidebar preselection, because not every workflow run requires an account context.

## Workflows View

The `Workflows` area should be the simple launch surface for the three existing workflow types.

### Observe

`observe` should only capture a task and optional site-account context.

Inputs:

- required task description
- optional site account

Rules:

- no standalone `site` input
- if a site account is selected, site context is derived from that account
- if no site account is selected, the run is treated as an unbound or anonymous observation

### SOP Compact

`sop-compact` should be driven by a source observe run.

Inputs:

- required source observe run
- optional advanced settings for semantic mode

Rules:

- no site-account picker in the main compact flow
- compact context should be inherited from the source run
- if the source run already carries site/account context, the UI may display it as read-only context summary

`semantic mode` in this pass is a runtime strategy detail for compact execution, not a HITL toggle. Interactive compact already owns its own human clarification semantics. The UI should therefore hide `semantic mode` in an advanced section instead of treating it as a normal everyday control.

### Refine

`refine` should launch from task intent or a paused run, with optional site-account context.

Inputs:

- task description, or resume run id
- optional site account
- optional SOP skill

Rules:

- no standalone `site` input
- selected site is derived from site account when one is present
- no user-facing runtime-profile picker in the standard flow

## Accounts View

The `Accounts` area should own all site-account and credential actions.

For each site account, the user should be able to:

- create or edit the account
- launch embedded login
- capture cookies from the browser extension
- import a cookie file
- verify current login state
- replace or archive the active credential bundle

The page should show enough state to answer:

- which site account this is
- whether Sasiki currently has a usable login state
- when the login state was last updated or verified
- whether the account currently has running tasks

## Runs View

The `Runs` area should be the operational console for run status and inspection.

It should support:

- recent run list
- running/completed/failed filtering
- real-time log display
- current status display
- result summary
- open artifact shortcuts
- refine resume entry where applicable

This pass only requires limited parallel visibility. It does not require a full scheduler UI.

## Parallel Execution Model

The desktop app should support limited parallel workflow execution.

For this pass, that means:

- multiple runs may exist at the same time
- main process tracks run occupancy and assigned runtime profile
- the product may allocate a fresh runtime profile when a default one is already occupied
- the UI should surface that a run is active and which site account it belongs to

This pass does not require:

- advanced queue planning
- policy-based concurrency tuning
- a global resource planner

## IPC Boundary

The renderer should communicate only through preload-exposed IPC contracts.

Examples of desktop API categories:

- accounts
  - list
  - create
  - update
  - launch embedded login
  - import cookie file
  - verify credential
- runs
  - start observe
  - start compact
  - start refine
  - interrupt
  - subscribe to updates
- artifacts
  - open artifact directory
  - reveal result files
- skills
  - list installed SOP skills

The renderer must not directly invoke Node APIs or runtime internals.

## Windows Compatibility Constraints

The first implementation target is macOS, but the architecture should preserve a clean later Windows path.

To keep that future pass cheap:

- renderer code must not own path construction or platform-specific filesystem assumptions
- Electron main must own all path, binary-discovery, and profile-root decisions
- desktop contracts should describe user/business semantics instead of OS-specific details
- the cookie extension bridge should avoid macOS-specific IPC assumptions
- runtime profile and login-window logic should not assume `/Users/...` path layouts

## Architecture Invariants

- `apps/agent-runtime` remains the canonical owner of workflow semantics.
- Electron main becomes the desktop orchestration owner, not a second workflow implementation.
- Renderer stays free of direct filesystem, workflow, and profile-management logic.
- `site account` is the main user-facing automation identity; `runtime profile` is an internal execution resource.
- `observe` does not take a standalone `site` parameter in the desktop UI.
- `sop-compact` is sourced from observe runs rather than from manual site-account selection.
- `refine` selects a site account, not a site string.
- Browser extension scope stays limited to cookie capture.

## Acceptance

The design is considered successfully implemented when all of the following are true:

- `apps/desktop` exists as a new Electron app.
- Desktop and CLI both use a shared runtime facade rather than duplicate workflow logic.
- A user can create a site account from the desktop UI.
- A user can save a usable credential bundle through embedded login.
- A user can save a usable credential bundle through browser extension capture.
- A user can import a cookie file as a fallback.
- A user can launch `observe`, `sop-compact`, and `refine` from the desktop UI.
- `observe`, `sop-compact`, and `refine` forms expose only the user-meaningful parameters defined in this spec.
- The desktop app can show running status, logs, results, and artifact entry points.
- Limited parallel runs work without requiring the user to manually reason about runtime profiles.
- Existing CLI quality gates remain intact for `apps/agent-runtime`.

## Deferred Decisions

- Exact browser-extension-to-desktop transport mechanism.
- Exact local persistence format for account and credential indexes.
- Exact desktop renderer stack and component library.
- Whether future observe support should attach to the user's personal browser session.
- Whether later releases should expose advanced per-run isolation controls in UI.
