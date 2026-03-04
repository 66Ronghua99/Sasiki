# Pi Agent Core Migration Design (2026-03-04)

## 1. Problem Statement
当前 Node runtime 仍使用自研 `AgentLoop`，与目标“复用 pi-mono 稳定 agent loop，仅专注业务复刻流程”不一致。
约束：保持 Playwright MCP 兼容、保持现有 RuntimeConfig 接口、不回退到 Python 主链路。
非目标：本次不完成完整点赞 E2E，仅完成 loop 引擎替换与可运行链路。

## 2. Boundary & Ownership
- `pi-agent-core` 负责：消息循环、tool-call 驱动、事件流。
- 本仓库业务层负责：
  - MCP 连接与工具调用适配
  - 系统提示词（流程复刻策略）
  - 运行时配置与日志
- 单一真相源：MCP 工具 schema 来自 `PlaywrightMcpStdioClient.listTools()`。

## 3. Options & Tradeoffs
- 方案 A（采用）：接入 `@mariozechner/pi-agent-core`，通过自定义 `AgentTransport` 复用已有 MCP tool adapter。
  - 优点：最大化复用成熟 loop；保留现有运行时抽象。
  - 代价：需要写一层 transport/tool mapping 适配。
- 方案 B（拒绝）：继续自研 `AgentLoop` 并补齐稳定性。
  - 拒绝理由：重复造轮子，后续维护成本高，偏离迁移目标。

## 4. Migration Plan
1. 依赖切换到 `@mariozechner/pi-agent-core`。
2. 新增 `PiAgentCoreLoop`（类）封装 agent-core 运行。
3. `MigrationRuntime` 从 `AgentLoop` 切换到 `PiAgentCoreLoop`。
4. 删除不再使用的 fallback 组件与失效说明。
5. 更新 `PROGRESS.md`/`AGENTS.md`/runtime README。

回滚点：保留原 `AgentLoop` 文件直到本次 typecheck 通过；若失败可回切构造器接线。

## 5. Test Strategy
- 单元/编译：`npm --prefix apps/agent-runtime run typecheck`。
- Python 基线门禁：`uv run ruff check src tests`、`uv run mypy src`、`uv run pytest -q`。
- 验收标准：
  - Node runtime 编译通过
  - 运行路径中不再依赖 `RuleBasedPlanner`
  - 文档与代码一致标明 loop 已迁移到 `pi-agent-core`
