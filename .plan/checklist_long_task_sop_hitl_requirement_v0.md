# Checklist: long_task_sop_hitl_requirement_v0

- [x] 读取并对齐 `PROGRESS.md` / `MEMORY.md` / `NEXT_STEP.md`
- [x] 冻结阶段目标：仅优化 SOP 沉淀质量，不做检索优化
- [x] 冻结任务场景：电商单页上架
- [x] 冻结任务时间约束：单任务总时长上限 10 分钟
- [x] 冻结重试约束：单点最多重试 2 次，失败或不确定进入 HITL
- [x] 冻结最终验收：纯自动 `3/3`（HITL 不计入最终成功）
- [x] 冻结成功证据三件套：成功提示 + 最终截图 + 关键字段回读
- [x] 冻结多标签策略：记录 warning，不直接判失败
- [x] 冻结 HITL 后行为：默认从中断点恢复执行
- [x] 冻结学习沉淀原则：语义抽象、自然语言可读、非 step-id 绑定
- [x] 冻结失败分析：每 3 次运行输出 Top-N 易错点
- [x] 输出 Requirement v0 文档到 `.plan/`

- [x] 实现统一高层日志抽象（读取/判断/动作/结果/介入）
- [ ] 接入 HITL 触发与恢复控制（2 次重试后介入）
- [ ] 落盘 `intervention_learning.jsonl`（按 schema v0）
- [ ] 落盘 `failure_topn.json`（每 3 次运行窗口）
- [ ] 增加字段对账工件（输入变量 vs 页面实际值）
- [ ] 完成 SOP v1/v2/v3 三轮迭代与证据归档
- [ ] 达成最终 gate：纯自动 `3/3` 通过
