# Layer Reference

This is a supporting reference. The front-door architecture summary lives in `docs/architecture/overview.md`.

## Phase 1 Positioning

- The approved end state is narrower than the current codebase.
- Phase 1 freezes that target model and its hard-gate direction; it does not claim the full refactor has already landed.
- `kernel/` is still the current execution-kernel home; Phase 2 removed its last direct `domain` / `infrastructure` imports, and Phase 4 hard gates now ratchet that boundary against drift.
- `application/shell` is the intended singleton concrete assembly owner in the end state. After the Phase 4 ratchet, refine tool behavior is service-owned and the retired provider/runtime split is no longer part of the active seam model.

## Target Dependency Direction

`utils <- domain <- contracts <- engine <- application <- shell`

`infrastructure` implements concrete adapters beside the inner layers and is intended to be assembled from `application/shell`.

`runtime` is no longer part of the active workflow front door.

## Phase 1 Boundary Summary

1. `domain` may depend only on `domain` and `utils`.
2. `contracts` may depend only on `contracts`, `domain`, and `utils`.
3. `kernel` is the current engine candidate, and the Phase 2 baseline now keeps it free of direct `domain` and `infrastructure` imports; future drift must still be rejected through lint and the explicit exception ledger.
4. `application` owns shell, workflow orchestration, prompt/session policy, and agent-facing tool surfaces.
5. `application/shell/runtime-host.ts` remains the only top-level workflow lifecycle owner.
6. `application/shell/runtime-composition-root.ts` is the current front-door composition owner and the intended singleton concrete assembly owner in the end state.
7. Non-shell `application/*` code must not grow new direct `infrastructure/*` imports; the shell remains the only concrete assembly owner.
8. `application/refine/tools/services/*` is the durable home for refine tool behavior and rebinding; `definitions/*` read `browserService` / `runService` directly, and the old `providers/*` and active `runtime/*` paths are retired.
9. `infrastructure` owns concrete adapters such as browser, MCP, config loading, persistence, terminal HITL, and LLM integrations.
10. Removed migration-era compatibility paths under `core/*` and `runtime/*` must not grow back.
