# Checklist: Long-Task SOP HITL Runtime Loop

- [x] 新增 HITL 配置与终端控制器
- [x] `RunExecutor` 接入自动重试预算（最多 2 次）
- [x] 超预算后触发人工介入并允许恢复执行
- [x] 落盘 `intervention_learning.jsonl`
- [x] 介入前后采集页面状态摘要
- [x] `hitl.enabled=false` 保持兼容
- [x] `npm --prefix apps/agent-runtime run typecheck` 通过
- [x] `npm --prefix apps/agent-runtime run build` 通过
