# Checklist: SOP Compact Behavior / Semantics Split v1

## Design Freeze
- [x] 已归档 V0 设计文档并给出替代路径
- [x] 已说明 V0 归档原因
- [x] 已冻结 deterministic / agent / HITL 的责任边界
- [x] 已冻结 V1 artifact split
- [x] 已冻结 `execution_guide.json` 继续作为唯一 replay-facing guide
- [x] 已冻结从核心 schema 中移除 `TargetEntity/GoalType` 的方向
- [x] 已写明 V0 -> V1 的迁移计划

## Evidence
- [x] `.plan/20260308_sop_compact_behavior_semantics_split_v1.md` 已落盘
- [x] `.plan/20260308_sop_compact_intent_abstraction_v0.md` 已加 archive note
- [x] `.plan/checklist_sop_compact_intent_abstraction_v0.md` 已加 archive note
- [x] `PROGRESS.md` 已切换当前主指针到 V1
- [x] `NEXT_STEP.md` 已切换到 V1 review
- [x] `MEMORY.md` 已补充 V0 归档原因

## Implementation
- [x] 新增 `behavior_evidence.v1` domain contract
- [x] 新增 `behavior_workflow.v1` domain contract
- [x] 新增 `semantic_intent_draft.v1` domain contract
- [x] 接入 `semantic_intent_draft.json` 生成与落盘
- [ ] 重写 `execution_guide.v1` contract
- [ ] 重写 `sop-compact` 编排链路到 V1 artifacts
- [ ] 移除 V0 中 `TargetEntity/GoalType` 对 replay schema 的核心驱动

## Quality Gates
- [x] 本轮为文档冻结，不把 V1 误标成已实现
- [x] V1 Phase-0 行为层双写未替换 V0 replay 链路
- [x] V1 Phase-1 样本 `run_id=20260308_110124_276` 已生成 `semantic_intent_draft.json`
- [x] 如进入代码实现，必须通过 `npm --prefix apps/agent-runtime run typecheck`
- [x] 如进入代码实现，必须通过 `npm --prefix apps/agent-runtime run build`
