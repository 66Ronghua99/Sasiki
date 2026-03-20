# Layer Rules

## Canonical Direction

`Domain/Contracts -> Core -> Runtime -> Infrastructure Adapters -> External Systems`

CLI entrypoints feed runtime orchestration. Runtime coordinates sessions and artifacts. Core owns the reusable agent kernel and tool protocol bridge. Infrastructure wraps concrete browser, MCP, logging, and terminal integrations.

## Rules

1. `apps/agent-runtime/src/domain` and `apps/agent-runtime/src/contracts` hold stable contracts and types; they must not import runtime or infrastructure modules.
2. `apps/agent-runtime/src/core` owns model resolution, agent loop behavior, and MCP bridge logic; it should stay reusable across run modes.
3. `apps/agent-runtime/src/runtime` owns mode selection, orchestration, artifact writing, SOP consumption, and refinement session lifecycle.
4. `apps/agent-runtime/src/infrastructure` wraps concrete browser launch, MCP transport, logging, and HITL terminals; operational SDK details should stay here.
5. Cross-cutting browser actions and observations must pass through the shared execution kernel instead of ad hoc runtime shortcuts.
6. New architecture work should prefer additive migration at the boundary seams, then retire legacy paths after evidence-backed validation.
7. Historical `.plan/*` layering assumptions do not automatically stay active after rollback; the next active spec must re-declare any boundary that still matters.
