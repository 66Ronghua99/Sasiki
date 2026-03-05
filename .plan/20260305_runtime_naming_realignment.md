# Runtime Naming Realignment (2026-03-05)

## 1) Problem Statement
- `AgentRuntime` 承担了 `run + observe` 两条职责，语义上已不再是纯 Agent 运行时。
- 命名与职责不一致导致边界误解：observe 链路并不依赖 Agent 推理。
- 目标：在保持行为和 CLI 契约不变前提下，完成命名和结构归位。
- 非目标：不改运行策略、不改 artifacts schema、不改 CLI 参数。

## 2) Boundary & Ownership
- `runtime/agent-execution-runtime.ts`
  - 只负责 Agent 执行链路（loop init/run/interrupt/stop）。
- `runtime/observe-runtime.ts`
  - 只负责 Observe 链路（observe/interrupt）。
- `runtime/workflow-runtime.ts`
  - 顶层编排壳，负责 CDP 生命周期和两个子 runtime 组合。
- `runtime/agent-runtime.ts`
  - 兼容导出层，仅作为 `WorkflowRuntime` 的别名导出，避免现有导入断裂。
- `index.ts`
  - 主入口改为显式依赖 `WorkflowRuntime`。

## 3) Options & Tradeoffs
- Option A（采用）：新增 `WorkflowRuntime`，并拆分 agent/observe 子 runtime，保留 `AgentRuntime` 兼容别名。
  - 优点：职责清晰、低回归、平滑迁移。
  - 缺点：短期同时存在两个命名（WorkflowRuntime 与兼容 AgentRuntime）。
- Option B（拒绝）：直接删除 `AgentRuntime` 入口并全量替换。
  - 优点：命名最干净。
  - 拒绝原因：外部潜在调用方可能中断，不符合平滑迁移目标。

## 4) Migration Plan
1. 提取 `AgentExecutionRuntime` 与 `ObserveRuntime`。
2. 引入 `WorkflowRuntime` 组合并迁移 CLI 主入口。
3. 将 `agent-runtime.ts` 改为兼容别名导出。
4. 保持原 `run/observe` 行为不变并通过编译门禁。

回滚点：
- 将 `index.ts` 导入切回 `AgentRuntime`，并恢复原 `runtime/agent-runtime.ts` 实现即可回滚。

## 5) Test Strategy
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- 兼容性检查：`runtime/agent-runtime.ts` 仍提供 `AgentRuntime` 导出。
