# PROGRESS

## Doc Ownership
- `PROGRESS.md` 只记录：里程碑、DONE/TODO 状态、执行参考链接。
- `MEMORY.md` 记录：经验总结、踩坑根因、排障与约定。

## Current Milestone
- `M1 (Done)`: 已完成 `Node + pi-agent-core + Playwright MCP` 主链路切换。
- `M2 (Done)`: 达成完整业务闭环：启动 CDP Chromium、注入 Cookie、打开小红书、搜索、打开帖子、点赞、截图。

## Ultimate Goal
- 解决用户在浏览器上的长程 SOP 复刻问题：面对千差万别的需求，优先通过“看用户做一次（Watch Once）→ 学习关键动作序列 → 在后续任务中自动复现并持续优化”来达成稳定执行。

## Requirement References (Load First)
- Watch-Once v0 设计评审稿：`.plan/20260304_watch_once_v0_design.md`
- Watch-Once v0 正式 PRD：`.plan/20260304_watch_once_v0_prd.md`
- Watch-Once v0 工程开发交接稿（逐文件接口）：`.plan/20260304_watch_once_v0_engineering_handoff.md`
- Watch-Once PR-1 Contract Foundation 实施记录：`.plan/20260304_watch_once_pr1_contract_foundation.md`
- Watch-Once PR-2 Observe Baseline 实施记录：`.plan/20260304_watch_once_pr2_observe_baseline.md`
- Watch-Once PR-2.1 Compact + Multi-Tab 实施记录：`.plan/20260305_watch_once_pr2_1_compact_multitab.md`
- 历史设计决策与检查清单：`.plan/*.md`
- 建议加载顺序：
  1. `PROGRESS.md`
  2. `MEMORY.md`
  3. `NEXT_STEP.md`
  4. `.plan/20260304_watch_once_v0_prd.md`
  5. `.plan/20260304_watch_once_v0_engineering_handoff.md`

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
- 已升级 agent system prompt（身份/能力/观察-行动-验证循环）并新增 `llm.thinkingLevel` 配置，支持输出可复盘的 assistant 思考内容。
- 已接入 Node 侧 cookie 注入：从 `~/.sasiki/cookies/*.json` 读取并在 CDP 上下文注入（默认开启）。
- 已完成模型与 OpenAI-compatible endpoint 兼容性治理（映射、错配预警、`developer role` 兼容、DashScope 默认模型策略）。
- 已补齐模型诊断与可观测性（`configured/final model` 解析日志、`llm_failed_before_mcp` 标记）。
- 已增强运行稳定性（中断快速落盘、`runtime.log` 保留、MCP 结果不截断）。
- 已新增 `assistant_turns.json` 工件，按回合落盘 assistant 的 `thinking/text/toolCalls/stopReason`，用于后续 SOP 复刻分析。
- 已完善浏览器生命周期管理（`runtime.stop()` 优先 `Browser.close`，失败时回退本进程 `SIGTERM`）与启动日志降噪。
- 已完成一次真实链路验证：可打开小红书、跳转、搜索、打开帖子、截图；点赞动作仍不稳定，且存在中间误操作。
- 已清理 Python 旧实现与依赖清单（`src/`、`tests/`、`pyproject.toml`、`uv.lock`），仓库主线收敛为 Node runtime。
- 已新增 PM 技能 `skills/drive-pm-closed-loop`：可将需求讨论收敛为“可执行、可验证”的最小闭环，并提供结构化迭代模板。
- 已新增 PM 技能 `skills/pm-progress-requirement-discovery`：可基于 `PROGRESS/.plan/MEMORY/NEXT_STEP` 提出高价值澄清问题并收敛当前需求。
- 已新增 Watch-Once v0 工程开发交接文档：`.plan/20260304_watch_once_v0_engineering_handoff.md`（含逐文件接口草案、错误码、开发顺序与验收口径）。
- 已完成 Watch-Once PR-1 Contract Foundation：
  - 新增 `apps/agent-runtime/src/domain/sop-trace.ts`（`SopTrace` 契约 + `validateSopTrace` 校验）
  - 新增 `apps/agent-runtime/src/domain/sop-asset.ts`（`SopAsset`/`SopAssetQuery` 契约）
  - 新增 `apps/agent-runtime/src/domain/runtime-errors.ts`（统一 runtime 错误码）
  - 扩展 `apps/agent-runtime/src/runtime/artifacts-writer.ts`，支持示教 4 工件写入与路径接口
  - 扩展 `apps/agent-runtime/src/runtime/runtime-config.ts`，补齐 `observe.timeoutMs` 与固定 `sopAssetRootDir` 配置基础
- 已完成 Watch-Once PR-2 Observe Baseline 代码接线：
  - CLI 支持 `--mode run|observe`（默认 run）
  - `AgentRuntime` 新增 `observe(taskHint)`，并实现 run/observe 初始化隔离（observe 不强依赖 LLM/MCP 初始化）
  - 新增 `playwright-demonstration-recorder.ts`（CDP 单标签示教采集 + 多标签告警）
  - 新增 `sop-demonstration-recorder.ts`（raw -> trace/draft/webElementHints）
  - 新增 `sop-asset-store.ts`（`~/.sasiki/sop_assets/index.json` upsert/search/getById）
  - observe 路径可落盘 `demonstration_raw.jsonl` / `demonstration_trace.json` / `sop_draft.md` / `sop_asset.json`
- 已完成 Watch-Once PR-2.1 录制优化：
  - 多标签录制由“失败中断”改为“可记录”，每条 raw event 与 trace step 带 `tabId`
  - 新增手动后处理命令：`sop-compact --run-id <id>`
  - `sop-compact` 输出单文件 `sop_compact.md`（high-level 自然语言步骤 + 显式切 tab 步骤 + 关键 hints）
  - 默认 artifacts 目录统一到仓库根 `artifacts/e2e`（避免在不同 cwd 下落到不同路径）
- 已将复用性经验与踩坑规则沉淀到 `MEMORY.md`，后续新增经验统一更新 MEMORY。

## TODO
- `P0-NEXT` Watch-Once PR-2.1 实测验收：跑一条含多 tab 的 observe + `sop-compact`，确认 `tabId` 标记、显式切 tab 步骤与 high-level 压缩质量符合预期。
- `P0` 完成 E2E 闭环能力：小红书搜索、进帖、点赞、截图。
- `P0` 优化任务 prompt 与动作约束，降低误操作并提升点赞动作成功率。
- `P0` 固化稳定性策略：超时、重试、stall 检测、失败原因枚举。
- `P1` 补齐 `final.png` 截图成功率与参数兼容（不同 Playwright MCP 版本参数差异）。
- `P1` 替换默认运行入口到 Node runtime。
- `P2` 增加最小可回归的 Node 侧自动化测试（配置加载、模型解析、MCP 调用记录）。
