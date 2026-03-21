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
  - tool surface
  - orchestration and executor
- `apps/agent-runtime/src/kernel/`
  - reusable execution kernel
  - `agent-loop.ts`
  - `mcp-tool-bridge.ts`
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
- Runtime telemetry is assembled once in `application/shell/runtime-composition-root.ts`, then injected into each workflow as run-scoped telemetry.
- `refine` persists canonical run truth as append-only `event_stream.jsonl`, plus a run summary artifact and optional `agent_checkpoints/`.

## Stable Boundaries

- Only `application/shell/runtime-composition-root.ts` may assemble concrete MCP/browser infrastructure and shell-owned workflow factories.
- Only `application/shell/runtime-composition-root.ts` may assemble telemetry sinks and artifact checkpoint writers.
- Only `application/shell/runtime-host.ts` owns the top-level workflow lifecycle and interrupt forwarding.
- Workflow modules own their own semantics:
  - `observe` owns demonstration recording setup/execution
  - `refine` owns loop bootstrap, execution, interrupt, and shutdown semantics
  - `sop-compact` owns offline compact execution semantics
- Application code imports canonical owners directly; migration-era `core/*` and `runtime/*` re-export shells have been removed.
- `workflow-runtime.ts` does not own lifecycle fallback logic or compact service construction; it only resolves the selected workflow and hands it to the host.
- The execution kernel stays reusable and does not own CLI grammar, config loading, or flow-specific orchestration.
- Runtime success claims still require fresh artifacts under `artifacts/e2e/<run_id>/`.

## Related Docs

- `docs/project/current-state.md`
- `docs/architecture/layers.md`
- `docs/testing/strategy.md`
- `apps/agent-runtime/README.md`
