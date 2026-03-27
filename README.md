# Sasiki

Sasiki is a browser task automation agent system that turns one demonstrated workflow into reusable SOP knowledge and then reuses that knowledge during later live runs.

## Recommended Workflow

The current front door is sandbox-first:

1. Bootstrap the current worktree from a seed repo or another ready worktree.
2. Run the end-to-end `observe -> sop-compact -> refine` pipeline through `flow`, or use `selfcheck` for the one-shot wrapper.
3. Use `inspect` or the generated artifacts for verification.

```bash
npm --prefix apps/agent-runtime install
npm --prefix apps/agent-runtime run build

# Optional: seed this worktree from another prepared worktree
node .sandbox/bin/sandbox-workflow.mjs bootstrap --source /Users/you/Sasiki-dev

# Recommended e2e entry
node .sandbox/bin/sandbox-workflow.mjs flow \
  --observe-task "打开 TikTok Global Shop 客服页面，进入客户消息并检查是否有未读或未分配消息。" \
  --refine-task "打开 TikTok Global Shop 客服页面，检查是否有未读或未分配消息。" \
  --inspect

# One-shot wrapper around bootstrap -> flow -> inspect
node .sandbox/bin/sandbox-selfcheck.mjs --source /Users/you/Sasiki-dev
```

Notes:

- `flow` / `selfcheck` is the recommended e2e route; use the individual `observe`, `compact`, and `refine` sandbox commands only when you need to inspect a stage in isolation.
- Sandbox commands default to `.sandbox/runtime.config.json`.
- Current default Chrome profile and cookie paths are `~/.sasiki/chrome_profile` and `~/.sasiki/cookies`.
- Add `--skill <name>` to sandbox `refine` or runtime `refine` when you want to force a persisted SOP skill.
- Add `--resume-run-id <run_id>` to resume a paused refine run.

## Runtime Commands

The production runtime itself exposes only three command surfaces:

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
```

`refine` accepts task text, `--skill <name>`, or `--resume-run-id <run_id>`. Startup only loads skill metadata; the full skill body is read on demand through `skill.reader`.

## Inspect And Artifacts

If you only need to inspect the live CDP page state:

```bash
node .sandbox/bin/sandbox-workflow.mjs inspect --out .sandbox/inspect/state.png
```

Common evidence locations:

- sandbox orchestration artifacts: `.sandbox/artifacts/...`
- runtime run artifacts: `artifacts/e2e/<run_id>/`
- refine canonical outputs: `event_stream.jsonl`, `run_summary.json`, and optional `agent_checkpoints/`

## Repository Layout

- `apps/agent-runtime/`: production runtime implementation.
- `docs/`: current-state, architecture, runbooks, and superpowers specs/plans.
- `.sandbox/`: sandbox bootstrap/config/scripts and sandbox-local artifacts.
- `references/`: upstream snapshots and research references.
- `examples/`: non-runtime example artifacts.
- `artifacts/e2e/`: per-run outputs and canonical runtime evidence.

See [AGENTS.md](AGENTS.md) for the repository workflow contract and [apps/agent-runtime/README.md](apps/agent-runtime/README.md) for package-level runtime details.
