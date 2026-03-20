# Lint Rule Matrix

| rule_id | invariant | scope | implementation | severity_now | severity_target | invalid_fixture | valid_fixture | exception_policy |
|---|---|---|---|---|---|---|---|---|
| `docs.required-path` | Core governance/architecture docs referenced by baseline docs must exist | `PROGRESS.md`, `NEXT_STEP.md`, `MEMORY.md`, `docs/**/*.md`, `.harness/bootstrap.toml` | `apps/agent-runtime/scripts/lint-docs.mjs` | `error` | `error` | remove `docs/architecture/layers.md` and run `npm --prefix apps/agent-runtime run lint:docs` | keep all required docs and run `lint:docs` | `none` |
| `docs.required-collection` | Active specs/plans directories must exist and contain markdown docs | `docs/superpowers/specs`, `docs/superpowers/plans` | `apps/agent-runtime/scripts/lint-docs.mjs` | `error` | `error` | empty `docs/superpowers/plans` and run `lint:docs` | keep at least one `.md` in each directory | `none` |
| `docs.reference-path` | Referenced local doc/config paths must resolve | `docs/architecture/overview.md`, `docs/project/README.md`, `docs/project/current-state.md`, `docs/testing/strategy.md`, `PROGRESS.md`, `MEMORY.md`, `NEXT_STEP.md` | `apps/agent-runtime/scripts/lint-docs.mjs` | `error` | `error` | add broken path in one scanned doc | all scanned references resolve | `none` |
| `dep.layer.direction` | Import direction must follow `domain/contracts -> core -> runtime -> infrastructure` boundaries | `apps/agent-runtime/src/**/*.ts` | `apps/agent-runtime/scripts/lint-architecture.mjs` | `error` | `error` | import `runtime/*` from `core/*` or `domain/*` | imports only from allowed layers | `none` |
| `dep.import.cycle` | Local TypeScript imports must not form dependency cycles | `apps/agent-runtime/src/**/*.ts` | `apps/agent-runtime/scripts/lint-architecture.mjs` | `error` | `error` | create `a.ts -> b.ts -> a.ts` cycle and run `npm --prefix apps/agent-runtime run lint:arch` | keep import graph acyclic | `none` |
| `dep.mcp.sdk.boundary` | Raw MCP SDK import must stay inside infrastructure MCP adapter | `apps/agent-runtime/src/**/*.ts` | `apps/agent-runtime/scripts/lint-architecture.mjs` | `error` | `error` | import `@modelcontextprotocol/sdk` in `runtime/*` | import only in `infrastructure/mcp/*` | `none` |
| `dep.infra.mcp.entrypoint` | Runtime MCP adapter wiring only at composition root | `apps/agent-runtime/src/**/*.ts` | `apps/agent-runtime/scripts/lint-architecture.mjs` | `error` | `error` | import `../infrastructure/mcp/mcp-stdio-client.js` outside `runtime/runtime-composition-root.ts` | MCP infra import only in `runtime/runtime-composition-root.ts` and `infrastructure/mcp/*` | `none` |
| `dep.cli.no-infra-assembly` | CLI entrypoints must not import infrastructure modules directly | `apps/agent-runtime/src/index.ts`, `apps/agent-runtime/src/runtime/command-router.ts` | `apps/agent-runtime/scripts/lint-architecture.mjs` | `error` | `error` | import `infrastructure/*` from `index.ts` or `command-router.ts` | keep CLI files limited to command parsing and app dispatch | `none` |
| `dep.cli.no-executor-import` | CLI entrypoints must not import executor implementations directly | `apps/agent-runtime/src/index.ts`, `apps/agent-runtime/src/runtime/command-router.ts` | `apps/agent-runtime/scripts/lint-architecture.mjs` | `error` | `error` | import `runtime/run-executor.ts` from `index.ts` or `command-router.ts` | keep executor imports behind the composition root/runtime facade | `none` |
| `dep.prompt.provider.boundary` | System prompt constants must only be imported through the prompt provider | `apps/agent-runtime/src/**/*.ts` | `apps/agent-runtime/scripts/lint-architecture.mjs` | `error` | `error` | import `runtime/system-prompts.ts` outside `runtime/providers/prompt-provider.ts` | import system prompts only in `runtime/providers/prompt-provider.ts` | `none` |
| `size.file.max-lines` | New modules must not grow into oversized god-files | `apps/agent-runtime/src/**/*.ts` | `apps/agent-runtime/scripts/lint-architecture.mjs` | `error` | `error` | create a new file with >500 lines | keep files <=500 lines or within explicit legacy budget | `legacy-size-budget` |
| `size.file.near-limit` | Early warning before hitting hard max-lines cap | `apps/agent-runtime/src/**/*.ts` | `apps/agent-runtime/scripts/lint-architecture.mjs` | `warn` | `error` (after debt burn-down) | grow non-legacy file to >450 lines | keep files below 90% budget | `legacy-size-budget` |

## Rollout Ladder

- Stage 3 now: all `docs.*` and `dep.*` rules are hard errors.
- Stage 2 now: `size.file.near-limit` is warning to avoid noisy migration.
- Promotion trigger: when legacy oversized files are split and warning count stays stable for 2 consecutive PR cycles, promote `size.file.near-limit` to error.

## Current Refactor Notes

- `runtime/command-router.ts`, `runtime/runtime-composition-root.ts`, and `runtime/providers/*.ts` stay on the default size budget and are not eligible for new `legacy-size-budget` exceptions.
- The current architecture lint intentionally treats CLI parsing, prompt imports, and MCP assembly as separate hard boundaries so future refactors do not collapse back into `index.ts` or `workflow-runtime.ts`.
