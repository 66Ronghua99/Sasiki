# Checklist: Long-Task SOP High-Level Logging Foundation

- [x] 新增高层日志 schema（`read/judge/action/result/intervention`）
- [x] `AgentLoop` 输出 assistant/tool 映射后的高层日志
- [x] `RunExecutor` 注入 runtime 级结果/中断日志
- [x] `ArtifactsWriter` 落盘 `high_level_logs.json`
- [x] `observe` 链路保持无行为回归
- [x] `npm --prefix apps/agent-runtime run typecheck` 通过
- [x] `npm --prefix apps/agent-runtime run build` 通过
