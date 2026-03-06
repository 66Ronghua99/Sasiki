# Checklist: watch_once_pr3_phase3a_pinned_runid

- [x] 读取并对齐 `PROGRESS.md` / `MEMORY.md` / `NEXT_STEP.md`
- [x] 输出 Phase-3A 设计文档（Problem / Boundary / Options / Migration / Test）
- [x] CLI 增加 `--sop-run-id` 并允许 run 无 task（仅 pinned 场景）
- [x] Runtime run 请求改为 `AgentRunRequest`（兼容 task-only）
- [x] Consumption 新增 pinned 解析路径（`assetId = sop_<run_id>`）
- [x] pinned 场景支持 task 为空时回退到 `asset.taskHint`
- [x] Guide 优先级更新为 semantic -> compact -> draft
- [x] `sop_consumption.json` 增加 `selectionMode/taskSource/pinnedRunId`
- [x] `runtime.log` 增加 pinned 相关日志字段
- [x] README 更新 deterministic run 用法与证据说明
- [x] 真实链路 AC 抽样（pinned hit / pinned miss / pinned no-task）
- [x] typecheck 通过
- [x] build 通过
