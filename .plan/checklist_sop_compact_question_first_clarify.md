> [!NOTE]
> **归档文档** | 归档日期：2026-03-10
> 本文档作为历史参考保留，不再主动维护。
> 替代文档：`.plan/checklist_interactive_reasoning_sop_compact.md`

# Checklist: SOP Compact Question-First Clarify

## Design Freeze
- [x] 已冻结 `behavior skeleton` 与 `semantic freeze` 的职责边界
- [x] 已冻结核心问题集合：`task_intent / scope / completion_criteria / final_action`
- [x] 已冻结 `semantic_intent_draft.v2` / `clarification_questions.v2` / placeholder `execution_guide` contract
- [x] 已冻结 `frozen_semantic_intent.v1` contract 与 compile 真源
- [x] 已冻结 frozen intent 与 `behavior_workflow` 的冲突覆盖规则
- [x] 已冻结“占位回答不算 resolved”的 gate 规则
- [x] 已冻结 `ready_for_replay` 必须依赖核心字段冻结
- [x] 已冻结 observe 浏览器卫生策略：启动单干净 tab、结束关闭浏览器

## Evidence
- [x] 问题样本已固定：`artifacts/e2e/20260310_110821_112/*`
- [x] 当前偏差证据已可追溯：`semantic_intent_draft.json` / `execution_guide.json` / `intent_resolution.json`
- [x] 噪音证据已可追溯：`abstraction_input.json` / `sop_draft.md`
- [x] 新阶段设计文档已落盘：`.plan/20260310_sop_compact_question_first_clarify.md`

## Implementation
- [x] Phase A: observe 启动时只保留单个干净 tab
- [x] Phase A: observe 结束后关闭 runtime 启动的浏览器
- [x] Phase B: compact 首轮输出改为 hypotheses + questions，而不是强结论 guide
- [x] Phase B: `semantic_intent_draft.v2` 落盘 `coreFields + clarificationRequirements + noiseObservations`
- [x] Phase B: 噪音站点/旧 tab 进入 noise observations，不进入主语义字段
- [x] Phase C: clarify 问题优先围绕 4 个核心字段发问
- [x] Phase C: question packet 暴露 `questionContext`，帮助用户基于 skeleton 回答
- [x] Phase C: 占位回答不再写入 resolved semantic freeze
- [x] Phase C: reject 的回答在 `clarificationResult.rejectedAnswers[]` 可追溯
- [x] Phase C: `frozen_semantic_intent.json` 由 `semantic_intent_draft + intent_resolution` 编译生成
- [x] Phase D: guide 编译严格继承冻结答案
- [x] Phase D: frozen intent 与 workflow 语义冲突时按规则重写 purpose / optional observed action / block replay
- [x] Phase D: core semantic 未冻结时，manifest/status 继续为 `needs_clarification`

## Verification
- [x] Phase A Gate: 新 observe 样本不再把旧 tab foreign site 作为主 `surface/open_surface`
- [x] Phase B Gate: `20260310_110821_112` 首轮 compact 不再直接得出“关注博主”
- [x] Phase C Gate: 对占位答案样本，状态保持 `needs_clarification`，并记录 `rejectedAnswers[]`
- [x] Phase D Gate: 明确答案后 `execution_guide` 目标改为“浏览多个帖子并给其中一个点赞”
- [x] 在样本 `20260310_110821_112` 上，首轮 compact 不再直接得出“关注博主”
- [x] 在样本 `20260310_110821_112` 上，TikTok Shop 噪音不再进入主 goal/surface
- [x] 对占位答案样本，状态保持 `needs_clarification`
- [x] 对明确答案样本，`execution_guide` 目标改为“浏览多个帖子并给其中一个点赞”
- [x] 对明确答案样本，`execution_guide` 不再包含“关注博主”或“汇总帖子内容”
- [x] 对“只浏览不操作”回答样本，observed `submit_action` 被降级为 optional observed action，而不是 replay-required
- [x] 对“缺少行为骨架支持”的回答样本，状态保持 `needs_clarification`
- [ ] 既有 ready 样本 `20260308_110124_276_inline_try1` 仍保持 `ready_for_replay`
- [ ] 既有 deterministic sample `20260308_110124_276_inline_deterministic` contract 不回退

## Quality Gates
- [x] Phase A gate 通过后运行 `npm --prefix apps/agent-runtime run typecheck`
- [x] Phase A gate 通过后运行 `npm --prefix apps/agent-runtime run build`
- [x] Phase B gate 通过后运行 `npm --prefix apps/agent-runtime run typecheck`
- [x] Phase B gate 通过后运行 `npm --prefix apps/agent-runtime run build`
- [x] Phase C gate 通过后运行 `npm --prefix apps/agent-runtime run typecheck`
- [x] Phase C gate 通过后运行 `npm --prefix apps/agent-runtime run build`
- [x] Phase D gate 通过后运行 `npm --prefix apps/agent-runtime run typecheck`
- [x] Phase D gate 通过后运行 `npm --prefix apps/agent-runtime run build`
- [x] 关键样本证据可重复复现

## Docs Sync
- [x] `PROGRESS.md` 已将 `question_first_semantic_freeze` 设为 `P0-NEXT`
- [x] `NEXT_STEP.md` 已切换为唯一执行指针，并明确“检索模块化”后移
- [x] `PROGRESS.md` 的 Reference List 已包含本阶段 design + checklist

## Phase Notes
- [x] Live gate sample `artifacts/e2e/20260310_115847_198` 证明 observe 启动前会将已 ready 的本地 CDP 会话收敛为单空白 tab，`runtime.log` 记录 `cdp_page_reset_succeeded closedPages=9`
- [x] Live gate sample `artifacts/e2e/20260310_115847_198` 在 observe 结束后已关闭本地浏览器，`runtime.log` 记录 `cdp_close_succeeded`
- [x] Phase B 回归样本 `artifacts/e2e/20260310_115847_198` 证明 `about:blank` 已被降级为 `noiseObservations`，`abstraction_input.surface=path:explore`
- [x] Phase B 回归样本 `artifacts/e2e/20260310_110821_112` 证明 noisy sample 会落盘 `semantic_intent_draft.v2 / clarification_questions.v2 / frozen_semantic_intent.v1`，且 `execution_guide.status=needs_clarification`
- [x] Phase C 回归样本 `artifacts/e2e/20260310_110821_112` 证明占位回答会被 `rejectedAnswers[]` 拦住，且只补 `final_action` 仍保持 `needs_clarification`
- [x] Phase D 正向样本 `artifacts/e2e/20260310_110821_112_phase_d_explicit` 证明冻结答案会直接进入 `ready_for_replay`，并在 `resolutionNotes[]` 记录 generic step -> final action slot 的覆盖链路
- [x] Phase D browse-only 样本 `artifacts/e2e/20260310_110821_112_phase_d_browse_only` 证明 `behavior_step_5.stepRole=optional_observed_action`，`branch_hint_4` 标注 observed-only
- [x] Phase D synthetic negative gate 通过 `tsx` 直接调用 builder 验证：移除兼容动作骨架后，`compileEligibility.reason=missing_behavior_support_for_frozen_action`
- [ ] 历史 ready sample `artifacts/e2e/20260308_110124_276_inline_try1` 当前不在本地 workspace，待恢复后补跑 back-compat regression
- [ ] 历史 deterministic sample `artifacts/e2e/20260308_110124_276_inline_deterministic` 当前不在本地 workspace，待恢复后补跑 contract regression
