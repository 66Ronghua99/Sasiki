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
  - tool surface and service-owned refine tool services
  - orchestration and executor
- `apps/agent-runtime/src/kernel/`
  - reusable execution kernel home
  - Phase 2 direct-import cleanup is complete
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
- `sop-compact` turns a recorded run into reusable compact workflow knowledge, mints durable SOP skill markdown documents under `~/.sasiki/skills/` after explicit convergence, and exposes `sop-compact list` as the minimal discovery surface for installed SOP skills.
- `refine` runs the active browser agent loop, pauses for HITL when needed, and writes reusable refinement knowledge.
- `refine` startup loads only SOP skill frontmatter metadata by default; full skill markdown bodies are fetched on demand through `skill.reader`.
- `skill.reader` is a conditional narrow seam, not a universal runtime capability: it is only registered when shell composition injects a backing SOP skill service/store.
- pi-agent hook execution runs only through `kernel/pi-agent-tool-adapter.ts`; direct refine tool calls stay hook-free.
- Runtime telemetry is assembled once in `application/shell/runtime-composition-root.ts`, then injected into each workflow as run-scoped telemetry.
- `refine` persists canonical run truth as append-only `event_stream.jsonl`, plus a run summary artifact and optional `agent_checkpoints/`.
- `application/shell/runtime-config-bootstrap.ts` is the shell-owned bootstrap seam for config loading: infrastructure discovers raw env/fs sources, and `application/config/runtime-config-loader.ts` normalizes them into the runtime policy contract.

## Stable Boundaries

- Only `application/shell/runtime-host.ts` owns the top-level workflow lifecycle and interrupt forwarding.
- `application/shell/runtime-composition-root.ts` is the current front-door composition owner and the intended singleton concrete assembly owner in the end state.
- `SopSkillStore` concrete assembly stays in `application/shell/runtime-composition-root.ts`; refine consumes it only through injected bootstrap catalog and `skill.reader` service ports.
- Raw/direct refine tool surfaces without SOP persistence backing must not expose `skill.reader`; shell-owned composition remains responsible for deciding whether that seam exists.
- Phase 3 centralized observe/compact concrete assembly, refine bootstrap persistence assembly, refine run artifact assembly, and config bootstrap orchestration back into shell-owned seams.
- Phase 4 ratcheted lint and structural proofs to the post-migration truth.
- `application/refine/tools/services/*` is now the durable home for refine tool behavior and rebinding.
- `application/refine/tools/providers/*` and the active `runtime/*` tool path have been removed from the active codebase.
- Workflow modules own their own semantics:
  - `observe` owns demonstration recording setup/execution
  - `refine` owns loop bootstrap, execution, interrupt, and shutdown semantics
  - `sop-compact` owns offline compact execution semantics
- Application code imports canonical owners directly; migration-era `core/*` and `runtime/*` re-export shells have been removed.
- `workflow-runtime.ts` does not own lifecycle fallback logic or compact service construction; it only resolves the selected workflow and hands it to the host.
- `kernel/` remains the active execution-kernel home, and Phase 4 hard gates now reject any regrowth of direct `domain/*` or `infrastructure/*` imports there.
- `application/refine/tools/services/*` now owns the service-backed refine tool seam; the retired `providers/*` and active `runtime/*` paths are no longer part of the active architecture.
- Runtime success claims still require fresh artifacts under `artifacts/e2e/<run_id>/`.

## Related Docs

- `docs/project/current-state.md`
- `docs/architecture/layers.md`
- `docs/testing/strategy.md`
- `apps/agent-runtime/README.md`
