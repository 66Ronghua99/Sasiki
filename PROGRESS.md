# PROGRESS

## Current Milestone
- `M1 (Done)`: 已完成 `Node + pi-agent-core + Playwright MCP` 主链路切换。
- `M2 (Target)`: 达成完整业务闭环：启动 CDP Chromium、注入 Cookie、打开小红书、搜索、打开帖子、点赞、截图。

## DONE
- 明确迁移架构：Node 主进程负责 agent loop，Python 退出主链路。
- 明确工具策略：直接接入 Playwright MCP，不重复实现工具协议层。
- 明确迁移验收口径：以“点赞 + 截图闭环”作为迁移成功标准，而非仅“打开帖子”。
- 已创建 `apps/agent-runtime` 迁移骨架，并完成核心类抽象：
  - `AgentLoop`
  - `ModelResolver`
  - `McpToolBridge`
  - `McpStdioClient`
  - `AgentRuntime`
- 已将 runtime 主链路切换为 `@mariozechner/pi-agent-core`，移除自研 planner loop 依赖。
- 已接入运行工件闭环基础能力：每次运行生成 `run_id`，并落盘 `steps.json`、`mcp_calls.jsonl`、`runtime.log`，同时尝试输出 `final.png`。
- 已补齐 Node 侧 CDP 自动启动（默认本地 endpoint），并修复 MCP tool schema 与 `pi-agent-core` 校验兼容问题（移除 `$schema`/`$id`）。
- 已支持 `runtime.config.json` 配置加载（模型/MCP/CDP/工件目录），并支持 `--config`/`RUNTIME_CONFIG_PATH` 指定配置文件。
- 已接入 Node 侧 cookie 注入：从 `~/.sasiki/cookies/*.json` 读取并在 CDP 上下文注入（默认开启）。
- 已增强模型解析兼容：支持 `openai/MiniMax-*` 自动映射到 `minimax`，并在配置 `baseUrl` 时允许 OpenAI-compatible 自定义模型名。
- 已修复 `baseUrl` 场景协议误判：配置 OpenAI-compatible `baseUrl` 时，不再执行 `MiniMax` provider 自动映射，避免 Anthropic API 路径 404。
- 已新增模型加载诊断日志：输出 `configuredModel/configuredBaseUrl` 与最终 `provider/api/baseUrl`，并在未进入 MCP 时标记 `llm_failed_before_mcp`。
- 已调整运行日志保留策略：`runtime.log` 不再在 `run()` 开始时清空，启动阶段与模型解析日志可完整回放。
- 已增加模型-端点错配预警：`DashScope + MiniMax` 组合将输出 `model_baseurl_mismatch_possible` 提示，并将 OpenAI-compatible 自定义模型优先走 `openai-completions`。
- 已修复 OpenAI-compatible `developer` role 兼容：非 OpenAI 官方 baseUrl 强制 `supportsDeveloperRole=false`，避免 DashScope `messages[0].role=developer` 的 400 报错。
- 已调整默认模型选择：当 `baseUrl` 为 DashScope 时默认使用 `openai/qwen-plus`，示例配置同步更新，降低默认错配概率。
- 已完成一次真实链路验证：可打开小红书、跳转、搜索、打开帖子、截图；点赞动作仍不稳定，且存在中间误操作。
- 已清理浏览器选择日志噪音：`cdp_launch_browser_selected` 仅输出最终选中浏览器来源，避免 system/playwright 双日志误导。
- 已清理 Python 旧实现与依赖清单（`src/`、`tests/`、`pyproject.toml`、`uv.lock`），仓库主线收敛为 Node runtime。

## TODO
- `P0` 完成 E2E 闭环能力：小红书搜索、进帖、点赞、截图。
- `P0` 优化任务 prompt 与动作约束，降低误操作并提升点赞动作成功率。
- `P0` 固化稳定性策略：超时、重试、stall 检测、失败原因枚举。
- `P1` 补齐 `final.png` 截图成功率与参数兼容（不同 Playwright MCP 版本参数差异）。
- `P1` 替换默认运行入口到 Node runtime。
- `P2` 增加最小可回归的 Node 侧自动化测试（配置加载、模型解析、MCP 调用记录）。

## Closed-Loop Success Criteria
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
