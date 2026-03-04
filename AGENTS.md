# Repository Guidelines

## Project Structure & Module Organization
Current runtime code spans Python + migration Node runtime:
- `agent/`: browser loop and MCP client wrappers.
- `browser/`: CDP Chromium launcher and cookie/session injection.
- `llm/`: model client and completion wrappers.
- `workflow/`, `recorder/`, `analyzer/`, `utils/`: workflow models, capture, analysis, and shared utilities.
- `apps/agent-runtime/`: Node migration runtime using `@mariozechner/pi-agent-core` with class-based adapters (`PiAgentCoreLoop`, `ModelResolver`, `McpToolAdapter`, `CdpBrowserLauncher`, `CookieLoader`, `RunLogger`, `RunArtifactsWriter`, `PlaywrightMcpStdioClient`, `MigrationRuntime`) and file-based runtime config (`runtime.config.example.json`).

Repository control docs:
- `PROGRESS.md`: migration milestones and definition of success.
- `docs/E2E_MIGRATION_CLOSED_LOOP.md`: closed-loop E2E acceptance guide.
- `references/`: external upstream references (including `playwright-mcp` snapshot).

Tests live in `tests/` (`test_*.py`). Example YAML assets are in `examples/`.

## Migration Status
The project is actively migrating to a Node-based runtime (`pi-agent-core` + Playwright MCP). Until functional cutover is complete, Python CLI/runtime remains the production baseline.

## Build, Test, and Development Commands
Use `uv` for local development:
- `uv sync --extra dev`: install runtime + dev dependencies.
- `uv run sasiki --help`: verify CLI entrypoint and available commands.
- `uv run ruff check src tests`: lint and import/order checks.
- `uv run mypy src`: strict type checking for core modules.
- `uv run python -m pytest -q`: run tests via module entrypoint (preferred in this repo).

Node migration runtime:
- `cd apps/agent-runtime && npm install`
- `npm run dev -- \"your task\"`
- `npm run typecheck`

Run all three quality gates (`ruff`, `mypy`, `pytest`) before opening a PR. If `uv run pytest -q` and `python -m pytest` differ, record both results in PR notes.

## Coding Style & Naming Conventions
Python target is 3.10+ with 4-space indentation and 100-char line length (`black`/`ruff` settings in `pyproject.toml`).
- Functions/modules: `snake_case`
- Classes/enums: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`

Prefer typed, deterministic interfaces (Pydantic models/protocols are common here). Avoid import-time side effects except explicit bootstrap code (for example CLI logging setup).

## Testing Guidelines
Framework: `pytest` (+ `pytest-asyncio`, `pytest-cov` available).
- Name files `tests/test_<feature>.py`.
- Name tests by behavior, e.g., `test_agent_completes_on_done_action`.
- Prefer fakes/stubs for LLM/MCP/browser boundaries instead of hitting external services.
- For bug fixes, add a regression test first, then implement the fix.
- For migration acceptance, use the exact 7-step closed loop in `docs/E2E_MIGRATION_CLOSED_LOOP.md` (CDP start, cookie injection, Xiaohongshu open/search/post/like, screenshot).

## Commit & Pull Request Guidelines
Follow Conventional Commits as seen in history: `feat(...)`, `fix:`, `chore:`.
- Keep commits focused and reviewable.
- Base development work on branch `mvp-dev` (current default dev branch).
- PRs should include: concise problem/solution summary, test evidence (commands + result), compatibility/risk notes, and linked issues.

## Security & Configuration Tips
Use `.env` for local secrets and keep `.env.example` as the template. Never commit API keys, cookies, or recording artifacts. Runtime data defaults to `~/.sasiki/`; do not store sensitive user captures in the repository.
