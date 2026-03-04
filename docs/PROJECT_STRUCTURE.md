# Project Structure

## Top-Level

```text
.
├── apps/
│   └── agent-runtime/        # Node runtime (source, build config, package)
├── artifacts/
│   └── e2e/                  # Runtime output by run_id
├── docs/
│   ├── E2E_CLOSED_LOOP.md
│   └── PROJECT_STRUCTURE.md
├── examples/                 # Optional business examples (non-runtime code)
├── references/               # Upstream references / snapshots
├── AGENTS.md                 # Contributor guide
├── PROGRESS.md               # Current milestone and TODO/DONE
└── README.md
```

## Runtime Module Layout

`apps/agent-runtime/src/` is split by responsibility:

- `core/`: agent loop, model resolver, MCP tool adapter.
- `infrastructure/browser/`: CDP launcher and cookie injection.
- `infrastructure/mcp/`: Playwright MCP stdio client.
- `infrastructure/logging/`: structured runtime logger.
- `runtime/`: runtime config, orchestration, artifact writer.
- `contracts/` and `domain/`: interfaces and run data contracts.

## Generated / Local-Only Files

- `apps/agent-runtime/dist/`: TypeScript build output (ignored).
- `apps/agent-runtime/runtime.config.json`: local runtime config (ignored).
- `artifacts/`: execution artifacts (ignored).
