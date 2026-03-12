执行 Replay + Online Refinement `Slice-2` 验证闭环：
- 目标：把 `20260313_011336_096` / `20260313_011652_024` 的 Slice-1 结果推进到“可验证收益”阶段
- 必做一：跑两轮同任务 benchmark（小红书长文草稿保存），确保第二轮任务成功且 `knowledge_loaded_count>0`
- 必做二：触发至少一条 `promoteDecision=promote`，验证 `refinement_knowledge.jsonl` 含 `rationale + critic_challenge + final_decision`
- 必做三：复核第二轮 `consumption_bundle.tokenEstimate <= 第一轮 * 0.8`
- 证据回写：`.plan/checklist_replay_refinement_online.md`、`PROGRESS.md`、`MEMORY.md`
