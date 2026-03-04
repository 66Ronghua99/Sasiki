# Agent Runtime (Migration Scaffold)

This package is the first migration slice from Python loop to Node runtime.

## Current scope
- Class-first abstractions for planner, tool client, policy, and loop orchestration.
- Playwright MCP stdio client wrapper.
- Migration runtime entrypoint with a minimal executable loop.

## Run
```bash
cd apps/agent-runtime
npm install
npm run dev -- "Open xiaohongshu and search for coffee beans"
```

## Notes
- `PiMonoPlanner` is intentionally wired with a fallback planner for now.
- Next slice will replace fallback logic with concrete pi-mono agent invocation.
