# Long-Task SOP HITL Runtime Loop (2026-03-06)

## 1) Problem Statement
- 高层日志基础层已完成，但 runtime 还没有把失败重试、人工介入、学习记录、恢复执行串成闭环。
- 当前 `run` 一旦失败会直接结束，无法把人工纠偏沉淀为可复用学习记录。
- 目标：在 `run/replay` 链路上实现最小 HITL runtime loop：
  - 自动重试最多 2 次
  - 超预算后请求人工介入
  - 落盘 `intervention_learning.jsonl`
  - 人工修正后从当前浏览器状态恢复执行
- 非目标：本轮不做 `failure_topn.json` 聚合，不做字段对账。

## 2) Boundary & Ownership
- `domain/intervention-learning.ts`
  - 定义学习记录 schema 与 issue type。
- `runtime/run-executor.ts`
  - 管理自动重试、HITL 触发、恢复执行主循环。
- `core/agent-loop.ts`
  - 提供页面观察摘要抓取，作为人工介入前后状态证据。
- `runtime/artifacts-writer.ts`
  - 追加写入 `intervention_learning.jsonl`。
- `infrastructure/hitl/terminal-hitl-controller.ts`
  - 负责 CLI/TTY 下的人工介入采集。
- `runtime/runtime-config.ts`
  - 提供 `hitl.enabled/retryLimit/maxInterventions` 配置并默认关闭。

## 3) Options & Tradeoffs
- Option A（采用）：失败后在同一浏览器状态上进行自动重试，超预算后暂停等待人工处理，再追加 resume prompt 继续。
  - 优点：最贴近“从中断点恢复执行”；实现成本低。
  - 缺点：resume 依赖同一 agent 上下文，日志归因更复杂。
- Option B（拒绝）：人工介入后直接结束 run，仅记录学习结果。
  - 优点：简单。
  - 拒绝原因：不满足 requirement 中“介入后默认恢复执行”。

## 4) Migration Plan
1. 新增 HITL 配置和终端控制器。
2. 为 `ArtifactsWriter` 增加 `intervention_learning.jsonl` 追加写入。
3. `RunExecutor` 改为 attempt loop：
   - 首次执行
   - 失败后最多自动重试 2 次
   - 超预算后进入 HITL
4. 介入前后抓取页面摘要，生成学习记录并落盘。
5. 以 resume prompt 继续执行，保持当前浏览器状态不变。

## 5) Test Strategy
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- 手动验证：
  - `hitl.enabled=false` 时行为保持与旧版一致
  - `hitl.enabled=true` 时失败路径会提示人工介入
  - 介入后生成 `intervention_learning.jsonl`
  - 介入完成后能继续执行并保留 `high_level_logs.json`
