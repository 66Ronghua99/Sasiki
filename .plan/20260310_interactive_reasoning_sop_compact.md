# Interactive Reasoning SOP Compact (2026-03-10)

> [!NOTE]
> Active implementation doc.
> 本文档用于冻结 `SOP Compact` 的新主路径：从单轮 field/schema compiler 切换为多轮 `agent + human loop tool` 的共推理流程。

## 0. Normative Source
本文档是当前 `SOP Compact` 阶段的唯一实现依据。

本文替代以下 compact 语义主链设计：
- `.plan/20260310_sop_compact_question_first_clarify.md`
- `.plan/20260309_compact_stage_hitl_inline_loop.md`
- `.plan/20260309_sop_compact_v1_full_chain_shift.md`
- `.plan/20260308_sop_compact_behavior_semantics_split_v1.md`

若本文与上述文档冲突，以本文为准。

## 1. Problem Statement
当前 compact 语义主链存在结构性问题，不适合继续补丁式演进：

1. 过多 ad hoc contract
- `semantic_intent_draft / clarification_questions / intent_resolution / frozen_semantic_intent / execution_guide`
- 多个中间工件互相拼接，语义真源漂移严重

2. HITL 没有真正进入推理链
- 用户回答主要被映射到固定字段
- 模型的 reasoning 和 human feedback 是割裂的
- 人更像在补表单，不是在共推理

3. 语义被过早定型
- 单轮 compact 会过早生成强语义结论
- 后续 HITL 只能在错误方向上“往回拽”
- 对“流程允许弹性动作”的任务泛化能力差

4. 旧路径把最终能力学成了固定动作模板
- 容易把“点赞/关注/回复”等一次性动作误当成流程核心
- 难以表达 `optional / conditional / non-core action`

因此本阶段不再继续沿着 field-based compact 主链优化，而是整体切换到新的多轮推理架构。

## 2. Design Goal
冻结一个新的最小闭环：

`observe trace -> compact session init -> multi-round agent reasoning -> human loop when needed -> finalize -> compact capability output`

最小目标：
- `sop-compact` 变成一个多轮 agent workflow，而不是单轮 schema compiler
- `human loop` 作为 agent 的 callable tool，直接进入 reasoning state
- 中间轮拆为 `freeform reasoner -> summarize substep -> patch apply`，避免主 reasoner 为了吐 JSON 牺牲 HITL 质量
- 收敛判断优先交给模型，工程上只保留总轮数上限
- 中间状态只保留单一 `compact_session_state`
- 最终只产出单一 `compact_capability_output`

## 3. Minimum Closed Loop Definition
### 3.1 Loop Identity
- `feature_name`: `interactive_reasoning_sop_compact`
- `stage_name`: `rewrite_slice_1_minimal_agent_loop_v0`
- Primary user value: 用户通过一次示教 + 少量澄清，让系统学到“可复用的流程能力”，而不是一次性的固定动作模板
- Single success metric: 在一条真实 trace 上，agent 能经过多轮推理产出 `compact_capability_output.json`

### 3.2 Scope
In scope:
- 新建多轮 `sop-compact` agent loop
- 新建 `compact_session_state` / `compact_session_patch` / `compact_capability_output`
- 新建 `human loop tool` 最小接口
- 新建中间轮 `summarize substep`，专门把 freeform reasoning 提炼为结构化 patch
- 最终只落盘新 compact 会话工件

Out of scope:
- 不兼容旧 `semantic_intent_draft / clarification_questions / intent_resolution / execution_guide.v1` 主链
- 不接 `run` 消费
- 不做检索模块化
- 不做复杂 deterministic guardrail
- 不优先优化 prompt 细节

### 3.3 Hard Constraints
- `hard limit = 6` 轮
- 中间过程不做强回复模板约束
- 最终产物必须结构化
- `human loop` 只在影响流程泛化的关键歧义上触发

## 4. Boundary & Ownership
### 4.1 Observe / Trace Layer Owns
- 原始 trace 采集
- trace summary
- 基础降噪与浏览器卫生

明确不拥有：
- 最终任务语义
- 最终动作策略
- 最终复用边界

### 4.2 Compact Agent Owns
- 当前流程骨架理解
- 当前任务理解
- 当前 open decisions
- 是否继续提问或是否收敛
- `compact_session_patch`

### 4.3 Human Loop Tool Owns
- 将人类反馈带回 agent 推理链
- 不负责字段映射
- 不负责 replay-ready 判定

### 4.4 Finalizer Owns
- 从 `compact_session_state` 生成 `compact_capability_output`
- 只做结构化整理，不重新推理

## 5. Contracts
### 5.1 `compact_session_state`
服务对象：
- agent 自己
- human loop orchestration

最小字段：
- `schemaVersion`
- `sessionId`
- `runId`
- `roundIndex`
- `workflowSkeleton`
  - `stableSteps`
  - `uncertainSteps`
  - `noiseNotes`
- `taskUnderstanding`
- `openDecisions`
- `humanFeedbackMemory`
- `convergence`

### 5.2 `compact_session_patch`
服务对象：
- session state apply layer

最小字段：
- `schemaVersion`
- `workflowUpdates`
- `taskUnderstandingNext`
- `openDecisionsNext`
- `absorbedHumanFeedback`
- `convergenceNext`

Patch Apply 规则：
- `workflowSkeleton` 增量 merge
- `taskUnderstanding / openDecisions / convergence` 整段 replace
- `humanFeedbackMemory` append-only + dedupe
- `roundIndex` 由基础设施统一递增

### 5.3 `compact_capability_output`
服务对象：
- 后续消费层
- 人类 review

最小字段：
- `schemaVersion`
- `runId`
- `taskUnderstanding`
- `workflowSkeleton`
- `decisionStrategy`
- `actionPolicy`
  - `requiredActions`
  - `optionalActions`
  - `conditionalActions`
  - `nonCoreActions`
- `stopPolicy`
- `reuseBoundary`
  - `applicableWhen`
  - `notApplicableWhen`
  - `contextDependencies`
- `remainingUncertainties`

### 5.4 `human loop tool`
Agent -> Tool:
- `reason_for_clarification`
- `current_understanding`
- `focus_question`
- `why_this_matters`

Tool -> Agent:
- `human_reply`
- `interaction_status`

约束：
- 用户回复保持自由文本
- tool 不做字段验证或 schema 映射

## 6. Runtime Flow
主流程固定为：

1. `init`
- 从 trace 初始化 `compact_session_state`

2. `assemble_context`
- 注入 `trace summary + current session state + latest human reply`

3. `agent_reason`
- 输出自然语言 reasoning，直接服务 human loop 质量

4. `summarize_turn`
- 将 freeform reasoning 提炼为 `compact_session_patch + humanLoopRequest`

5. `apply_patch`
- 以确定性规则更新 `compact_session_state`

6. `human_loop`（条件触发）
- 仅在关键歧义阻碍泛化时触发

7. `loop_or_stop`
- `continue -> 下一轮`
- `ready_to_finalize / max_round_reached / user_stopped -> finalize`

8. `finalize`
- 生成 `compact_capability_output`

全局不变量：
- `compact_session_state` 是唯一中间真源
- `compact_capability_output` 是唯一最终真源
- `human loop` 只服务推理，不再服务表单补全

## 7. Options & Tradeoffs
### Option A: 继续迭代 Question-First Semantic Freeze
优点：
- 当前已有较多代码和样本

缺点：
- 仍然依赖固定字段与大量中间工件
- HITL 仍然主要是“填字段”
- 无法从根本上解决 reasoning 与 human feedback 割裂的问题

结论：
- 不选

### Option B: 完全放弃 compact，只让用户直接写 SOP
优点：
- 最简单

缺点：
- 丢失示教价值
- 偏离 watch-once 北极星

结论：
- 不选

### Option C: 多轮 agent + human loop tool + session state
优点：
- human feedback 直接进入推理链
- 原生支持 `optional / conditional / non-core action`
- 中间 contract 更少，真源更清晰

缺点：
- 需要整体下线旧 compact 语义主链
- 首轮实现需要重写 orchestration

结论：
- 选用本方案

## 8. Migration Plan
### 8.1 Keep
- 录制基础设施
- CDP/browser 基础设施
- trace builder 与 observe runtime
- logging / config / artifact writer 底座

### 8.2 Remove Or Archive
- 旧 field-based compact 语义主链
- `semantic_intent_draft / clarification_questions / intent_resolution / frozen_semantic_intent` 主路径
- 关键词 gate、最小字段验证、strict frozen compile 等旧路径特化逻辑

### 8.3 Rewrite Slice 1
第一刀只重建：
- `compact_session_state`
- `compact_session_patch`
- `compact agent loop`
- `human loop tool`
- `finalizer`
- 新 artifact writer

第一刀不做：
- `run` 消费
- 旧 guide 编译兼容
- retrieval

## 9. Acceptance Criteria
1. 对一条已有 trace，新的 `sop-compact` 能启动多轮 agent 会话，而不是单轮 schema compiler。
2. agent 能主动发起澄清，用户自由回答后，下一轮理解发生变化。
3. 会话状态以 `compact_session_state` 作为唯一中间真源持续更新。
4. 最终生成 `compact_capability_output.json`。
5. 旧 field-based compact artifacts 不再作为新主路径产物。
6. 质量门禁通过：
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

## 10. Test Strategy
### 10.1 Primary Verification
选一条已有真实样本 trace，验证：
- 首轮不是字段问卷
- 首轮 freeform reasoning 不再要求主模型直接输出 strict JSON
- human feedback 能改变下一轮理解
- 最终输出 `compact_capability_output.json`

当前 live 样本：
- `artifacts/e2e/20260310_110821_112`
- 已观测到 `assistant_response -> clarification_request -> human_reply` 新链路闭合，说明 freeform reasoning 与 terminal human loop 已接上
- 下一步仍需在更贴近目标任务的 benchmark（creator platform 图文草稿保存）上验证 capability quality

### 10.2 Evidence Paths
- `artifacts/e2e/<run_id>/compact_session_state.json`
- `artifacts/e2e/<run_id>/compact_human_loop.jsonl`
- `artifacts/e2e/<run_id>/compact_capability_output.json`
- `artifacts/e2e/<run_id>/runtime.log`

### 10.3 Deferred Verification
- 暂不验证 `run` 消费效果
- 暂不验证检索能力
- 暂不要求兼容旧 `execution_guide.v1`

## 11. P0 Next
继续完成 `rewrite_slice_1_minimal_agent_loop_v0` 的 live 验收：
- 保持两步中间轮 `freeform reasoner -> summarize substep`
- 在 creator platform “发图文并保存草稿” benchmark 上重跑 `sop-compact`
- 验证 `compact_human_loop.jsonl` 与 `compact_capability_output.json` 同时符合预期
