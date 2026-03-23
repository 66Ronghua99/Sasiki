# Testing Strategy

## Goal

Protect both runtime behavior and architecture boundaries, with evidence that the codebase continues moving toward the active global taxonomy instead of drifting back into mixed layers.

## Required Layers

1. Harness doc-health audit: use `harness:doc-health` to audit repository truth against the governance docs.
2. Project doc alignment check: `npm --prefix apps/agent-runtime run lint:docs` where the repository wants a local doc pointer check.
3. Structural checks: `npm --prefix apps/agent-runtime run lint:arch` to enforce layer boundaries and abstraction budgets.
4. Aggregated lint gate: `npm --prefix apps/agent-runtime run lint` to run docs lint, architecture lint, and current typecheck together.
5. Contract + runtime unit tests: `npm --prefix apps/agent-runtime run test`.
6. Static verification: `npm --prefix apps/agent-runtime run typecheck`.
7. Build verification: `npm --prefix apps/agent-runtime run build`.
8. Hardgate aggregation: `npm --prefix apps/agent-runtime run hardgate` for blocking lint/build contract with artifacts.
9. End-to-end browser verification: run refinement path smoke with `REFINEMENT_ENABLED=true` and inspect artifacts under `artifacts/e2e/<run_id>/`.

## Global Taxonomy Refactor Gates

For the approved global taxonomy refactor, the following are blocking acceptance criteria rather than best-effort checks.

1. `npm --prefix apps/agent-runtime run lint:arch` must remain green during the migration; directory and import regressions do not get deferred to the final task.
2. The architecture lint should progressively encode the target dependency matrix:
   - `domain -> domain/utils`
   - `contracts -> domain/utils`
   - `kernel -> domain/contracts/utils`
   - `runtime -> domain/contracts/utils`
   - `infrastructure -> domain/contracts/utils + external SDKs`
   - `application -> domain/contracts/kernel/runtime/infrastructure/utils`
3. Long-term `runtime/providers/` growth is not allowed; provider-pattern files must eventually be owned by `application` or the relevant flow subtree.
4. LLM/config/persistence adapters must not remain mixed into `core/` or generic `runtime/` roots after their migration slices land.
5. `npm --prefix apps/agent-runtime run test` is a required completion gate for every structural slice.
6. Focused tests should be added or updated for each slice boundary, especially:
   - CLI parsing and compatibility-error behavior for retired commands
   - config/bootstrap loading and precedence
   - composition-root assembly
   - refine tool-client / bootstrap / executor contracts
   - observe and compact ownership moves
   - lifecycle wrappers and runtime-state narrowing

## Recommended Runbook

- For the default repeatable refine smoke e2e flow (百度搜索咖啡豆并点击第一条结果，含 proxy-safe command 与验收检查), use:
  - `docs/testing/refine-e2e-baidu-search-runbook.md`

## Current E2E Status

- Real-browser refine stabilization remains a separate follow-up track.
- The current taxonomy refactor plan does not require a fresh e2e run for acceptance.
- Any later e2e work should be treated as behavior verification on top of the new structure, not as a blocker for topology-only slices.

## Evidence Rule

Before claiming completion, record the commands run, the resulting artifact paths, and any blocking environmental assumptions such as CDP availability, cookies, or Playwright MCP compatibility.
The project-specific `lint:docs` command, when used, should be recorded as a local verification aid rather than as a Harness-mandated gate.
