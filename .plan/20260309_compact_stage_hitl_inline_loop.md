> [!NOTE]
> **归档文档** | 归档日期：2026-03-10
> 本文档作为历史参考保留，不再主动维护。
> 替代文档：`.plan/20260310_interactive_reasoning_sop_compact.md`

# Compact-Stage HITL Inline Loop (2026-03-09)

## 0. Normative Source
本文档是 `compact-stage HITL` 下一阶段的唯一实现依据。

本文建立在以下文档之上：
- `.plan/20260309_sop_compact_v1_full_chain_shift.md`
- `.plan/checklist_sop_compact_v1_full_chain_shift.md`
- `.plan/20260306_long_task_sop_hitl_requirement_v0.md`

若本文与上述文档冲突，以本文为准。

## 1. Problem Statement
当前 `SOP Compact V1` 已能稳定产出：
- `semantic_intent_draft.json`
- `clarification_questions.json`
- `execution_guide.v1`

并且在存在 blocking semantics 时，会正确停在 `needs_clarification`。

但当前 HITL 体验仍是离线两段式：
1. 先跑 `sop-compact`
2. 再手动触发 `sop-compact-hitl`
3. inspect 问题
4. 人手动回答
5. 写入 `intent_resolution.json`
6. 再 rerun 一次 compact

这条链路的问题不是“不能工作”，而是它不符合目标产品形态：
- 问题提出和答案回填不在同一轮交互里
- 用户仍要理解 `intent_resolution` / `resolvedFields` 这类内部概念
- 当前入口更像调试工具，不像真正的 `compact-stage HITL`

因此下一阶段的目标不是继续修离线 CLI，而是把：

`任务识别 -> 发现不确定项 -> 立即向用户提问 -> 合并答案 -> 产出最终 guide`

收成同一条 inline workflow。

## 2. Design Goal
冻结一个最小闭环，使 compact 阶段在识别出 blocking semantics 后，不再要求用户另开一轮手工操作，而是直接进入同一条人机澄清流程，最终产出可执行的 `execution_guide.v1`。

最小目标：
- 用户不需要手写 `intent_resolution.json`
- 用户不需要记忆 `resolvedFields` 字段名
- 用户回答完成后，系统自动将答案合并回 compact 编译链路
- 若所有 blocking semantics 已解决，则同一条流程直接产出 `ready_for_replay`

## 3. Scope
本阶段包含：
- 把 `compact-stage HITL` 从离线 file-based 入口升级为 inline question loop
- 在 `sop-compact` 主工作流中暴露结构化 `clarificationRequest`
- 将问题顺序建立在 `execution_guide.detailContext.unresolvedQuestions + clarification_questions.json` 之上
- 将用户答案映射为 `intent_resolution.json`
- 在同一条工作流中自动触发 recompile
- 保留现有 `ready_for_replay` gate 真源不变：
  - `semantic_intent_draft.blockingUncertainties`
  - `clarification_questions`
  - `intent_resolution`

## 4. Non-goals
本阶段不做：
- 不改 runtime 失败恢复 HITL
- 不把 compact-stage HITL 和 runtime HITL 合并成同一个控制器
- 不引入“人工回答后再交给第二个 HITL agent 二次推理”的新链路
- 不修改 observe 录制协议
- 不做 SOP 检索优化
- 不在这一阶段设计完整前端 UI；最小实现可以先从 CLI / service contract 起步

## 5. Current State vs Target State
### 5.1 Current State
当前用户可见路径：
- `sop-compact` 先落一版结果
- 若 `needs_clarification`，用户再单独调用 `sop-compact-hitl`
- 通过 `inspect` 读取问题
- 通过 `resolve` 回写答案

当前实现价值：
- 已验证 `intent_resolution -> recompile -> ready_for_replay` ready-path 是成立的
- 已验证问题源与 gate 真源一致

当前实现缺陷：
- 交互割裂
- 用户心智仍暴露内部数据结构
- 没有“识别任务后立即澄清”的体验

### 5.2 Target State
目标用户路径：
1. `sop-compact` 进入语义识别
2. 若无 blocking semantics，直接产出 `execution_guide.v1`
3. 若有 blocking semantics，立即返回/进入 `clarificationRequest`
4. 用户在同一条工作流中按问题顺序回答
5. 系统自动写入 `intent_resolution`
6. 系统自动 recompile
7. 若阻塞已清空，则同一条流程结束于 `ready_for_replay`

## 6. Chosen Architecture
### 6.1 One Semantic Chain, Not Two Agents
下一阶段不新增“后置 refinement agent”。

原因：
- 当前问题本质是语义缺口，不是需要第二个 agent 重写整份 guide
- 最小闭环只需要把用户确认过的答案结构化并合入现有 V1 compile path
- 过早引入第二个 agent 会增加语义漂移和调试面

因此 chosen path 是：
- 首轮 semantic agent 负责识别目标、范围、完成条件、不确定项
- HITL 只负责回答 blocking semantics
- 回答结果通过 `intent_resolution` 合并
- guide 重编译仍走同一条 `SOP Compact V1` 链路

### 6.2 User-Facing Path Becomes Inline
用户面向的主入口不再是：
- `sop-compact`
- `sop-compact-hitl`

两段式心智。

而是：
- 同一条 compact workflow 中，先识别，再澄清，再编译最终 guide

### 6.3 Existing CLI Becomes Debug/Backfill Tool
现有 `sop-compact-hitl` 不应再作为主路径继续扩展。

它保留的意义是：
- debug / 回放 / 回填旧样本
- 非交互环境下的运维补录
- 局部验证 `intent_resolution` merge 逻辑

但它不再代表产品形态。

## 7. Contract Freeze
### 7.1 Clarification Request Contract
当 compact 因 blocking semantics 无法直接 `ready_for_replay` 时，主流程必须暴露结构化的 `clarificationRequest`，至少包含：
- `runId`
- `status`
- `round`
- `maxRounds`
- `questions[]`
- `remainingBlockingKeys[]`

其中每个 `question` 至少包含：
- `questionId`
- `prompt`
- `reason`
- `priority`
- `sourceKey`

约束：
- `sourceKey` 允许内部映射到 `intent_resolution.resolvedFields`
- 但用户界面/用户输入层不直接暴露字段名心智

### 7.1.1 Question Merge Policy
inline question loop 的问题源有两份：
- `execution_guide.detailContext.unresolvedQuestions`
- `clarification_questions.json`

合并规则冻结为：
1. `unresolvedQuestions` 是 canonical source
- 决定哪些问题当前真的仍然 blocking
- 决定默认顺序与优先级

2. `clarification_questions.json` 是 phrasing source
- 只负责补充更适合用户阅读的 `prompt/reason`
- 不负责决定是否进入本轮提问

3. merge 方式固定为按 `sourceKey` 的 left join
- 主表：`unresolvedQuestions`
- 副表：`clarification_questions`

4. dedup 规则
- 同一 `sourceKey` 只保留一条问题
- 若 `unresolvedQuestions` 中出现重复，按首次出现保留

5. extras 处理
- 只存在于 `clarification_questions.json`、但不在 `unresolvedQuestions` 中的题目，不进入 inline loop
- 它们可保留为审计信息，但不阻塞当前问题顺序

6. conflict 处理
- 是否 blocking、排序、priority 以 `unresolvedQuestions` 为准
- `prompt/reason` 文案优先使用 `clarification_questions`
- 若缺失匹配 phrasing，则退回 `unresolvedQuestions` 自身描述，不再模板补题

### 7.2 Answer Payload Contract
用户回答的最小结构为：
- `questionId`
- `answer`
- `notes?`

附加约束：
- 允许 partial answer：同一轮中部分问题可答、部分问题可跳过
- `answer` 为空且显式标记 skip/defer 时，视为本题未解决，不进入 `resolvedFields`

系统负责：
- 把 `questionId -> sourceKey -> resolvedFields` 做内部映射
- 落盘 `intent_resolution.json`
- 记录 `resolvedAt`

### 7.3 Clarification Result Contract
每轮 inline HITL 完成后，主流程必须返回结构化 `clarificationResult`，至少包含：
- `runId`
- `status`
- `exitReason`
- `round`
- `maxRounds`

其中：
- `status` 只允许：
  - `ready_for_replay`
  - `needs_clarification`
  - `recompile_failed`
- `exitReason` 只允许：
  - `resolved`
  - `remaining_blockers`
  - `user_deferred`
  - `round_limit_reached`
  - `no_progress`
  - `recompile_error`

附加规则：
- `status=needs_clarification` 时必须携带新的 `clarificationRequest`
- `status=recompile_failed` 时必须携带错误摘要和已落盘的 `intent_resolution` 路径

### 7.4 Recompile Contract
answer merge 完成后，系统自动 recompile，但只在本轮至少收到一个有效回答时触发。

规则冻结为：
1. 若本轮有有效回答
- 自动写入 `intent_resolution.json`
- 自动触发 recompile

2. 若本轮全部是 skip/defer
- 不触发 recompile
- 直接以 `status=needs_clarification` + `exitReason=user_deferred` 结束

3. recompile 后只允许三类出口
- `ready_for_replay`
- `needs_clarification`
- `recompile_failed`

4. 最小闭环不允许退回“请手动编辑 JSON 再跑一次”的旧路径

### 7.5 Loop Control Policy
为避免 inline loop 变成无限澄清，控制策略冻结为：

1. `maxRounds=2`
- 一轮的定义是：呈现当前 blocking questions -> 接收用户回答 -> 可选 recompile

2. partial answer 允许进入 recompile
- 只要本轮至少回答了一个 blocking question，就允许带着 partial resolution 进入 recompile
- 未回答/跳过的问题继续保留在 `remainingBlockingKeys`

3. 用户允许显式放弃当前澄清
- 用户可在任意一轮选择 `defer/stop`
- 系统以 `status=needs_clarification` + `exitReason=user_deferred` 退出

4. 达到轮数上限后不再继续追问
- 若第 `2` 轮后仍有 blocking semantics，返回 `status=needs_clarification` + `exitReason=round_limit_reached`

5. 无进展保护
- 若 recompile 前后的 `remainingBlockingKeys` 集合没有收缩，则直接退出
- 返回 `status=needs_clarification` + `exitReason=no_progress`

## 8. Options & Tradeoffs
### Option A: 继续增强离线 `sop-compact-hitl` CLI
优点：
- 改动最小

缺点：
- 仍是两段式流程
- 用户仍需显式理解“先 inspect，再 resolve”
- 与目标产品体验不一致

结论：
- Rejected

### Option B: 用户回答后再走一个专门的 HITL refinement agent
优点：
- 理论上可做更丰富的二次语义重写

缺点：
- 新增 agent path，调试面更大
- 更容易把用户答案再解释错
- 当前阶段不需要这么重的抽象层

结论：
- Rejected for this phase

### Option C: 在 compact 主流程中内联 question loop（Chosen）
优点：
- 符合“同一轮里澄清不确定项”的产品目标
- 继续复用 V1 真源与 gate
- 结构清晰，能从 CLI 平滑迁移到 UI/API

缺点：
- 需要明确 request/answer/recompile 的契约
- 需要保留可回归的非交互测试入口

结论：
- Chosen

## 9. Migration Plan
### Phase A: Contract First
先冻结：
- `clarificationRequest`
- `answer payload`
- `clarificationResult`
- question merge policy
- loop termination policy

目标：
- 让 inline path 与离线 debug path 共用同一套 service contract

### Phase B: Minimal Inline Entry
先提供一个最小 inline 入口，满足：
- 在同一条命令/调用中完成“识别 -> 提问 -> 回答 -> recompile”
- 用户不需要手写字段名

说明：
- 交付形态可先是 CLI interactive mode
- 但实现必须下沉到 service contract，而不是把逻辑锁死在 TTY 上
- CLI handler 只负责 I/O 编排，问题排序、答案映射、recompile 决策必须由独立 service 暴露

### Phase C: Verification-Ready Sample
验收样本不能直接复用已经带 `intent_resolution.json` 的目录。

因此实现前必须明确一条 clean verification path：
- 从 `artifacts/e2e/20260308_110124_276` 复制出一份干净样本
- 验收前显式确认其中不存在预置 `intent_resolution.json`

该 clean sample 才是 inline HITL 的首轮验收输入。

### Phase D: Keep Debug Path, Demote It
保留 `sop-compact-hitl`：
- 用于旧样本补录
- 用于脚本化回放
- 用于排障

但产品说明和 `NEXT_STEP` 不再把它当作主路径。

## 10. Acceptance Criteria
1. 用户无需手写 `intent_resolution.json`
2. 用户无需记忆或输入 `resolvedFields` 字段名
3. 在同一条 compact workflow 中，可以从 blocking semantics 进入问题澄清，再自动回到 guide 编译
4. `ready_for_replay` 仍只由 V1 semantic 真源决定，不能退回 legacy 判定
5. inline loop 必须有显式终止条件：`maxRounds=2`、`user_deferred`、`no_progress`
6. 问题合并规则固定为：`unresolvedQuestions` 决定 inclusion/order，`clarification_questions` 决定 phrasing
7. service contract 必须可在非 TTY 环境独立调用，CLI 只做适配
8. 验收必须从无预置 `intent_resolution.json` 的干净样本开始
9. recompile 失败时必须返回结构化 `recompile_failed` 结果，并保留已写入的 `intent_resolution.json`
10. `sop-compact-hitl` 仍可保留为 debug/backfill 工具，但不再是主路径

## 11. Verification Strategy
使用样本：
- 基线来源：`artifacts/e2e/20260308_110124_276`
- 验收输入：从基线复制出的 clean sample（无 `intent_resolution.json`）

验证分两层：

### 11.1 Contract Verification
检查：
- 首轮 compact 结果是否能给出结构化 `clarificationRequest`
- question order 是否按 `unresolvedQuestions` 排序，并只用 `clarification_questions` 补 phrasing
- answer payload 是否不要求用户输入内部 field name
- `clarificationResult` 是否能表达 `ready_for_replay | needs_clarification | recompile_failed`
- service contract 是否可在不经过 CLI TTY 的情况下独立调用

### 11.2 End-to-End Verification
检查：
- 回答后是否自动写入 `intent_resolution.json`
- 是否自动 recompile
- 若答案覆盖全部 blocking semantics，`execution_guide.v1` 是否进入 `ready_for_replay`
- 若仍有缺口，是否继续返回新的 `clarificationRequest`
- 若用户本轮全部 defer，是否以 `needs_clarification/user_deferred` 结束
- 若达到 `maxRounds=2` 后仍有阻塞，是否以 `needs_clarification/round_limit_reached` 结束
- 若 recompile 前后 blocking keys 无收缩，是否以 `needs_clarification/no_progress` 结束

### 11.3 Failure Path Verification
检查：
- 当 recompile 阶段模型不可用、网络超时或语义调用失败时，是否返回 `recompile_failed`
- `intent_resolution.json` 是否已保留，供后续 rerun 或 debug/backfill 使用
- 是否没有静默回退到 legacy guide 或手工 JSON 编辑路径

质量门禁：
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

## 12. Acceptance Evidence (2026-03-09)
本阶段最终 live ready-path 证据已在仓库内样本上成立：
- 样本：`artifacts/e2e/20260308_110124_276_inline_try1`
- 结果：
  - `compact_manifest.status=ready_for_replay`
  - `execution_guide.status=ready_for_replay`
  - `execution_guide.replayReady=true`
  - `intent_resolution.json` 已落盘
  - `runtime.log` 记录首轮 compact 与回答后的 recompile 都成功

因此 `compact-stage HITL inline loop` 的最小闭环已完成：
- 识别任务
- 提出澄清问题
- 用户回答
- 自动重编译
- 产出最终 `execution_guide.json`

注：
- 当前样本中的 `scopeHypothesis` 回答内容更偏“回复策略”而非“处理范围”，说明字段级提问文案仍有提升空间
- 这属于下一阶段的语义体验优化，不影响本阶段的主闭环验收

## 12. P0 Next
下一步实现顺序固定为：
1. 先冻结 inline HITL 的 service contract
2. 再实现最小 inline entry（同一条 workflow 内完成问答）
3. 最后把 `sop-compact-hitl` 降级为 debug/backfill 入口，并更新文档与 README
