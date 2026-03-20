# Project Context

## Purpose

Sasiki is a browser task automation agent system focused on long-running SOP replication.
The core product goal is to turn "watch the user do it once" into reusable execution capability, then improve later runs through replay and online refinement.

The repository is currently in a restart-sync phase: we are re-establishing the code-backed baseline first, then freezing a new architecture spec on top of it.

## Success Criteria

- A recorded browser demonstration can be compacted into reusable execution context.
- Runtime execution can complete real browser tasks with artifact-backed evidence.
- Refinement can promote reusable knowledge with provenance instead of falling back to heuristic rule stitching.

## Constraints

- Keep the system agent-first: multi-turn agent loops are the primary decision mechanism, not rule-based orchestration.
- Preserve a single shared browser execution kernel and keep artifact contracts auditable.
- Current project quality gates include:
  - `npm --prefix apps/agent-runtime run lint:docs`
  - `npm --prefix apps/agent-runtime run lint:arch`
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
  - `npm --prefix apps/agent-runtime run hardgate`
- A standalone runtime `test` script is planned but not yet part of the current code-backed baseline.
- Runtime verification depends on local CDP Chromium, valid cookies, and Playwright MCP availability.

## Related Docs

- `docs/architecture/overview.md`
- `docs/architecture/layers.md`
- `docs/testing/strategy.md`
- `docs/project/current-state.md`
- `.harness/bootstrap.toml`
- `docs/superpowers/templates/SPEC_TEMPLATE.md`
