# Testing Strategy

## Goal

Protect both runtime behavior and architecture boundaries, with evidence that the live browser workflow still matches the project contract.

## Required Layers

1. Bootstrap/docs checks: `npm --prefix apps/agent-runtime run lint:docs` to keep Harness entry docs and code pointers aligned.
2. Structural checks: `npm --prefix apps/agent-runtime run lint:arch` to enforce layer boundaries and abstraction budgets.
3. Aggregated lint gate: `npm --prefix apps/agent-runtime run lint` to run docs lint, architecture lint, and current typecheck together.
4. Static verification: `npm --prefix apps/agent-runtime run typecheck`.
5. Build verification: `npm --prefix apps/agent-runtime run build`.
6. Hardgate aggregation: `npm --prefix apps/agent-runtime run hardgate` for blocking lint/build contract with artifacts.
7. End-to-end browser verification: run the fixed Xiaohongshu closed loop command from `.harness/bootstrap.toml` (`e2e_command`) and inspect artifacts under `artifacts/e2e/<run_id>/`.

## Current Baseline Note

The current repository baseline does not yet include a standalone `npm --prefix apps/agent-runtime run test` command. The active refine-react implementation plan introduces that test layer; until then, `lint`, `hardgate`, `typecheck`, and `build` are the strongest local verification gates.

## Evidence Rule

Before claiming completion, record the commands run, the resulting artifact paths, and any blocking environmental assumptions such as CDP availability, cookies, or Playwright MCP compatibility.
