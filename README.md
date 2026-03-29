# Sasiki

Sasiki is a browser task automation agent system that turns one demonstrated workflow into reusable SOP knowledge and then reuses that knowledge during later live runs.

## Quick Start

### CLI Runtime

```bash
npm --prefix apps/agent-runtime install
npm --prefix apps/agent-runtime run build

node apps/agent-runtime/dist/index.js observe "在百度演示一次：搜索咖啡豆并打开一个结果"
```

### Desktop UI

```bash
npm --prefix apps/desktop install
npm --prefix apps/desktop run dev
```

The desktop package is the first UI front door for Sasiki. It wraps the same `observe`, `sop-compact`, and `refine` runtime truth that still lives in `apps/agent-runtime`.

## Workflow Surfaces

The production runtime still exposes only three workflow surfaces:

```bash
# Observe a demonstration
node apps/agent-runtime/dist/index.js observe "在百度演示一次：搜索咖啡豆并打开一个结果"

# Compact one recorded run into a durable SOP skill candidate
node apps/agent-runtime/dist/index.js sop-compact --run-id 20260327_145330_192

# List persisted SOP skills
node apps/agent-runtime/dist/index.js sop-compact list

# Run refine directly
node apps/agent-runtime/dist/index.js refine "打开百度搜索咖啡豆，点击第一条搜索结果链接。"

# Run refine with an explicit SOP skill
node apps/agent-runtime/dist/index.js refine --skill tiktok-shop-check-inbox-messages

# Resume a paused refine run
node apps/agent-runtime/dist/index.js refine --resume-run-id 20260327_145552_964
```

`refine` accepts task text, `--skill <name>`, or `--resume-run-id <run_id>`. Startup only loads skill metadata; the full skill body is read on demand through `skill.reader`.

## Desktop UI V1

Desktop v1 currently includes:

- `Accounts`: manage `site account`, embedded login, cookie import, Chromium extension capture, and credential verification
- `Workflows`: trigger `observe`, `sop-compact`, and `refine` from a simple UI
- `Runs`: inspect run status, logs, interrupts, and artifacts

Current desktop constraints:

- Chromium-only
- optimized for macOS first
- Windows compatibility is prepared at the process-boundary level, but not yet smoke-tested end to end

## Runtime Config

Configuration is loaded from the first available source:

```bash
cp apps/agent-runtime/runtime.config.example.json apps/agent-runtime/runtime.config.json
node apps/agent-runtime/dist/index.js refine -c apps/agent-runtime/runtime.config.json "打开小红书并搜索咖啡豆"
```

Load order:

- `--config <path>` / `-c <path>`
- `RUNTIME_CONFIG_PATH`
- `./runtime.config.json`
- `./apps/agent-runtime/runtime.config.json`

Current local defaults typically use:

- system Chrome or Chromium
- `~/.sasiki/chrome_profile`
- `~/.sasiki/cookies`

## Repository Layout

- `apps/agent-runtime/`: production workflow runtime and CLI front door.
- `apps/desktop/`: Electron desktop UI front door (`main`, `preload`, `renderer`, `shared`, browser extension).
- `docs/`: current-state, architecture, runbooks, and superpowers specs/plans.
- `references/`: upstream snapshots and research references.
- `examples/`: non-runtime example artifacts.
- `artifacts/e2e/`: per-run outputs and canonical runtime evidence.

See [AGENTS.md](AGENTS.md), [apps/agent-runtime/README.md](apps/agent-runtime/README.md), and [apps/desktop/README.md](apps/desktop/README.md) for package-level details.
