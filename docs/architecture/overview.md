# Architecture Overview

This is the single front-door architecture summary for the current `agent-runtime` codebase.

## Supported Product Surface

- `observe`
- `refine`
- `sop-compact`

There is no legacy `runtime` command surface anymore.

## Canonical Code Homes

- `apps/agent-runtime/src/application/shell/`
  - CLI parsing
  - workflow entry wiring
  - runtime composition
- `apps/agent-runtime/src/application/observe/`
  - observe orchestration
  - demonstration recording support
- `apps/agent-runtime/src/application/compact/`
  - SOP compact session workflow
- `apps/agent-runtime/src/application/refine/`
  - refine bootstrap
  - prompts
  - tool surface
  - orchestration and executor
- `apps/agent-runtime/src/kernel/`
  - reusable execution kernel
  - `agent-loop.ts`
  - `mcp-tool-bridge.ts`
- `apps/agent-runtime/src/runtime/agent-execution-runtime.ts`
  - remaining live runtime/session wrapper
- `apps/agent-runtime/src/infrastructure/`
  - browser
  - MCP
  - config loading
  - LLM adapters
  - persistence
  - terminal HITL

## Core Execution Model

- `observe` records a browser demonstration and emits trace/artifact inputs.
- `sop-compact` turns a recorded run into reusable compact workflow knowledge.
- `refine` runs the active browser agent loop, pauses for HITL when needed, and writes reusable refinement knowledge.

## Stable Boundaries

- Only `application/shell/runtime-composition-root.ts` may assemble concrete MCP/browser infrastructure.
- Application code imports canonical owners directly; migration-era `core/*` and `runtime/*` re-export shells have been removed.
- The execution kernel stays reusable and does not own CLI grammar, config loading, or flow-specific orchestration.
- Runtime success claims still require fresh artifacts under `artifacts/e2e/<run_id>/`.

## Related Docs

- `docs/project/current-state.md`
- `docs/architecture/layers.md`
- `docs/testing/strategy.md`
- `apps/agent-runtime/README.md`
