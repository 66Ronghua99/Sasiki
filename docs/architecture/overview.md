# Architecture Overview

This is the single front-door architecture summary for the current Sasiki codebase.

## Supported Product Surfaces

- CLI front door in `apps/agent-runtime`
- Electron desktop UI in `apps/desktop`
- Workflow semantics remain:
  - `observe`
  - `sop-compact`
  - `refine`

There is no legacy `runtime` command surface anymore.

## Canonical Code Homes

- `apps/agent-runtime/src/application/shell/`
  - CLI parsing
  - shared runtime facade
  - workflow entry wiring
  - `runtime-host.ts` as the top-level workflow lifecycle owner
  - `workflow-runtime.ts` as the thin command-to-workflow coordinator
  - runtime composition / workflow factory assembly
- `apps/agent-runtime/src/application/observe/`
  - observe orchestration
  - demonstration recording support
- `apps/agent-runtime/src/application/compact/`
  - SOP compact session workflow
- `apps/agent-runtime/src/application/refine/`
  - refine bootstrap
  - prompts
  - tool surface and service-owned refine tool services
  - orchestration and executor
- `apps/agent-runtime/src/kernel/`
  - reusable execution kernel home
  - `pi-agent-loop.ts`
  - `pi-agent-tool-adapter.ts`
- `apps/agent-runtime/src/infrastructure/`
  - browser
  - MCP
  - config loading
  - logging
  - LLM adapters
  - persistence
  - terminal HITL
- `apps/desktop/main/`
  - desktop orchestration owner
  - site account and credential management
  - embedded login / extension capture ingress
  - runtime profile allocation
  - run manager, event fanout, and artifact opening
- `apps/desktop/preload/`
  - safe renderer bridge exposed as `window.sasiki`
- `apps/desktop/renderer/`
  - UI-only client for `Workflows`, `Accounts`, and `Runs`
- `apps/desktop/shared/`
  - desktop DTOs, channel names, and IPC contracts
- `apps/desktop/browser-extension/`
  - Chromium-only one-click cookie capture extension

## Core Execution Model

- `observe` records a browser demonstration and emits trace/artifact inputs.
- `sop-compact` turns a recorded run into reusable compact workflow knowledge, mints durable SOP skill markdown documents under `~/.sasiki/skills/` after explicit convergence, and exposes `sop-compact list` as the minimal discovery surface for installed SOP skills.
- `refine` runs the active browser agent loop, pauses for HITL when needed, and writes reusable refinement knowledge.
- `refine` startup loads only SOP skill frontmatter metadata by default; full skill markdown bodies are fetched on demand through `skill.reader`.
- The desktop app never re-implements workflow semantics. Renderer calls preload, preload calls Electron main, and Electron main calls the shared runtime facade in `apps/agent-runtime`.
- Desktop run state, interrupts, runtime profile leases, and artifact opening all live in Electron main.
- Cookie acquisition paths converge into one credential-bundle persistence path:
  - embedded login
  - Chromium extension capture
  - cookie file import

## Stable Boundaries

- Only `apps/agent-runtime/src/application/shell/runtime-host.ts` owns the top-level workflow lifecycle and interrupt forwarding.
- `apps/agent-runtime/src/application/shell/runtime-composition-root.ts` remains the concrete workflow assembly owner.
- `apps/desktop/main` is the only desktop privilege owner; renderer must not touch filesystem, Chromium paths, or workflow runtime directly.
- `runtime profile` is an internal execution model, not a normal user-facing workflow parameter.
- `site account` is the desktop user-facing account model; `site` is derived from the selected account rather than exposed as an independent workflow form field.
- `sop-compact` inherits context from its source run; it should not require separate site-account selection.
- `skill.reader` is conditional and only appears when shell-owned composition injects real SOP persistence backing.
- Runtime success claims still require fresh verification evidence and, for live runs, fresh artifacts under `artifacts/e2e/<run_id>/`.

## Related Docs

- [docs/project/current-state.md](docs/project/current-state.md)
- [README.md](README.md)
- [apps/agent-runtime/README.md](apps/agent-runtime/README.md)
- [apps/desktop/README.md](apps/desktop/README.md)
