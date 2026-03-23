# Refine Runtime E2E Runbook: 百度搜索咖啡豆并点击第一条结果

## 目标

固定一条更轻量、可重复执行的真实端到端流程：
- 打开百度
- 搜索“咖啡豆”
- 点击第一页搜索结果中的第一条链接

本 runbook 的重点仍然是固定本地默认执行链路：
- 系统 Chrome 二进制
- `~/.sasiki/chrome_profile` 持久化 profile
- `~/.sasiki/cookies/*.json` cookie 注入

同时继续避免本地代理把 `127.0.0.1:9222` 误走代理，导致 CDP 探活或浏览器接管失败。

## 为什么切换到这条流程

这条 e2e 比小红书长文草稿保存更轻：
- 不依赖登录态才能完成核心路径
- 页面结构更简单，失败面更小
- 更适合做 refine smoke e2e 和 bridge / hook telemetry 回归检查

## 已验证基线

- 最近一次成功 run：`20260322_002735_676`（2026-03-22）
- 证据目录：`artifacts/e2e/20260322_002735_676/`
- 关键成功信号：`run_summary.json` 中 `status=completed`，且 `event_stream.jsonl` 中能看到搜索与点击结果页相关动作，以及 `run.finish`

## 前置条件

1. 本机存在可用系统 Chrome（默认 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`）。
2. 本地持久化 profile 可用（默认 `~/.sasiki/chrome_profile`）。
3. 若本地 runtime config 默认启用 cookies 注入，则 `~/.sasiki/cookies/*.json` 目录存在即可；此流程本身不依赖登录态。
4. 已完成构建（或本轮先执行 build）。
5. Playwright MCP 可正常拉起。
6. 运行环境必须提供可用模型配置：
   - 基于 `apps/agent-runtime/runtime.config.example.json` 准备的本地 runtime config 文件，或
   - shell 环境中的 `LLM_*` / `DASHSCOPE_*` / `OPENROUTER_*` 相关变量。

## 标准执行流程

### 0) 本地 runtime config 约定

本仓库后续默认按以下本地配置执行 refine e2e：

```json
{
  "cdp": {
    "endpoint": "http://127.0.0.1:9222",
    "launch": true,
    "userDataDir": "~/.sasiki/chrome_profile",
    "injectCookies": true,
    "cookiesDir": "~/.sasiki/cookies",
    "preferSystemBrowser": true,
    "executablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "headless": false
  }
}
```

说明：
1. 默认优先系统 Chrome，不再默认复用 Playwright bundled Chrome。
2. `.sasiki/chrome_profile` 是 Sasiki 专用持久化 profile，不是系统默认个人浏览器 profile。
3. Playwright bundled Chrome 如需继续使用，必须配独立 profile；不要再直接复用 `.sasiki/chrome_profile`。

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
node apps/agent-runtime/dist/index.js \
  --config apps/agent-runtime/runtime.config.json \
  refine \
  "打开百度搜索咖啡豆，点击第一条搜索结果链接。"
```

### 4) 记录本次 run_id

```bash
RUN_ID=$(ls -1t artifacts/e2e | head -n1)
echo "$RUN_ID"
```

### 5) 验收检查

```bash
sed -n '1,200p' "artifacts/e2e/${RUN_ID}/run_summary.json"
rg -n '"toolName":"run.finish"|"toolName":"act.click"|"toolName":"act.type"|"toolName":"act.press"|"toolName":"act.navigate"' "artifacts/e2e/${RUN_ID}/event_stream.jsonl"
```

通过标准：
1. `run_summary.json` 中 `status` 为 `completed`。
2. `event_stream.jsonl` 中存在 `toolName":"run.finish"` 且对应 `phase":"end"`。
3. `event_stream.jsonl` 中能看到搜索输入/提交和结果点击相关动作；至少出现一次搜索动作与一次结果页推进动作。

## Telemetry 检查重点

这条 smoke e2e 的关注点不是业务深度，而是 bridge / hook telemetry 是否还健康：
1. `event_stream.jsonl` 中应能看到完整的工具调用闭环，而不是只到中途 observation。
2. `run.finish` 应该在完成时落到事件流与 `run_summary.json`。
3. 若点击第一条结果后发生页面跳转，不应出现无穷重复的 stale observation / stale tab 自恢复循环。

可重点查看：
- `artifacts/e2e/<run_id>/event_stream.jsonl`
- `artifacts/e2e/<run_id>/run_summary.json`
- `artifacts/e2e/<run_id>/agent_checkpoints/`

## 常见故障与处理

### 问题 1：CDP `/json/version` 报 400 或连接异常

典型表现：
- `Unexpected status 400`
- 运行日志出现 `ERR_FAILED` / `ERR_CONNECTION_REFUSED` 到 `127.0.0.1:9222`

处理步骤：
1. 用本 runbook 的探活命令复测（必须显式 `NO_PROXY/no_proxy`）。
2. 执行 e2e 时使用推荐命令（`env -u ...proxy` + `NO_PROXY`）。
3. 若仍失败，检查本机代理工具是否开启了全局代理，先切换到规则模式或直连本地地址后重试。

### 问题 2：模型没有真正推进到结果点击

典型表现：
- 只停留在百度首页或结果页 observation
- 迟迟没有 `run.finish`

处理步骤：
1. 检查 `event_stream.jsonl` 是否有搜索输入和提交动作。
2. 检查结果页是否成功产出新的 observation。
3. 若出现 stale observation / stale tab guard，优先检查点击后的页面身份是否及时刷新。

### 问题 3：Playwright bundled Chrome 在启动后 `socket hang up` / `ECONNRESET`

典型表现：
- `browserType.connectOverCDP: socket hang up`
- `browserType.connectOverCDP: read ECONNRESET`

处理步骤：
1. 优先切回本 runbook 的默认路径：系统 Chrome + `~/.sasiki/chrome_profile`。
2. 不要让 bundled Chrome 直接复用 `.sasiki/chrome_profile`。
3. 若必须使用 bundled Chrome，给它单独的 `userDataDir`，不要和系统 Chrome 共用 profile。

## 交付记录模板

每次执行后至少记录：
1. `run_id`
2. 最终状态（`completed` / `failed`）
3. 关键证据路径（`run_summary.json`、`event_stream.jsonl`、`agent_checkpoints/`）
4. 是否触发 proxy / stale observation / bridge-hook telemetry 异常以及最终处理方式
