# Checklist: SOP Compact V1 Full-Chain Shift

## Design Freeze
- [x] 已记录当前三类核心问题及根因
- [x] 已明确“下一步全链路转向 V1”的方向
- [x] 已冻结 deterministic / model / HITL 的新责任边界
- [x] 已冻结 `execution_guide` 需要同时具备 `generalPlan + detailContext`
- [x] 已冻结 `clarification_questions` 必须 agent-owned
- [x] 已冻结 V1 replay 主链路迁移顺序

## Evidence
- [x] `.plan/20260309_sop_compact_v1_full_chain_shift.md` 已落盘
- [x] 当前问题有样本证据：`artifacts/e2e/20260308_110124_276/*`
- [x] 当前主设计引用仍保留：`.plan/20260308_sop_compact_behavior_semantics_split_v1.md`
- [x] `run_id=20260308_110124_276` 已在 tightened `semantic_intent` prompt 下重新生成 `semantic_intent_draft.json` / `clarification_questions.json`，问题集足够清晰，可作为 Phase-3 输入
- [x] `run_id=20260308_110124_276` 已生成 `execution_guide.v1`，并确认其包含 `generalPlan + detailContext`

## Implementation
- [x] 移除 `clarification_questions` 模板补齐
- [x] 建立 `blockingUncertainties -> clarification_questions` coverage gate
- [x] 定义 `execution_guide.v1` 的 `generalPlan + detailContext` schema
- [x] 切换 `execution_guide` 编译入口到 V1 artifacts
- [x] 将 V0 `decision_model/workflow_guide` 从 replay 主链路中降级为兼容参考

## Quality Gates
- [x] 本轮仅做文档同步，不误报代码已完成
- [x] 进入实现后通过 `npm --prefix apps/agent-runtime run typecheck`
- [x] 进入实现后通过 `npm --prefix apps/agent-runtime run build`
