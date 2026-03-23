# Layer Reference

This is a supporting reference. The front-door architecture summary lives in `docs/architecture/overview.md`.

## Phase 1 Positioning

- The approved end state is narrower than the current codebase.
- Phase 1 freezes that target model and its hard-gate direction; it does not claim the full refactor has already landed.
- `kernel/` is still the current execution-kernel home, but it remains transitional until later phases remove its remaining product/domain and infrastructure coupling.
- `application/shell` is the intended singleton concrete assembly owner in the end state. Specific non-shell assembly seams remain explicit Phase 1 exceptions and are scheduled to narrow in Phase 3 rather than being treated as the new normal.

## Target Dependency Direction

`utils <- domain <- contracts <- engine <- application <- shell`

`infrastructure` implements concrete adapters beside the inner layers and is intended to be assembled from `application/shell`.

`runtime` is no longer part of the active workflow front door.

## Phase 1 Boundary Summary

1. `domain` may depend only on `domain` and `utils`.
2. `contracts` may depend only on `contracts`, `domain`, and `utils`.
3. `kernel` is the current engine candidate, but Phase 1 treats it as transitional: no new direct `domain` or `infrastructure` edges should be introduced, and existing mismatches must stay on the explicit exception ledger.
4. `application` owns shell, workflow orchestration, prompt/session policy, and agent-facing tool surfaces.
5. `application/shell/runtime-host.ts` remains the only top-level workflow lifecycle owner.
6. `application/shell/runtime-composition-root.ts` is the current front-door composition owner and the intended singleton concrete assembly owner in the end state.
7. Non-shell `application/*` code must not grow new direct `infrastructure/*` imports; only named Phase 1 exceptions remain tolerated.
8. `application/refine/tools/runtime/*` and `application/refine/tools/providers/*` remain transitional role seams in Phase 1; `definitions/*` must still stay isolated from them.
9. `infrastructure` owns concrete adapters such as browser, MCP, config loading, persistence, terminal HITL, and LLM integrations.
10. Removed migration-era compatibility paths under `core/*` and `runtime/*` must not grow back.
