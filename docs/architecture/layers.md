# Layer Rules

## Canonical Direction

`Utils <- Domain <- Contracts <- Kernel <- Application -> Runtime`

`Infrastructure` sits beside the inner layers as the adapter boundary. Only application-owned shell/composition code should assemble concrete infrastructure implementations directly.

In plain language:

- `domain` defines product concepts
- `contracts` define capability interfaces  
- `kernel` is the canonical home for reusable execution mechanics (the true execution kernel)
- `application` owns use-case orchestration, shell, providers, and flow orchestration (observe, compact, refine)
- `runtime` is narrowed to live execution/session state only, with `runtime/agent-execution-runtime.ts` as the remaining real runtime implementation
- `infrastructure` owns external adapters: browser, MCP, LLM (model-resolver, json-model-client), config-source loading, logging, HITL, and persistence

## Rules

1. `apps/agent-runtime/src/domain` may depend only on `domain` and `utils`.
2. `apps/agent-runtime/src/contracts` may depend only on `domain` and `utils`.
3. `apps/agent-runtime/src/kernel` is the canonical home for reusable execution-kernel logic (`agent-loop.ts`, `mcp-tool-bridge.ts`). The old `core/` directory is shim-only for migration compatibility.
4. `apps/agent-runtime/src/application` owns shell (`application/shell/`), config (`application/config/`), providers (`application/providers/`), and flow orchestration (`application/observe/`, `application/compact/`, `application/refine/`). The old `runtime/` paths for these concerns are shim-only where they still exist.
5. `apps/agent-runtime/src/runtime` is narrowed to live execution state semantics only. The canonical implementation is `runtime/agent-execution-runtime.ts`; other `runtime/` files are compatibility shims during migration.
6. `apps/agent-runtime/src/infrastructure` wraps concrete integrations and adapters. LLM compatibility helpers (`infrastructure/llm/`), config-source loading (`infrastructure/config/`), and persistence adapters (`infrastructure/persistence/`) belong here.
7. Provider is an implementation pattern, not a long-term top-level architectural bucket. `runtime/providers/` is shim-only migration structure, not end-state truth.
8. Observe-, compact-, and refine-owned application code are grouped by use-case ownership under `application/observe/`, `application/compact/`, and `application/refine/`.
9. Cross-cutting browser actions and observations pass through the shared execution kernel (`kernel/`) instead of ad hoc workflow shortcuts.
10. New architecture work should prefer additive migration with temporary shims, then retire legacy paths after evidence-backed validation.
11. Historical `.plan/*` layering assumptions do not automatically stay active; the active taxonomy spec (`docs/superpowers/specs/2026-03-21-agent-runtime-layer-taxonomy-reorg.md`) overrides older folder semantics.
