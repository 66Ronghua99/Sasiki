# Testing Strategy

## Goal

Protect both runtime behavior and architecture boundaries, with evidence that the live browser workflow still matches the project contract.

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

## Provider/Composition-Root Refactor Gates

For the approved provider/composition-root refactor, the following are blocking acceptance criteria rather than best-effort checks. This section is about code-architecture enforcement, not doc-pointer linting.

1. `npm --prefix apps/agent-runtime run lint:arch` must remain green during the migration; layer and cycle regressions do not get deferred to the final task.
2. `lint:arch` now treats `runtime/runtime-composition-root.ts`, not `runtime/workflow-runtime.ts`, as the only allowed runtime importer of `infrastructure/mcp/*`.
3. `lint:arch` now rejects CLI entrypoints that import infrastructure modules, executor implementations, or raw system prompts directly.
4. New `command-router`, `runtime-composition-root`, and `runtime/providers/*` files are not eligible for new legacy size-budget exceptions.
5. `npm --prefix apps/agent-runtime run test` is a required completion gate for this refactor.
6. The test suite should include focused coverage for:
   - command parsing and archived-command failures
   - runtime bootstrap/config precedence and environment-sensitive defaults
   - composition-root assembly selection across legacy run, refine run, observe, and resume paths

## Recommended Runbook

- For the repeatable Xiaohongshu long-note draft flow (including proxy-safe command and acceptance checks), use:
  - `docs/testing/refine-e2e-xiaohongshu-long-note-runbook.md`

## Current Smoke Blocker

- 2026-03-20 local smoke attempted with `REFINEMENT_ENABLED=true node apps/agent-runtime/dist/index.js --mode run --resume-run-id smoke_check`.
- Current machine returned `Unexpected status 400` when connecting CDP endpoint `http://127.0.0.1:9222/json/version/`, so no fresh refinement E2E artifact was produced in this round.

## Evidence Rule

Before claiming completion, record the commands run, the resulting artifact paths, and any blocking environmental assumptions such as CDP availability, cookies, or Playwright MCP compatibility.
The project-specific `lint:docs` command, when used, should be recorded as a local verification aid rather than as a Harness-mandated gate.
