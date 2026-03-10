# Checklist: Interactive Reasoning SOP Compact

## Design Freeze
- [x] 已冻结 `compact_session_state` 最小 contract
- [x] 已冻结 `compact_session_patch` 最小 contract
- [x] 已冻结 `compact_capability_output` 最小 contract
- [x] 已冻结 `human loop tool` 最小接口
- [x] 已冻结 `patch apply` 规则
- [x] 已冻结 `finalize` 规则
- [x] 已冻结多轮 runtime flow
- [x] 已冻结 `hard limit = 6` 的边界
- [x] 已冻结 `Slice 1` 最小实现范围

## Migration
- [x] 归档旧 compact 语义主链设计文档
- [x] 标记旧 compact 语义主链 checklist 为 archived
- [x] 从 `PROGRESS.md` 移除 `question_first_semantic_freeze` 作为 active `P0-NEXT`
- [x] 将 `interactive_reasoning_sop_compact` 设为唯一 active compact 路径

## Implementation
- [x] 新建 `compact_session_state` 读写与落盘
- [x] 新建 `compact_session_patch` apply
- [x] 重写 `sop-compact` 顶层 orchestration
- [x] 中间轮已拆成 `freeform reasoner + summarize substep`
- [x] 重写 terminal human loop controller 以服务 agent tool
- [x] 新建 `finalizer` 输出 `compact_capability_output.json`
- [x] 新主路径不再生成旧 field-based compact artifacts

## Verification
- [x] 选定一条真实 trace 作为 `Slice 1` 主回归样本（`20260310_110821_112`）
- [x] 首轮 agent 输出不是字段问卷
- [x] `compact_human_loop.jsonl` 已出现 `clarification_request` 与 `human_reply`
- [ ] human reply 后 `taskUnderstanding` 与 `openDecisions` 发生变化
- [ ] `compact_session_state.json` 可持续更新至会话结束
- [ ] 最终生成 `compact_capability_output.json`
- [ ] 未接入 `run` 的前提下，闭环仍可独立验证

## Quality Gates
- [x] `npm --prefix apps/agent-runtime run typecheck`
- [x] `npm --prefix apps/agent-runtime run build`

## Docs Sync
- [x] `PROGRESS.md` 已将新路径设置为 active `P0-NEXT`
- [x] `NEXT_STEP.md` 已切换到 `rewrite_slice_1_minimal_agent_loop_v0`
- [x] `MEMORY.md` 已写入新的 compact 架构治理边界
- [x] Reference List 已指向新的 active design + checklist
