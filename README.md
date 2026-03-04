# Sasiki

Node-based browser agent runtime for Xiaohongshu task replication (`pi-agent-core` + Playwright MCP).

## Quick Start

```bash
npm --prefix apps/agent-runtime install
npm --prefix apps/agent-runtime run build
node apps/agent-runtime/dist/index.js "打开小红书，搜索咖啡豆推荐，打开帖子并点赞后截图"
```

## Repository Layout

- `apps/agent-runtime/`: production runtime implementation.
- `docs/`: closed-loop E2E guide and project structure notes.
- `references/`: upstream snapshots and research references.
- `examples/`: non-runtime example artifacts.
- `artifacts/e2e/`: per-run outputs (`steps.json`, `mcp_calls.jsonl`, `runtime.log`, `final.png`).

See [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) for the full directory map.

## Development Branch

Default development branch: `mvp-dev`.
