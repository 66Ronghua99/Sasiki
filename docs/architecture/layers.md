# Layer Reference

This is a supporting reference. The front-door architecture summary lives in `docs/architecture/overview.md`.

## Dependency Direction

`utils <- domain <- contracts <- kernel <- application`

`runtime` is no longer part of the active workflow front door.
`infrastructure` sits beside the inner layers as the concrete adapter boundary.

## Current Rules

1. `domain` may depend only on `domain` and `utils`.
2. `contracts` may depend only on `domain` and `utils`.
3. `kernel` owns reusable execution mechanics and may depend on `domain`, `contracts`, `kernel`, and `utils`.
4. `application` owns shell, flow orchestration, prompt assembly, and workflow factory assembly.
5. `runtime` is not an active architecture layer in the current front door; new `src/runtime/*` files should be treated as regressions unless a truly shared primitive is justified.
6. `infrastructure` owns concrete adapters such as browser, MCP, config loading, persistence, terminal HITL, and LLM integrations.
7. Application shell/composition code is the only place that should wire concrete browser or MCP infrastructure together directly.
8. Removed migration-era compatibility paths under `core/*` and `runtime/*` must not grow back.
