> [!NOTE]
> **归档文档** | 归档日期：2026-03-10
> 本文档作为历史参考保留，不再主动维护。
> 替代文档：`.plan/20260310_interactive_reasoning_sop_compact.md`

# SOP Compact Question-First Clarify (2026-03-10)

> [!NOTE]
> Historical implementation doc.
> 本文档保留为已归档的 `question_first_semantic_freeze` 实施记录。

## 0. Normative Source
本文档是 `SOP Compact` 下一阶段的设计依据草案。

本文建立在以下文档之上：
- `.plan/20260309_compact_stage_hitl_inline_loop.md`
- `.plan/checklist_compact_stage_hitl_inline_loop.md`
- `.plan/20260309_sop_compact_v1_full_chain_shift.md`

若本文与上述文档冲突，以本次 review 结论为准。

### 0.1 Relationship To Current Next Step
当前仓库原 `NEXT_STEP.md` 指向“检索能力模块化”。本次 review 后，阶段优先级调整为：

1. 先解决 `question_first_semantic_freeze`
- 原因：若 `SOP Compact` 产出的 `goal/scope/doneCriteria` 仍大幅偏离真实意图，则检索模块化只会把错误 guide 更稳定地送入 run
- 性质：这是 `retrieval modularization` 的前置依赖，不是并行路线

2. `retrieval modularization` 延后为下一阶段
- 前提：`question-first` 最小闭环跑通，且 noisy sample 与既有 ready sample 的 replay gate 均稳定

## 1. Problem Statement
当前 `SOP Compact + inline clarify` 已能跑通：
- `observe -> compact -> clarify -> recompile -> execution_guide.v1`
- 在一部分样本上可达 `ready_for_replay`

但最新样本 `artifacts/e2e/20260310_110821_112` 暴露出当前架构的核心问题：

1. behavior 层对语义解释权过重
- 录制 trace 中混入了 `TikTok Shop` 旧标签页、空白页、浏览器新标签页等背景噪音
- compact 的 `abstraction_input.surface` 和 `open_surface` 主证据被噪音带偏

2. semantic draft 过早形成强语义结论
- 实际操作是：搜索“小红书博主/关键词” -> 进入主页 -> 浏览多个帖子 -> 对其中一个帖子点赞
- 当前 draft 却先判断成“搜索并关注特定博主”，并把“关注状态确认”当作完成条件

3. HITL 处于“晚纠错”位置
- 现在的 clarify 本质上是在已经偏掉的语义草案上补字段
- 人类需要同时纠正平台噪音、目标对象、最终动作、完成标准，负担过高
- 一旦前置 draft 偏得太远，HITL 只能“往回拽一点”，而不是主导冻结任务语义

4. replay gate 放行过宽
- 在核心语义仍未冻结时，仅凭宽泛或占位式回答也可能进入 `ready_for_replay`
- 这会导致最终 `execution_guide` 的 `goal/scope/doneCriteria` 与真实意图不一致

因此，本阶段的核心问题不是“再优化行为识别细节”，而是要重新分配：

`behavior evidence` 与 `human clarification` 的职责边界。

## 2. Design Goal
冻结一个新的最小闭环：

`observe trace -> behavior skeleton + semantic hypotheses -> question-first HITL -> frozen semantic intent -> execution_guide.v1`

最小目标：
- behavior 层只负责输出流程骨架、证据、噪音提示，不再先拥有最终语义解释权
- semantic 层先输出“猜测 + 关键问题”，而不是直接输出强结论 guide
- 人类回答冻结 `task / scope / completion / final action`
- 只有核心语义字段冻结后，系统才编译 `execution_guide.v1`
- 核心字段未冻结时，状态必须保持 `needs_clarification`

## 3. Minimum Closed Loop Definition
### 3.1 Loop Identity
- `feature_name`: `sop_compact_question_first_clarify`
- `stage_name`: `question_first_semantic_freeze_v0`
- User persona: 需要把一次真实浏览器示教压缩为可复用 SOP 的操作者
- Primary user value: 在 noisy observe trace 上，先用最少问题冻结真实意图，再生成更可信的 replay guide
- Single success metric: 对样本 `20260310_110821_112`，最终 `execution_guide` 不再把目标误判为“关注博主”或“汇总帖子内容”

### 3.2 Scope Boundaries
In scope:
- 引入 `question-first` 语义冻结路径
- 降低 behavior 层的语义主导权
- 强化 replay gate：核心语义未冻结时不能 `ready_for_replay`
- observe 浏览器卫生基线：启动录制时保证单个干净 tab；录制结束后关闭浏览器

Out of scope:
- 不做 SOP 检索模块化
- 不做 runtime HITL 与 compact HITL 合并
- 不做完整前端 UI
- 不追求通过更多 DOM 解析直接自动识别所有业务语义

External dependencies:
- `observe` 能稳定输出 `demonstration_trace`
- 现有 `execution_guide.v1` 继续作为 run 侧单一消费工件

### 3.3 Loop Flow
1. Trigger:
- 用户完成一次 observe 录制并进入 compact

2. User action:
- 用户仅回答关键语义问题，例如：
  - 目标对象是谁
  - 目标动作是什么
  - 完成条件是什么
  - 范围是单个对象还是多个对象

3. System response:
- 系统基于行为骨架 + 用户冻结后的语义，编译 `execution_guide.v1`
- 若关键问题仍未回答清楚，则继续 `needs_clarification`

## 4. Current State vs Target State
### 4.1 Current State
当前主链路：
- `observe`
- `sop-compact`
- semantic draft 先对任务做较强解释
- 若有 blocker，再由 `inline clarify` 纠偏
- recompile 成 `execution_guide.v1`

当前问题：
- behavior evidence 中的噪音会直接污染语义草案
- early draft 很容易把“点赞帖子”误判成“关注博主”等高层目标
- 人类回答是在错误草案基础上修补，不是先冻结问题再生成 guide

### 4.2 Target State
目标主链路：
- `observe`
- `sop-compact` 先输出 behavior skeleton、noise report、semantic hypotheses、question set
- 用户只回答核心语义问题
- 系统用回答结果冻结 semantic intent
- 系统编译最终 `execution_guide.v1`

关键变化：
- first-class artifact 从“强语义 draft”切换为“hypotheses + questions”
- clarify 从“后置纠偏”升级为“前置冻结”
- replay gate 从“问题补完后尽快放行”升级为“核心字段冻结后才放行”

## 5. Boundary & Ownership
### 5.1 Behavior Layer Owns
- `behavior_workflow.json`
- `behavior_evidence.json`
- `abstraction_input.json`
- `noiseObservations`
- branch / loop / submit / verification 骨架

明确不拥有：
- 最终 `goal`
- 最终 `scope`
- 最终 `doneCriteria`
- 最终 `final action` 的业务含义

### 5.2 Human Clarification Owns
- 任务目标冻结
- 范围冻结
- 完成条件冻结
- 最终动作冻结

### 5.3 Guide Compiler Owns
- 合并行为骨架与冻结后的 semantic intent
- 生成 `execution_guide.v1`
- 根据核心字段完整性决定 `ready_for_replay` / `needs_clarification`

## 6. Options & Tradeoffs
### Option A: 保持现有 behavior-first + correction-later
优点：
- 改动最小
- 当前已有 inline clarify 代码路径可复用

缺点：
- 语义偏差在前，HITL 成本持续升高
- 一旦 early draft 错得太远，用户要同时修正多个方向
- `ready_for_replay` 可信度不足

结论：
- 不选

### Option B: 完全放弃行为层，只让用户直接写任务说明
优点：
- 噪音几乎不影响语义
- 语义冻结成本最低

缺点：
- 丢失示教价值
- 失去从行为中提取 workflow skeleton 的能力
- 对“看一次就复刻”的北极星退化明显

结论：
- 不选

### Option C: 保留 behavior skeleton，但切到 question-first semantic freeze
优点：
- 保留示教骨架价值
- 降低 behavior 对高层语义的主导权
- 人类回答变成“先冻结关键问题”，纠偏成本更低
- 与当前 `execution_guide.v1` 单一消费工件兼容

缺点：
- 需要重排 compact / clarify 的 contract
- 需要更严格的 replay gate

结论：
- 选用本方案

## 7. Chosen Architecture
### 7.1 Observe Hygiene Baseline
录制启动时：
- 若 runtime 自行启动本地浏览器，只保留单个空白 tab
- 录制开始前已存在的旧标签页视为背景上下文，不进入主语义

录制结束时：
- 直接关闭 runtime 启动的浏览器会话
- 避免下次 observe 继承旧页面污染

### 7.2 Hypothesis-First Compact Output
compact 首轮输出不再追求直接生成“强结论 guide”，而是先产出：
- behavior skeleton
- semantic hypotheses
- noise observations
- required questions

核心要求：
- semantic hypotheses 只允许表达“猜测”和“不确定项”
- 若证据不足，不得把最终动作强判为“关注/点赞/汇总/回复”等业务语义

### 7.2.1 Proposed Output Schema Freeze
为避免实现阶段“不知道往哪里写”的问题，本阶段冻结以下 artifact contract：

1. `abstraction_input.json` 继续作为 evidence-first 输入真源
- 保留现有字段：`highLevelSteps`、`selectorHints`、`phaseSignals`、`exampleCandidates`
- 新增字段：`noiseObservations`

```json
{
  "schemaVersion": "abstraction_input.v1",
  "noiseObservations": [
    {
      "id": "noise_1",
      "kind": "foreign_site_tab",
      "summary": "录制开始前存在 TikTok Shop 旧标签页",
      "evidenceRefs": ["signal_1_open_surface"],
      "affects": ["surface", "task_intent"]
    }
  ]
}
```

2. `semantic_intent_draft.json` 升级为 question-first draft 真源
- 不再直接用 `taskIntentHypothesis/scopeHypothesis/completionHypothesis` 三个平铺字段表达最终结论
- 改为 `coreFields + supportingHypotheses + clarificationRequirements`

```json
{
  "schemaVersion": "semantic_intent_draft.v2",
  "coreFields": {
    "task_intent": {
      "hypothesis": "用户可能想搜索目标博主并浏览其多个帖子",
      "status": "unresolved",
      "confidence": "medium",
      "evidenceRefs": ["signal_3_locate_object", "signal_4_iterate_collection"]
    },
    "scope": {
      "hypothesis": "范围可能是进入目标主页后浏览多个帖子",
      "status": "unresolved",
      "confidence": "medium",
      "evidenceRefs": ["signal_4_iterate_collection"]
    },
    "completion_criteria": {
      "hypothesis": "完成条件可能与完成浏览和一次对象动作有关",
      "status": "unresolved",
      "confidence": "low",
      "evidenceRefs": ["signal_6_submit_action", "signal_7_verify_outcome"]
    },
    "final_action": {
      "hypothesis": "最终动作可能是点赞其中一个帖子",
      "status": "unresolved",
      "confidence": "low",
      "evidenceRefs": ["signal_6_submit_action"]
    }
  },
  "supportingHypotheses": {
    "selection": [],
    "skip": [],
    "branch": []
  },
  "noiseObservations": ["noise_1"],
  "clarificationRequirements": [
    {
      "questionId": "q_final_action",
      "field": "final_action",
      "priority": "P0",
      "blocking": true,
      "prompt": "你最终希望执行的对象动作是什么？例如点赞一个帖子、关注博主，或仅浏览不操作。",
      "reason": "当前 evidence 只能看到一次对象动作，但无法稳定判断其业务语义。",
      "evidenceRefs": ["signal_6_submit_action"],
      "resolutionRuleId": "core_field_rule_final_action_v1"
    }
  ]
}
```

3. `clarification_questions.json` 继续保留为用户面向问题清单
- 其真源固定为 `semantic_intent_draft.clarificationRequirements`
- 不再由独立模板补题

```json
{
  "schemaVersion": "clarification_questions.v2",
  "source": "semantic_intent_draft.clarificationRequirements",
  "questions": []
}
```

4. `execution_guide.json` 在核心字段未冻结前仍可落盘，但只能是 placeholder compile
- `status=needs_clarification`
- `replayReady=false`
- `generalPlan.goal/scope/doneCriteria` 只允许保守占位，不允许强语义结论
- `detailContext.unresolvedQuestions` 必须完整承接 `clarificationRequirements`

### 7.2.2 Artifact Mapping Summary
为避免 Phase B 开工时继续出现“字段应该写到哪里”的歧义，冻结以下映射表：

| Artifact | Purpose | Required fields |
| --- | --- | --- |
| `abstraction_input.json` | evidence-first 输入真源 | `highLevelSteps`, `phaseSignals`, `selectorHints`, `exampleCandidates`, `noiseObservations[]` |
| `semantic_intent_draft.json` | question-first 语义草案真源 | `coreFields`, `supportingHypotheses`, `noiseObservations`, `clarificationRequirements` |
| `clarification_questions.json` | 用户面向问题清单 | `schemaVersion`, `source`, `questions[]` |
| `intent_resolution.json` | 原始用户回答记录 | `resolvedFields`, `notes`, `resolvedAt` |
| `frozen_semantic_intent.json` | compile 前的 canonical semantic merge | `coreFields`, `frozenFrom`, `remainingUnresolved`, `compileEligibility` |
| `execution_guide.json` | run 侧单一消费工件 | `generalPlan`, `detailContext`, `status`, `replayReady` |

进一步冻结：
- semantic hypotheses 写入 `semantic_intent_draft.json.coreFields.*.hypothesis`
- required questions 写入 `semantic_intent_draft.json.clarificationRequirements[]`
- 用户面向问题清单写入 `clarification_questions.json.questions[]`
- 最终用于 guide 编译的冻结语义，不直接读 `intent_resolution.json`，而是先编译成 `frozen_semantic_intent.json`

### 7.2.3 Frozen Semantic Intent Schema
为明确 clarify 结束后“哪份语义是 guide compiler 真源”，新增 `frozen_semantic_intent.json`：

```json
{
  "schemaVersion": "frozen_semantic_intent.v1",
  "coreFields": {
    "task_intent": {
      "value": "搜索目标博主，浏览多个帖子，并给其中一个帖子点赞",
      "status": "frozen",
      "source": "user_answer",
      "derivedFromQuestionId": "q_task_intent"
    },
    "scope": {
      "value": "搜索“第四种黑猩猩”，进入对应主页后浏览多个帖子",
      "status": "frozen",
      "source": "user_answer",
      "derivedFromQuestionId": "q_scope"
    },
    "completion_criteria": {
      "value": "已浏览多个帖子，并且至少有一个帖子完成点赞",
      "status": "frozen",
      "source": "user_answer",
      "derivedFromQuestionId": "q_completion"
    },
    "final_action": {
      "value": "like_one_post",
      "status": "frozen",
      "source": "user_answer",
      "derivedFromQuestionId": "q_final_action"
    }
  },
  "frozenFrom": {
    "semanticIntentDraft": "semantic_intent_draft.json",
    "intentResolution": "intent_resolution.json"
  },
  "remainingUnresolved": [],
  "compileEligibility": {
    "eligible": true,
    "reason": "all_core_fields_frozen"
  }
}
```

### 7.3 Question-First Clarification
clarify 阶段优先围绕四类核心字段发问：
- `task_intent`
- `scope`
- `completion_criteria`
- `final_action`

规则冻结：
- 只要四类字段中任一仍未冻结，`status` 必须保持 `needs_clarification`
- 用户若回答“后续再给”“暂时不确定”“先这样”之类占位答案，视为未冻结

### 7.3.1 Placeholder Answer Detection
占位回答 gate 第一阶段固定为 deterministic rule-based，不依赖 LLM 参与放行判定。

规则分两层：

1. 通用占位短语拦截
- 命中以下归一化短语之一，直接判为 unresolved：
  - `后续再给`
  - `暂时不确定`
  - `先这样`
  - `之后补充`
  - `待定`
  - `你先猜`
  - `先按你理解`

2. 核心字段最小完整性校验
- `task_intent`
  - 必须同时包含对象与动作语义，不能只有平台名或主题名
- `scope`
  - 必须给出边界，例如“单个对象 / 多个帖子 / 当前主页 / 搜索结果中的目标博主”
- `completion_criteria`
  - 必须给出可观察的完成条件，不能只有“先看看”“差不多就行”
- `final_action`
  - 必须明确说明最终对象动作，例如“点赞一个帖子”“只浏览不点赞”“关注博主”

若任一规则失败：
- 该字段保持 `unresolved`
- `intent_resolution.json` 不写入该字段的 frozen value
- `clarificationResult` 记录 `rejectedAnswers[]`，包含 `field + answer + reasonCode`

### 7.3.2 User-Facing Context From Skeleton
为避免 behavior 层降权后用户失去上下文，clarify 问题包必须附带最小 `questionContext`：
- `workflowSummary`
- `observedLoopSummary`
- `candidateActionSummary`
- 相关 `evidenceRefs`

目的：
- 用户在回答问题时，能看到系统目前观察到的是“搜索 -> 进入主页 -> 浏览多个帖子 -> 存在一次对象动作”
- 让 skeleton 成为回答辅助，而不是让用户重新阅读整份 trace

### 7.4 Frozen Semantic Compile
只有在核心字段冻结后，才允许：
- 合并 `behavior_workflow`
- 编译 `execution_guide.v1`
- 进入 `ready_for_replay`

### 7.4.1 Compile Precedence Rule
guide compiler 的优先级固定为：

1. `behavior_workflow.json`
- 负责步骤拓扑：顺序、loop、branch、submit/verify 的“是否曾发生”

2. `frozen_semantic_intent.json`
- 负责高层语义：`goal`, `scope`, `doneCriteria`, `final_action`, `semanticConstraints`

3. `behavior_evidence.json`
- 负责 step purpose 和 branch hints 的 evidence 回链，不拥有最终业务解释权

4. `intent_resolution.json`
- 只作为 `frozen_semantic_intent.json` 的上游输入，不允许被 guide compiler 直接消费

### 7.4.2 Conflict Resolution Between Frozen Intent And Workflow
当 `frozen_semantic_intent` 与 `behavior_workflow` 在步骤语义上冲突时，编译器按以下规则处理：

1. 保留步骤骨架，优先覆盖步骤语义
- `behavior_workflow` 的 step order / loop / branch 保留
- `step purpose`、`generalPlan.goal/scope/doneCriteria` 以 `frozen_semantic_intent` 为准重写

2. 不兼容 submit step 降级而非强行保留
- 若 `behavior_workflow` 存在 `submit_action`，但 `final_action` 冻结为“只浏览不操作”，则：
  - `generalPlan` 中不再把该 step 解释为必做提交动作
  - `detailContext.stepDetails` 中将其降级为 `optional_observed_action`
  - `branchHints` 明确标注“该动作是 observed-only，不是 replay-required”

3. 冻结语义不能凭空创造缺失骨架
- 若 `frozen_semantic_intent` 要求“点赞一个帖子”，但 `behavior_workflow` 中完全不存在兼容的对象动作骨架，则：
  - 不允许编译器凭空生成详细点赞步骤
  - 状态保持 `needs_clarification`
  - `compileEligibility.reason=missing_behavior_support_for_frozen_action`

4. 核心动作冲突时以 frozen intent 为准，但要求可解释映射
- 若 observed step 原先被猜成“关注博主”，而 `final_action` 冻结为“点赞一个帖子”，则：
  - 编译器允许改写该 step 的业务 purpose
  - 但必须在 `detailContext.resolutionNotes[]` 中记录：
    - `observedStepId`
    - `oldPurpose`
    - `newPurpose`
    - `basis=frozen_semantic_intent`

5. 冻结语义与 skeleton 完全不一致时禁止放行
- 若 `task_intent/scope/final_action` 与 `behavior_workflow` 主骨架无法形成可解释映射，则：
  - `status=needs_clarification`
  - `replayReady=false`
  - 不允许为了放行而继续“猜测式修补”

## 8. Functional Requirements
| ID | Requirement | Rule | Priority |
| --- | --- | --- | --- |
| FR-1 | Observe hygiene baseline | runtime 启动录制时只保留干净 tab；结束后关闭本次会话浏览器 | P0 |
| FR-2 | Hypothesis-first semantic draft | compact 首轮只输出猜测、问题、噪音，不直接下强结论 | P0 |
| FR-3 | Core semantic freeze | `task/scope/completion/final_action` 未冻结时不得 replay-ready | P0 |
| FR-4 | Frozen semantic compile source | guide compiler 必须消费 `frozen_semantic_intent.json`，不得直接并读 `intent_resolution.json` | P0 |
| FR-5 | Frozen intent vs workflow conflict rule | 语义冲突时保留 workflow 骨架，但以 frozen semantic 覆盖高层语义；缺失骨架支持时不得放行 | P0 |
| FR-6 | Noise isolation | 非当前任务站点或旧 tab 只能进入 noise 观察，不进入 goal/surface 主语义 | P1 |

## 9. Acceptance Criteria
| ID | Scenario | Input | Expected Output | Evidence |
| --- | --- | --- | --- | --- |
| AC-1 | 噪音录制样本首轮 compact | `run_id=20260310_110821_112` | 首轮输出不能把任务直接定成“关注博主” | `semantic_*`, `clarification_*` |
| AC-2 | 平台噪音隔离 | 同一样本混入 TikTok Shop tab | 最终 `goal/surface` 不再引用 TikTok Shop 作为主工作区 | `abstraction_input.json`, `semantic_*` |
| AC-3 | 占位回答 gate | 用户对 scope/completion 给出占位答案 | 状态保持 `needs_clarification`，不进入 `ready_for_replay` | `intent_resolution.json`, `compact_manifest.json` |
| AC-4 | 明确回答后编译 | 用户明确回答“浏览多个帖子并给其中一个点赞” | 最终 `execution_guide` 不再出现“关注博主”或“汇总帖子内容” | `execution_guide.json` |
| AC-5 | 行为骨架保留 | 同一样本 | workflow skeleton 仍能保留搜索、进入主页、浏览多个帖子、一次对象动作的结构 | `behavior_workflow.json`, `execution_guide.json` |

## 10. Migration Plan
### Phase A: Observe Hygiene Baseline
- Scope: 只改 `observe` 模块，不改 compact / clarify contract
- 录制开始时收敛浏览器到单空白 tab
- 录制结束时关闭 runtime 启动的浏览器
- 将 pre-existing tabs 标为 noise，不进入主语义
- Gate A:
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
  - 新 observe 样本不再把 pre-existing foreign tab 写入主 `surface/open_surface`

### Phase B: Hypothesis-First Draft
- Scope: 只改 compact 首轮输出 contract，不改 clarify 回答逻辑
- 将 semantic 首轮输出重构为“猜测 + 问题 + noise observations”
- 明确核心字段未冻结时不能出 final guide
- Gate B:
  - `semantic_intent_draft.v2` / `clarification_questions.v2` 可稳定落盘
  - unresolved core fields 时，`execution_guide.json` 只能是 placeholder compile
  - `20260310_110821_112` 首轮 compact 不再直接得出“关注博主”

### Phase C: Question-First Clarify
- Scope: 消费 Phase B 的 `clarificationRequirements`，实现回答校验和字段冻结
- 调整 clarify 的问题优先级，围绕核心语义字段发问
- 强化占位回答识别，不再将模糊答案视作 resolved
- Gate C:
  - 占位回答被 deterministic reject
  - 明确回答只冻结对应核心字段，不污染其他字段
  - `clarificationResult.rejectedAnswers[]` 可追溯

### Phase D: Frozen Compile and Replay Gate
- Scope: 用冻结后的 semantic intent 编译最终 guide，并收紧 replay gate
- 仅用冻结后的 semantic intent 编译 `execution_guide.v1`
- 更新 ready gate，拒绝核心字段不完整的样本
- Gate D:
  - `20260310_110821_112` 在明确回答后可正确生成 final guide
  - 既有 ready 样本 `20260308_110124_276_inline_try1` 仍保持 `ready_for_replay`
  - 既有 deterministic sample `20260308_110124_276_inline_deterministic` contract 不回退

## 11. Test Strategy
### 11.1 Primary Validation Sample
- `artifacts/e2e/20260310_110821_112`
- 目标：验证 noisy sample 下 question-first 是否比 correction-first 更稳

### 11.1.1 Regression Keep Sample
- `artifacts/e2e/20260308_110124_276_inline_try1`
- 目标：验证更严格 gate 不会把已完成 ready-path 样本错误打回

### 11.1.2 Deterministic Contract Sample
- `artifacts/e2e/20260308_110124_276_inline_deterministic`
- 目标：验证 question/answer/result contract 在 deterministic clean sample 上仍稳定

### 11.2 Deterministic Checks
- 给定含噪音 trace，验证 `noise observations` 不进入主语义字段
- 给定占位回答，验证 `needs_clarification` 不放行
- 给定明确回答，验证 final guide 严格继承人类答案
- 给定既有 ready sample，验证 stricter gate 不导致误回退

### 11.3 Manual Checks
1. 录制一个带背景标签页的样本
2. 跑 compact / clarify
3. 检查首轮输出是否先问关键问题，而不是直接给错语义
4. 回答真实意图
5. 检查 `execution_guide` 是否改为正确目标与完成条件

## 12. Risks and Mitigations
| Risk | Impact | Mitigation |
| --- | --- | --- |
| 提问过多导致交互成本上升 | 用户体验变差 | 只围绕 4 个核心字段提问，其他字段降级为非阻塞 |
| behavior 层降权后丢失自动化价值 | compact 退化成纯问答 | 保留 workflow skeleton、branch hints、observed loops，并将其压缩为 `questionContext` 供用户回答时引用 |
| 旧样本回归变慢 | 无法快速确认收益 | 先用单一样本 `20260310_110821_112` 做最小闭环回归 |

## 13. Next 1-3 Actions
1. 冻结新的 semantic ownership 边界
- 行为层只输出骨架、证据、噪音
- clarify 层负责冻结核心语义

2. 设计新的 gate 规则
- 占位回答不算 resolved
- 核心字段未冻结时不得 `ready_for_replay`

3. 用 `20260310_110821_112` 做第一条回归样本
- 对比 `question-first` 与当前 `correction-first` 输出差异
