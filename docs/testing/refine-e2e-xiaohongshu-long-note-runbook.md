# Refine Runtime E2E Runbook: 小红书长文草稿保存

## 目标

固定一条可重复执行的真实端到端流程：
- 打开小红书创作服务平台
- 创建一条长文笔记草稿（正文可空）
- 填写任意标题
- 点击“暂存离开”并确认保存成功

本 runbook 的重点是避免本地代理把 `127.0.0.1:9222` 误走代理，导致反复失败。

## 已验证基线

- 最近一次成功 run：`20260320_152942_514`（2026-03-20）
- 证据目录：`artifacts/e2e/20260320_152942_514/`
- 关键成功信号：`refine_run_summary.json` 中 `status=completed`，且摘要包含“保存成功”。

## 前置条件

1. 已启动可用 Chromium CDP（默认 `http://127.0.0.1:9222`）。
2. 本地 cookies 可用（默认 `~/.sasiki/cookies/*.json`）。
3. 已完成构建（或本轮先执行 build）。
4. Playwright MCP 可正常拉起。
5. 运行环境必须提供可用模型配置：
   - 基于 `apps/agent-runtime/runtime.config.example.json` 准备的本地 runtime config 文件，或
   - shell 环境中的 `LLM_*` / `DASHSCOPE_*` / `OPENROUTER_*` 相关变量。
   否则流程可能在首轮前卡住，浏览器已启动但不会产出新的 `run_id` 工件。

## 标准执行流程

### 1) 先做 CDP 探活（必须带 NO_PROXY）

```bash
NO_PROXY=localhost,127.0.0.1,::1 no_proxy=localhost,127.0.0.1,::1 \
curl -sS http://127.0.0.1:9222/json/version
```

通过标准：输出中包含 `webSocketDebuggerUrl`。

### 2) 构建 runtime

```bash
npm --prefix apps/agent-runtime run build
```

### 3) 执行 e2e（推荐命令，内置 proxy 防护）

```bash
env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
NO_PROXY=localhost,127.0.0.1,::1 no_proxy=localhost,127.0.0.1,::1 \
REFINEMENT_ENABLED=true \
node apps/agent-runtime/dist/index.js "打开小红书创作服务平台，创建一条长文笔记草稿（不要发布），填写任意标题后点击暂存离开；正文可留空。"
```

### 4) 记录本次 run_id

```bash
RUN_ID=$(ls -1t artifacts/e2e | head -n1)
echo "$RUN_ID"
```

### 5) 验收检查

```bash
sed -n '1,200p' "artifacts/e2e/${RUN_ID}/refine_run_summary.json"
sed -n '1,220p' "artifacts/e2e/${RUN_ID}/steps.json"
sed -n '1,220p' "artifacts/e2e/${RUN_ID}/refine_action_executions.jsonl"
```

通过标准：
1. `refine_run_summary.json` 中 `status` 为 `completed`。
2. `steps.json` 中存在 `run.finish` 且 `reason=goal_achieved`。
3. `refine_action_executions.jsonl` 中能看到标题输入与“暂存离开”点击，且快照包含“保存成功”或草稿箱新增记录。

## Tab/Context 一致性检查（Refine React 新约束）

如果流程中出现新开 tab，额外检查：
1. 是否出现 `act.select_tab`（主动切到目标 tab）。
2. 若未切 tab，是否出现 stale-tab guard 的显式失败（而不是静默成功）。
3. 在关键动作前，`observe.page` 的 `page.url` 与 active tab 应一致。

可重点查看：
- `artifacts/e2e/<run_id>/steps.json`
- `artifacts/e2e/<run_id>/refine_browser_observations.jsonl`
- `artifacts/e2e/<run_id>/refine_action_executions.jsonl`

## 常见故障与处理

### 问题 1：CDP `/json/version` 报 400 或连接异常

典型表现：
- `Unexpected status 400`（访问 `http://127.0.0.1:9222/json/version/`）
- 运行日志出现 `ERR_FAILED` / `ERR_CONNECTION_REFUSED` 到 `127.0.0.1:9222`

处理步骤：
1. 用本 runbook 的探活命令复测（必须显式 `NO_PROXY/no_proxy`）。
2. 执行 e2e 时使用推荐命令（`env -u ...proxy` + `NO_PROXY`）。
3. 若仍失败，检查本机代理工具是否开启了全局代理，先切换到规则模式或直连本地地址后重试。

### 问题 2：落到登录页 `/login`，无法进入发布页

处理步骤：
1. 检查 cookies 是否过期。
2. 在目标浏览器实例先手工登录一次，再重跑。

### 问题 3：出现重复 HITL，流程不前进

典型表现：持续 `hitl.request`（`uncertain_state`）但无有效动作。

处理步骤：
1. 先确认浏览器里是否有未关闭的系统弹窗（如 file chooser）。
2. 人工关闭弹窗后再继续恢复执行。

## 交付记录模板

每次执行后至少记录：
1. `run_id`
2. 最终状态（`completed` / `failed`）
3. 关键证据路径（`refine_run_summary.json`、`steps.json`、`refine_action_executions.jsonl`）
4. 是否触发 proxy 相关问题以及最终处理方式
