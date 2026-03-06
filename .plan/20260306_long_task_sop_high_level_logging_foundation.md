# Long-Task SOP High-Level Logging Foundation (2026-03-06)

## 1) Problem Statement
- 当前 `run` 链路只有 `runtime.log` 文本日志与 `steps.json` / `assistant_turns.json` / `mcp_calls.jsonl` 原始工件。
- HITL、失败 Top-N、字段对账后续都需要“可直接消费”的统一高层日志抽象，不能继续依赖文本反解析。
- 目标：在不改 `observe` 主流程的前提下，为 `run/replay` 链路新增结构化高层日志，统一覆盖 `read/judge/action/result/intervention` 五类语义。
- 非目标：本轮不实现 HITL 触发逻辑、不实现 `failure_topn.json` 聚合、不扩展 observe 为同规格高层日志。

## 2) Boundary & Ownership
- `core/agent-loop.ts`
  - 负责把 assistant/tool 事件映射为高层日志记录。
- `domain/high-level-log.ts`
  - 定义高层日志契约，作为后续 HITL / failure aggregation 的共享 schema。
- `runtime/run-executor.ts`
  - 负责补充 runtime 级高层事件（如最终结果、人工中断），并与 agent 级日志合并。
- `runtime/artifacts-writer.ts`
  - 负责落盘 `high_level_logs.json`。
- `runtime/observe-executor.ts`
  - 本轮不接入同规格高层日志，只保留现有轻量 `runtime.log` 事件。

## 3) Options & Tradeoffs
- Option A（采用）：新增独立结构化工件 `high_level_logs.json`，由 agent/runtime 双源合并生成。
  - 优点：后续 HITL 与 Top-N 可直接消费；避免解析 `runtime.log`。
  - 缺点：与 `steps.json` / `assistant_turns.json` 存在一定信息重叠。
- Option B（拒绝）：继续只增强 `runtime.log` 文本格式。
  - 优点：改动最少。
  - 拒绝原因：后续需要语义聚合与 resume 逻辑，文本日志不可维护。
- Option C（拒绝）：同时改 `run + observe` 两条链路。
  - 优点：抽象更统一。
  - 拒绝原因：超出本轮最小闭环，且不服务当前 P0 Gate。

## 4) Migration Plan
1. 新增高层日志契约：`stage/status/source/summary/detail/...`
2. `AgentLoop` 将 assistant/tool 生命周期映射为高层日志：
   - assistant `message_end` -> `read` / `judge`
   - tool start/end -> `action` / `result`
3. `RunExecutor` 注入 runtime 级日志：
   - graceful interrupt -> `intervention`
   - run finish/fail -> `result`
4. 合并并落盘 `artifacts/e2e/{run_id}/high_level_logs.json`
5. 保持 `observe` 不变，避免跨阶段扩散

回滚点：
- 删除 `high_level_logs.json` 写入与对应 schema，不影响既有运行主链路。

## 5) Test Strategy
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- 手动验证：
  - `run` 成功后生成 `high_level_logs.json`
  - 中断/失败路径仍能保留已产生的高层日志
  - 记录中至少可见 `read/judge/action/result`；人工中断时可见 `intervention`
