执行 Replay + Online Refinement `Slice-1` 最小实现：
- 以上一阶段 `compact_capability_output` 为输入，按 `.plan/20260312_replay_refinement_online_design.md` 的 Option B 接线 sidecar orchestrator
- 首期仅支持 pinned `--sop-run-id` + 单 benchmark（小红书 creator 长文草稿保存，无图片）
- 必须先打通 artifacts 闭环：`refinement_steps.jsonl`、`consumption_bundle.json`、`refinement_knowledge.jsonl`（有 HITL 时）
- 保持兼容：`refinement.enabled=false` 时 run 行为不变
- 完成后回写 `.plan/checklist_replay_refinement_online.md` 与 `PROGRESS/MEMORY`
