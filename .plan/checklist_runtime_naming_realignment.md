# Checklist: Runtime Naming Realignment

- [x] 新增 `AgentExecutionRuntime`（run-only）
- [x] 新增 `ObserveRuntime`（observe-only）
- [x] 新增 `WorkflowRuntime`（组合编排）
- [x] `index.ts` 主入口改为 `WorkflowRuntime`
- [x] `agent-runtime.ts` 保留兼容导出
- [x] `npm --prefix apps/agent-runtime run typecheck` 通过
- [x] `npm --prefix apps/agent-runtime run build` 通过
