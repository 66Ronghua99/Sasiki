# Testing Strategy

## Goal

Protect both runtime behavior and architecture boundaries, with evidence that the live browser workflow still matches the project contract.

## Required Layers

1. Bootstrap/docs checks: `npm --prefix apps/agent-runtime run lint:docs` to keep Harness entry docs and code pointers aligned.
2. Structural checks: `npm --prefix apps/agent-runtime run lint:arch` to enforce layer boundaries and abstraction budgets.
3. Static verification: `npm --prefix apps/agent-runtime run typecheck`.
4. Build verification: `npm --prefix apps/agent-runtime run build`.
5. Hardgate aggregation: `npm --prefix apps/agent-runtime run hardgate` for blocking lint/build contract with artifacts.
6. End-to-end browser verification: run the fixed Xiaohongshu closed loop command from `.harness/bootstrap.toml` (`e2e_command`) and inspect artifacts under `artifacts/e2e/<run_id>/`.

## Evidence Rule

Before claiming completion, record the commands run, the resulting artifact paths, and any blocking environmental assumptions such as CDP availability, cookies, or Playwright MCP compatibility.
