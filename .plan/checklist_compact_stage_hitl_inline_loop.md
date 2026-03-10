> [!NOTE]
> **归档文档** | 归档日期：2026-03-10
> 本文档作为历史参考保留，不再主动维护。
> 替代文档：`.plan/checklist_interactive_reasoning_sop_compact.md`

# Checklist: Compact-Stage HITL Inline Loop

## Design Freeze
- [x] 已明确当前离线 HITL 路径的缺口不是能力，而是交互形态
- [x] 已冻结目标为“识别 -> 提问 -> 回答 -> recompile”同一条 workflow
- [x] 已冻结 compact-stage HITL 与 runtime failure HITL 的边界
- [x] 已冻结本阶段不引入第二个 refinement agent
- [x] 已冻结 `clarificationRequest` / `answer payload` / `clarificationResult` 三类契约
- [x] 已冻结问题合并优先级：`unresolvedQuestions` 决定 inclusion/order，`clarification_questions` 只补 phrasing
- [x] 已冻结 loop 终止策略：`maxRounds=2`、`user_deferred`、`no_progress`
- [x] 已冻结 `sop-compact-hitl` 在下一阶段降级为 debug/backfill 工具

## Evidence
- [x] 需求与方案已落盘：`.plan/20260309_compact_stage_hitl_inline_loop.md`
- [x] 当前离线 ready-path 已有样本证据：`artifacts/e2e/20260308_110124_276_hitl_demo/*`
- [x] 当前主链路真源仍可追溯：`.plan/20260309_sop_compact_v1_full_chain_shift.md`
- [x] 已有 deterministic clean sample：`artifacts/e2e/20260308_110124_276_inline_deterministic/*`
- [x] 已有 live recompile failure sample：`artifacts/e2e/20260308_110124_276_inline_clean/*` / `artifacts/e2e/20260308_110124_276_inline_qwen/*`
- [x] 已有 live ready-path sample：`artifacts/e2e/20260308_110124_276_inline_try1/*`

## Implementation
- [x] Phase A: 定义 `clarificationRequest` contract，并冻结 merge/dedup/order 规则
- [x] Phase A: 定义 `questionId -> answer` contract、partial answer 语义与 skip/defer 语义
- [x] Phase A: 定义 `clarificationResult` contract，以及 `maxRounds=2` / `no_progress` / `recompile_failed` 出口
- [x] Phase A: 暴露独立于 CLI 的 service contract 入口，确保问题排序/答案映射/recompile 决策不锁死在 TTY
- [x] Phase B: 在同一条 compact workflow 中接入 inline question loop
- [x] Phase B: 在回答后自动写入 `intent_resolution.json` 并 recompile
- [x] Phase C: 准备无预置 `intent_resolution.json` 的 clean sample 作为首轮验收输入
- [x] Phase C: 使用 deterministic clean sample 验证 `clarificationRequest` / `questionId -> answer` contract
- [x] Phase C: 在 live semantic recompile 下验证一轮 inline clarification flow 到 `ready_for_replay`
- [x] Phase C: 验证 recompile failure 时返回 `recompile_failed` 且保留 `intent_resolution.json`
- [x] Phase D: 将 `sop-compact-hitl` 从主入口降级为 debug/backfill 入口

## Quality Gates
- [x] 代码、文档、README 已同步到“inline HITL 是主路径”的新表述
- [x] service contract 有独立于 CLI 的可测试入口
- [x] `npm --prefix apps/agent-runtime run typecheck`
- [x] `npm --prefix apps/agent-runtime run build`
