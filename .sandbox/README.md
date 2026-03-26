# Sasiki 本地 Sandbox 工作区说明

目标：
- 形成可复用闭环：`bootstrap -> flow -> refine 回归 -> CDP 可视化 -> 产物归档`。
- 默认 profile/cookie 使用 `~/.sasiki`，产物与配置仍以 `.sandbox` 为归档中心。
- 通过 Playwright CDP 观察器复用当前 chrome 页面状态，便于调试。

## 路由（推荐）

**统一端到端路由（测试/调试时默认走这条）**
1. `bootstrap`（建议带 seed）
2. `flow` 或 `selfcheck`
3. `inspect`
4. 检查 `.sandbox/artifacts/` 与 `.sandbox/artifacts/selfcheck/<timestamp>/`

默认 seed 流程：
- 首次在种子仓库执行 `bootstrap`。
- 新 worktree 执行 `bootstrap --source <种子路径>` 复用初始状态。
- 或设置 `SASIKI_SANDBOX_SOURCE=<种子路径>` 后直接调用 `bootstrap`。

## 目录约定

- `.sandbox/templates/runtime.config.json`：配置模板（可在工作树内拷贝为 `.sandbox/runtime.config.json`）。
- `~/.sasiki/chrome_profile/`：浏览器 profile（开发环境默认使用个人 profile；也可在 `.sandbox/runtime.config.json` 改回 `.sandbox/chrome_profile`）。
- `~/.sasiki/cookies/`：cookie 文件目录（开发环境默认使用个人 cookie；也可在 `.sandbox/runtime.config.json` 改回 `.sandbox/cookies`）。
- `.sandbox/artifacts/`：本地运行产物根目录（由 `runtime.config.json.runtime.artifactsDir` 写入）。
- `.sandbox/inspect/`：保存 `cdp` 快照截图（若开启 `inspect`）。
- `.sandbox/bin/sandbox-workflow.mjs`：主入口（bootstrap / observe / compact / refine / flow / inspect）。
- `.sandbox/bin/playwright-cdp.mjs`：CDP 状态观察脚本（`status` / `watch`）。

## 命令

```bash
# 初始化当前工作树 sandbox（可从旧路径拷贝 profile/cookies）
  node .sandbox/bin/sandbox-workflow.mjs bootstrap --source /path/to/seed-worktree/Sasiki-dev
  SASIKI_SANDBOX_SOURCE=/path/to/seed-worktree/Sasiki-dev node .sandbox/bin/sandbox-workflow.mjs bootstrap
  node .sandbox/bin/sandbox-workflow.mjs bootstrap --source /path/to/seed-worktree/Sasiki-dev --no-copy-cookies --no-copy-profile

# 单步（TikTok 客服 workflow）
node .sandbox/bin/sandbox-workflow.mjs observe --task "打开 TikTok Global Shop 客服页面并检查是否有未读或未分配消息"
node .sandbox/bin/sandbox-workflow.mjs observe --task "打开 TikTok Global Shop 客服页面并检查是否有未读或未分配消息" --auto-observe --observe-preset tiktok-shop-customer-service
node .sandbox/bin/sandbox-workflow.mjs compact --run-id <run_id> --semantic auto
node .sandbox/bin/sandbox-workflow.mjs refine --task "打开 TikTok Global Shop 客服页面并检查是否有未读或未分配消息"

# 一条链路：observe -> sop-compact -> refine
node .sandbox/bin/sandbox-workflow.mjs flow \
  --observe-task "打开 TikTok Global Shop 客服页面并检查是否有未读或未分配消息" \
  --refine-task "打开 TikTok Global Shop 客服页面并检查是否有未读或未分配消息" \
  --auto-observe \
  --observe-preset tiktok-shop-customer-service \
  --inspect

# 直接看 Chrome 当前 CDP 状态（可抓 screenshot）
node .sandbox/bin/sandbox-workflow.mjs inspect --out .sandbox/inspect/now.png

# 监听型查看（支持 `watch`）
node .sandbox/bin/sandbox-workflow.mjs inspect watch --interval 2000 --max-steps 5 --title "runtime-watch"

# 一键自检（端到端默认命令）：bootstrap + flow + 自动 cdp 快照
node .sandbox/bin/sandbox-selfcheck.mjs --source /path/to/seed-worktree/Sasiki-dev \
  --observe-task "打开 TikTok Global Shop 客服页面并检查是否有未读或未分配消息" \
  --refine-task "打开 TikTok Global Shop 客服页面并检查是否有未读或未分配消息" \
  --auto-observe \
  --observe-preset tiktok-shop-customer-service

# 只跑 observe 并自动执行 TikTok 客服页面操作（推荐的一键命令）
node .sandbox/bin/sandbox-observe-tiktok-cs-e2e.mjs

# 需要更详细观测时加 watch 步骤（会顺带拍周期快照）
node .sandbox/bin/sandbox-selfcheck.mjs --source /path/to/seed-worktree/Sasiki-dev \
  --observe-task "打开 TikTok Global Shop 客服页面并检查是否有未读或未分配消息" \
  --refine-task "打开 TikTok Global Shop 客服页面并检查是否有未读或未分配消息" \
  --observe-preset tiktok-shop-customer-service \
  --watch-steps 4 \
  --interval 1500

# 更短命令（在 apps/agent-runtime 下执行）
cd apps/agent-runtime
npm run sandbox:selfcheck -- --source /path/to/seed-worktree/Sasiki-dev \
  --observe-task "打开 TikTok Global Shop 客服页面并检查是否有未读或未分配消息" \
  --refine-task "打开 TikTok Global Shop 客服页面并检查是否有未读或未分配消息" \
  --auto-observe \
  --observe-preset tiktok-shop-customer-service
```

默认配置为 `.sandbox/runtime.config.json`，bootstrap 会基于 `.sandbox/templates/runtime.config.json`
生成并补齐缺失项（`chrome_profile`、`cookies`、`artifacts`）。

`observe / compact / refine` 支持 `--inspect`，`flow` 默认会在 `observe` / `compact` / `refine` 阶段按需截快照。

默认 `runtime.config.json` 的 `cdp.userDataDir` 和 `cdp.cookiesDir` 已改为：
- `~/.sasiki/chrome_profile`
- `~/.sasiki/cookies`

`.sandbox/bin/sandbox-selfcheck.mjs` 还会把每次自检结果写到 `.sandbox/artifacts/selfcheck/<timestamp>/`，包括：
- `selfcheck-report.json`：运行摘要（run id、命令状态、产物路径）
- `bootstrap.log`：bootstrap 过程日志
- `flow.log`：observe/compact/refine 全链路日志
- `cdp-status.log`：最终 CDP 状态快照摘要
- `cdp-final.png`：最终截图
- `cdp-watch.log`（可选）：如果传入 `--watch-steps`，会附带 watch 摘要

## 备注

- `playwright` 观察器内部默认优先用 `playwright-core` + `connectOverCDP`；
  仅用于状态观测，不会启动新的 runtime 会话。
- 产物目录建议继续按 `apps/agent-runtime` 配置中 `runtime.artifactsDir` 约定落在本仓库路径。
