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
  - reusable execution kernel candidate
  - transitional in Phase 1; not yet the fully narrowed end-state engine
  - `pi-agent-loop.ts`
  - `pi-agent-tool-adapter.ts`
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
- pi-agent hook execution runs only through `kernel/pi-agent-tool-adapter.ts`; direct refine tool calls stay hook-free.
- Runtime telemetry is assembled once in `application/shell/runtime-composition-root.ts`, then injected into each workflow as run-scoped telemetry.
- `refine` persists canonical run truth as append-only `event_stream.jsonl`, plus a run summary artifact and optional `agent_checkpoints/`.

## Stable Boundaries

- Only `application/shell/runtime-host.ts` owns the top-level workflow lifecycle and interrupt forwarding.
- `application/shell/runtime-composition-root.ts` is the current front-door composition owner and the intended singleton concrete assembly owner in the end state.
- Phase 1 does not claim every concrete adapter has already been centralized into shell. The current explicit non-shell exceptions are:
  - observe-owned recorder/persistence construction in `application/observe/observe-workflow-factory.ts` and `application/observe/observe-executor.ts`
  - compact-owned model/HITL/artifact construction in `application/compact/interactive-sop-compact.ts`
  - refine-owned bootstrap/persistence/loop assembly in `application/refine/refine-workflow.ts`, `application/refine/refine-run-bootstrap-provider.ts`, `application/refine/react-refinement-run-executor.ts`, and `application/refine/attention-guidance-loader.ts`
  - application-facing bootstrap bridging in `application/config/runtime-config-loader.ts`
- Those exceptions are Phase 1 transitional seams. They stay explicit so later phases can pull them back toward shell instead of silently widening the model.
- Workflow modules own their own semantics:
  - `observe` owns demonstration recording setup/execution
  - `refine` owns loop bootstrap, execution, interrupt, and shutdown semantics
  - `sop-compact` owns offline compact execution semantics
- Application code imports canonical owners directly; migration-era `core/*` and `runtime/*` re-export shells have been removed.
- `workflow-runtime.ts` does not own lifecycle fallback logic or compact service construction; it only resolves the selected workflow and hands it to the host.
- `kernel/` is still transitional in Phase 1: it is the active execution-kernel home, but the approved end state is stricter than the current code and later phases will narrow it further.
- `application/refine/tools/runtime/*` and `application/refine/tools/providers/*` remain transitional refine-tool seams in Phase 1; the role model is hardened now without promising their final directory home yet.
- Runtime success claims still require fresh artifacts under `artifacts/e2e/<run_id>/`.

## Related Docs

- `docs/project/current-state.md`
- `docs/architecture/layers.md`
- `docs/testing/strategy.md`
- `apps/agent-runtime/README.md`
