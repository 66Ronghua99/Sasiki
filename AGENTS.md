# Repository Guidelines

## Project Structure & Module Organization
This repository is now Node-first.
- `apps/agent-runtime/` is the only runtime codebase.
- `apps/agent-runtime/src/core/` contains planning/execution abstractions (`AgentLoop`, `ModelResolver`, `McpToolBridge`).
- `apps/agent-runtime/src/infrastructure/` contains browser, MCP, and logging adapters.
- `apps/agent-runtime/src/runtime/` contains composition (`AgentRuntime`), config loading, and artifact writing.
- `docs/` stores acceptance and structure docs.
- `PROGRESS.md` is the single status board (milestone, DONE, TODO).
- `references/` contains upstream snapshots only (not runtime dependencies).

## Build, Test, and Development Commands
- `npm --prefix apps/agent-runtime install`: install runtime dependencies.
- `npm --prefix apps/agent-runtime run dev -- "你的任务"`: run in TS dev mode.
- `npm --prefix apps/agent-runtime run typecheck`: TypeScript static checks.
- `npm --prefix apps/agent-runtime run build`: compile to `dist/`.
- `node apps/agent-runtime/dist/index.js "...task..."`: production-like execution.

## Coding Style & Naming Conventions
Use strict TypeScript patterns:
- Classes/interfaces: `PascalCase`; functions/variables: `camelCase`; constants: `UPPER_SNAKE_CASE`.
- Keep adapter boundaries explicit: `core` must not depend on concrete process-side effects.
- Prefer structured records over free-form strings for runtime events.

## Testing Guidelines
Primary gates before handoff:
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

E2E acceptance follows `docs/E2E_CLOSED_LOOP.md` with required artifacts in `artifacts/e2e/{run_id}/`.

## Commit & Pull Request Guidelines
Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`). Keep commits small and isolated by concern.  
PRs should include: objective, changed modules, verification commands/results, and rollback notes if behavior changed.

## Security & Configuration Tips
Use local config files and env vars only (`apps/agent-runtime/runtime.config.json`, `.env`).  
Never commit API keys, cookies, or runtime artifacts. Sensitive runtime state should stay under `~/.sasiki/`.
