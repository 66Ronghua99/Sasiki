# Lint Exception Policy

## Scope

This policy applies to architecture and docs lint rules enforced by:

- `npm --prefix apps/agent-runtime run lint:docs`
- `npm --prefix apps/agent-runtime run lint:arch`

## Allowed Exception Types

1. `legacy-size-budget`
- Purpose: temporary allowance for pre-existing large files.
- Current allowlist and budget:
  - `core/agent-loop.ts` <= 760 lines
  - `runtime/run-executor.ts` <= 780 lines
- Governance: no new file may enter this allowlist without owner review.

## Non-Exception Rules

The following rules have no waiver path and must be fixed immediately:

- `docs.required-path`
- `docs.reference-path`
- `dep.layer.direction`
- `dep.import.cycle`
- `dep.mcp.sdk.boundary`
- `dep.infra.mcp.entrypoint`
- `dep.cli.no-infra-assembly`
- `dep.cli.no-executor-import`
- `dep.prompt.provider.boundary`

## Review Cadence

- Review the legacy size allowlist every architecture milestone or before release cut.
- Target state: remove one legacy entry at a time by refactor and lower budgets.
- The provider/composition-root refactor must not add `runtime/command-router.ts`, `runtime/runtime-composition-root.ts`, or `runtime/providers/*.ts` to the legacy size allowlist.

## Expiry Condition

- When a legacy file is split and remains below default budget (`<=500` lines), remove it from allowlist in the same PR.
