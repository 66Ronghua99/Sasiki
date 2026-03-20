# Testing Strategy

## Goal

Protect both runtime behavior and architecture boundaries, with evidence that the live browser workflow still matches the project contract.

## Required Layers

1. Bootstrap/docs checks: `npm --prefix apps/agent-runtime run lint:docs` to keep Harness entry docs and code pointers aligned.
2. Structural checks: `npm --prefix apps/agent-runtime run lint:arch` to enforce layer boundaries and abstraction budgets.
3. Aggregated lint gate: `npm --prefix apps/agent-runtime run lint` to run docs lint, architecture lint, and current typecheck together.
4. Contract + runtime unit tests: `npm --prefix apps/agent-runtime run test`.
5. Static verification: `npm --prefix apps/agent-runtime run typecheck`.
6. Build verification: `npm --prefix apps/agent-runtime run build`.
7. Hardgate aggregation: `npm --prefix apps/agent-runtime run hardgate` for blocking lint/build contract with artifacts.
8. End-to-end browser verification: run refinement path smoke with `REFINEMENT_ENABLED=true` and inspect artifacts under `artifacts/e2e/<run_id>/`.

## Recommended Runbook

- For the repeatable Xiaohongshu long-note draft flow (including proxy-safe command and acceptance checks), use:
  - `docs/testing/refine-e2e-xiaohongshu-long-note-runbook.md`

## Current Smoke Blocker

- 2026-03-20 local smoke attempted with `REFINEMENT_ENABLED=true node apps/agent-runtime/dist/index.js --mode run --resume-run-id smoke_check`.
- Current machine returned `Unexpected status 400` when connecting CDP endpoint `http://127.0.0.1:9222/json/version/`, so no fresh refinement E2E artifact was produced in this round.

## Evidence Rule

Before claiming completion, record the commands run, the resulting artifact paths, and any blocking environmental assumptions such as CDP availability, cookies, or Playwright MCP compatibility.
