# PROGRESS

## Current Milestone
- `M0 (Done)`: Python 最小 Agent Loop 已打通，可进入网页、执行搜索、打开帖子。
- `M1 (In Progress)`: 一次性迁移到 `Node + pi-agent-core + Playwright MCP` 主链路。
- `M2 (Target)`: 达成完整业务闭环：启动 CDP Chromium、注入 Cookie、打开小红书、搜索、打开帖子、点赞、截图。

## DONE
- 明确迁移架构：Node 主进程负责 agent loop，Python 退出主链路。
- 明确工具策略：直接接入 Playwright MCP，不重复实现工具协议层。
- 明确迁移验收口径：以“点赞 + 截图闭环”作为迁移成功标准，而非仅“打开帖子”。
- 已创建 `apps/agent-runtime` 迁移骨架，并完成核心类抽象：
  - `PiAgentCoreLoop`
  - `ModelResolver`
  - `McpToolAdapter`
  - `PlaywrightMcpStdioClient`
  - `MigrationRuntime`
- 已将 runtime 主链路切换为 `@mariozechner/pi-agent-core`，移除自研 planner loop 依赖。

## TODO
- `P0` 完成 E2E 闭环能力：小红书搜索、进帖、点赞、截图。
- `P0` 固化稳定性策略：超时、重试、stall 检测、失败原因枚举。
- `P1` 为 `PiAgentCoreLoop` 增加工件落盘（`steps.json`, `mcp_calls.jsonl`, `runtime.log`）。
- `P1` 替换默认运行入口到 Node runtime。
- `P1` 保留旧 Python 入口一个迁移窗口，仅输出迁移提示。
- `P2` 按需恢复 Python 子进程工具能力（仅在必要的 Python 生态场景）。

## Migration Success Criteria
- 单次执行必须完整通过以下链路：
  1. 启动 CDP Chromium
  2. 注入 Cookie
  3. 打开小红书
  4. 搜索关键词
  5. 打开目标帖子
  6. 点赞
  7. 截图落盘
- 连续 `20/20` 轮通过视为功能迁移成功。

## Evidence Requirements
- 每次运行输出 `run_id`。
- 每次运行至少保存：
  - `steps.json`
  - `mcp_calls.jsonl`
  - `final.png`
  - `runtime.log`
