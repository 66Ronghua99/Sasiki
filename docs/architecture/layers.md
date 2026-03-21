# Layer Reference

This is a supporting reference. The front-door architecture summary lives in `docs/architecture/overview.md`.

## Dependency Direction

`utils <- domain <- contracts <- kernel <- application`

`runtime` stays narrow and live-state focused.
`infrastructure` sits beside the inner layers as the concrete adapter boundary.

## Current Rules

1. `domain` may depend only on `domain` and `utils`.
2. `contracts` may depend only on `domain` and `utils`.
3. `kernel` owns reusable execution mechanics and may depend on `domain`, `contracts`, `kernel`, and `utils`.
4. `application` owns shell, flow orchestration, prompt assembly, and provider-style factories.
5. `runtime` is reserved for live execution/session semantics; the current real runtime file is `runtime/agent-execution-runtime.ts`.
6. `infrastructure` owns concrete adapters such as browser, MCP, config loading, persistence, terminal HITL, and LLM integrations.
7. Application shell/composition code is the only place that should wire concrete browser or MCP infrastructure together directly.
8. Removed migration-era compatibility paths under `core/*` and `runtime/*` must not grow back.
