# Layer Rules

## Canonical Direction

`Utils <- Domain <- Contracts <- Kernel <- Application -> Runtime`

`Infrastructure` sits beside the inner layers as the adapter boundary. Only application-owned shell/composition code should assemble concrete infrastructure implementations directly.

In plain language:

- `domain` defines product concepts
- `contracts` define capability interfaces
- `kernel` owns reusable execution mechanics
- `application` owns use-case orchestration, shell, providers, and app wiring
- `runtime` owns live execution/session state only
- `infrastructure` owns external adapters such as browser, MCP, LLM, config-source loading, logging, HITL, and persistence

## Rules

1. `apps/agent-runtime/src/domain` may depend only on `domain` and `utils`.
2. `apps/agent-runtime/src/contracts` may depend only on `domain` and `utils`.
3. `apps/agent-runtime/src/core` is transitional and should converge toward `kernel`; only reusable execution-kernel logic belongs there.
4. `apps/agent-runtime/src/runtime` is transitional and should stop acting as the whole application layer; long-term shell/orchestration code belongs under `application`, while only live session/state code should remain under `runtime`.
5. `apps/agent-runtime/src/infrastructure` wraps concrete integrations and adapters. LLM compatibility helpers, config-source loading, and persistence adapters belong here rather than beside application orchestration.
6. Provider is an implementation pattern, not a long-term top-level architectural bucket. `runtime/providers/` is migration-era structure, not end-state truth.
7. Observe-, compact-, and refine-owned application code should be grouped by use-case ownership rather than scattered across root runtime folders.
8. Cross-cutting browser actions and observations must still pass through the shared execution kernel instead of ad hoc workflow shortcuts.
9. New architecture work should prefer additive migration with temporary shims, then retire legacy paths after evidence-backed validation.
10. Historical `.plan/*` layering assumptions do not automatically stay active after rollback; the active taxonomy spec overrides older folder semantics.
