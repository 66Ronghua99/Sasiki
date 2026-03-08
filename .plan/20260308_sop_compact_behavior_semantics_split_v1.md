# SOP Compact Behavior / Semantics Split v1 (2026-03-08)

## 0. Normative Source
本文档为 `sop-compact` 下一阶段的唯一设计依据。若历史文档与本文冲突，以本文为准。

本文替代以下已归档文档：
- `.plan/20260308_sop_compact_intent_abstraction_v0.md`
- `.plan/checklist_sop_compact_intent_abstraction_v0.md`

## 1. Why V0 Is Archived
V0 已经证明两件事：
- `structured_abstraction` 主链路可以打通，且能产出 `execution_guide.json`
- `needs_clarification` / `ready_for_replay` 的 gate 思路成立

但 V0 的核心问题没有解决：
- 它仍把领域语义放进抽象层，例如 `TargetEntity` / `GoalType`
- `decision_model` 和 `execution_guide` 仍受这些领域语义字段驱动
- deterministic fallback 仍会继续拼接业务含义，导致边界不干净

这会带来两个直接后果：
1. schema 对电商客服 case 有偏置，迁移到 Excel、CMS、后台配置台时会继续漂移
2. deterministic / agent / HITL 的责任分层不清，后续实现会不断堆 if/else 和 case-specific 模板

因此，V1 的目标不是继续修补 V0，而是重新冻结一套更干净的 artifact 和执行模型：
- deterministic 只抽象网页操作行为
- agent 负责解释这些行为的业务用途和语义边界
- agent 不确定时，直接通过 HITL 向用户补齐

## 2. Problem Statement
`watch once` 的本质不是“给一次录制贴一个任务标签”，而是：
- 从示教中抽取可迁移的行为结构
- 让 agent 理解这些行为在当前任务里的业务用途
- 在不确定时向用户提最少的问题
- 最后编译成一份真正能给 runtime 消费的执行指南

V0 的失败点不是输出工件太少，而是抽象层级放错：
- 应该抽象行为的地方，混入了领域语义
- 应该由 agent 判定的地方，被 deterministic schema 提前定死
- 应该向用户求证的地方，被 fallback 模板悄悄代填

## 3. Scope
V1 只做 `sop-compact` 的设计冻结，不写迁移代码。范围包含：
- 重定义 compact artifact 体系
- 去掉 V0 中不合理的领域语义核心字段
- 明确 deterministic / agent / HITL 的责任边界
- 明确 `execution_guide.json` 的上游依赖和编译条件
- 给出从 V0 迁移到 V1 的最小计划

## 4. Non-goals
本阶段不做以下事项：
- 不修改 observe 录制协议
- 不修改 runtime HITL 主链路
- 不优化检索模块
- 不要求一次性解决所有网站/任务类型的泛化问题
- 不继续扩写 V0 代码路径

## 5. Design Principles
### 5.1 Deterministic Only Owns Behavior
确定性层只允许输出跨域可复用的网页行为抽象，例如：
- `open_surface`
- `switch_context`
- `locate_candidate`
- `iterate_collection`
- `inspect_state`
- `edit_content`
- `submit_action`
- `verify_outcome`

它只能回答：
- 用户做了什么行为
- 行为顺序和局部结构是什么
- 哪些行为存在重复、切换、验证、提交等模式

它不能回答：
- 当前对象是什么业务对象
- 当前任务属于客服、Excel、订单还是别的领域
- 哪条规则才算真正完成
- 这段输入文本到底代表什么业务策略

### 5.2 Agent Owns Semantic Interpretation
agent 负责把行为结构解释成任务语义，包括：
- 这些行为到底服务于什么任务目标
- 列表/表单/会话中的对象在业务上是什么
- 哪些选择/跳过/完成标准是合理的
- 哪些地方无法从证据中稳定推出

这里的输出必须是 hypothesis，不是硬编码枚举。

### 5.3 HITL Owns Unresolved Semantics
如果 agent 无法稳定解释：
- 目标范围
- 跳过条件
- 完成条件
- 关键动作的业务用途

则必须向用户提问。

V1 中，`clarification_questions` 不再由 deterministic 模板兜底生成业务问题；deterministic 只负责校验 coverage。若 blocking uncertainty 没有对应问题，则资产不得放行。

### 5.4 Execution Guide Is the Only Replay Contract
`execution_guide.json` 仍是 runtime 唯一消费工件。
但它的来源必须变成：
- `behavior_workflow.json`
- `semantic_intent_draft.json`
- `intent_resolution.json`（如存在）
- `compact_manifest.json`

而不是依赖带领域偏置的 `decision_model.targetEntity/goalType`。

## 6. Artifact Layering v1
V1 将产物分成四层：
1. behavior evidence
2. agent semantic draft
3. clarification / resolution
4. replay guide

### 6.1 behavior_evidence.json
作用：deterministic 真源，只保存可审计的行为证据。

建议字段：
```json
{
  "schemaVersion": "behavior_evidence.v1",
  "runId": "...",
  "traceId": "...",
  "site": "...",
  "surface": "...",
  "rawTask": "...",
  "actionSummary": {},
  "phaseSignals": [],
  "stepEvidence": [],
  "exampleCandidates": [],
  "uncertaintyCues": []
}
```

约束：
- 不出现 `TargetEntity`
- 不出现 `GoalType`
- 不出现业务对象枚举
- `surface` 仅是页面结构定位，不是业务领域标签

### 6.2 behavior_workflow.json
作用：从 `behavior_evidence` 中抽出的行为流程骨架。

建议字段：
```json
{
  "schemaVersion": "behavior_workflow.v1",
  "steps": [
    {
      "id": "step_1",
      "primitive": "open_surface",
      "summary": "进入目标工作区",
      "evidenceRefs": ["signal_1_open_surface"]
    }
  ],
  "branchPoints": [],
  "observedLoops": [],
  "submitPoints": [],
  "verificationPoints": []
}
```

这里描述的是行为，不是业务解释。
例如：
- “遍历候选项”可以存在
- “处理客服会话”不能在这一层被确定

### 6.3 semantic_intent_draft.json
作用：agent 基于 `behavior_evidence + behavior_workflow + observed_examples + rawTask` 输出的语义解释草案。

建议字段：
```json
{
  "schemaVersion": "semantic_intent_draft.v1",
  "taskIntentHypothesis": "...",
  "scopeHypothesis": "...",
  "completionHypothesis": "...",
  "actionPurposeHypotheses": [
    {
      "stepId": "step_3",
      "purpose": "...",
      "confidence": "medium",
      "evidenceRefs": ["..."]
    }
  ],
  "selectionHypotheses": [],
  "skipHypotheses": [],
  "blockingUncertainties": [],
  "nonBlockingUncertainties": []
}
```

关键变化：
- 不再使用封闭枚举 `TargetEntity`
- 不再使用封闭枚举 `GoalType`
- 用开放语义 hypothesis + confidence 表达 agent 的理解

### 6.4 observed_examples.json
作用：单次示教中的具体实例。

保持原则不变：
- 只保留 example
- 不得直接提升为 policy

### 6.5 clarification_questions.json
作用：对 `semantic_intent_draft` 中 unresolved blocking semantics 的提问集合。

建议字段：
```json
{
  "schemaVersion": "clarification_questions.v1",
  "questions": [
    {
      "id": "q_1",
      "targetsSemanticField": "completionHypothesis",
      "question": "...",
      "priority": "high"
    }
  ]
}
```

V1 规则：
- 问题由 agent 产出
- deterministic 只校验每个 blocking uncertainty 是否有对应问题
- 若缺问题，不自动模板补题，直接阻断状态推进

### 6.6 intent_resolution.json
作用：用户对 `clarification_questions` 的回答，以结构化方式覆盖语义草案。

建议字段：
```json
{
  "schemaVersion": "intent_resolution.v1",
  "resolvedFields": {
    "completionHypothesis": "...",
    "scopeHypothesis": "..."
  },
  "notes": [],
  "resolvedAt": "..."
}
```

### 6.7 execution_guide.json
作用：最终 replay-facing guide。

建议字段：
```json
{
  "schemaVersion": "execution_guide.v1",
  "runId": "...",
  "status": "needs_clarification",
  "replayReady": false,
  "goal": "...",
  "scope": "...",
  "workflow": [],
  "semanticConstraints": [],
  "doneCriteria": [],
  "allowedAssumptions": [],
  "unresolvedQuestions": []
}
```

这里保留单一消费工件原则，但去掉 `goalType/targetEntity` 这类封闭业务标签。

### 6.8 compact_manifest.json
作用：单点声明状态、路径、质量信息。

V1 需新增：
- `semanticCoverageOk`
- `blockingUncertaintyCount`
- `questionCoverageOk`

## 7. Execution Model v1
### Stage A. Deterministic Behavior Extraction
输入：
- `demonstration_trace.json`
- `sop_compact.md` 的 rule artifacts

输出：
- `behavior_evidence.json`
- `behavior_workflow.json`
- `observed_examples.json`

这里不做业务对象推断。

### Stage B. Agent Semantic Drafting
输入：
- `behavior_evidence.json`
- `behavior_workflow.json`
- `observed_examples.json`
- `rawTask`

输出：
- `semantic_intent_draft.json`
- `clarification_questions.json`

要求：
- 语义解释必须可追溯到 evidence refs
- 无法确定的语义必须进 uncertainty
- 不允许把 observed example 直接当规则

### Stage C. Validation
deterministic 只做：
- schema shape check
- example pollution check
- question coverage check
- replay gate check

不再做：
- 模板化业务问题生成
- 领域对象 fallback 推断
- `targetEntity/goalType` 纠偏以外的业务语义填补

注：是否保留 `goalType` 的行为级纠偏，需要在实现时收口成内部诊断字段，而不是最终 schema。它不能再出现在 replay-facing contracts 里。

### Stage D. HITL Resolution
若 `semantic_intent_draft` 中存在 blocking uncertainty：
- 进入 `needs_clarification`
- 读取 `clarification_questions.json`
- 用户回答后生成 `intent_resolution.json`

### Stage E. Compile for Replay
由：
- `behavior_workflow.json`
- `semantic_intent_draft.json`
- `intent_resolution.json`
- `compact_manifest.json`

编译：
- `execution_guide.json`

## 8. State Machine v1
保留状态：
- `draft`
- `needs_clarification`
- `ready_for_replay`
- `rejected`

转移规则：
1. `draft -> needs_clarification`
- 条件：存在 blocking uncertainty，且问题覆盖完整

2. `draft -> rejected`
- 条件：agent semantic draft 缺失、schema 非法、或 blocking uncertainty 无对应问题

3. `needs_clarification -> ready_for_replay`
- 条件：blocking uncertainty 已被 `intent_resolution` 覆盖，且 replay gate 通过

4. `needs_clarification -> rejected`
- 条件：回答后仍有 blocking uncertainty unresolved

## 9. HITL Trigger Rules v1
触发条件：
- agent 无法确定任务的语义目标
- agent 无法确定行为的业务用途
- agent 无法确定完成边界
- agent 无法确定选择/跳过规则

不触发条件：
- 纯页面路径或 UI 噪声
- 可由行为证据稳定推出的 primitive 顺序

V1 关键要求：
- HITL 针对 semantic ambiguity
- 不是针对 behavior extraction

## 10. Migration Plan From V0
### 10.1 Keep as Historical Artifacts
V0 保留以下工件和代码作为迁移参考：
- `abstraction_input.json`
- `workflow_guide.json`
- `decision_model.json`
- `observed_examples.json`
- `clarification_questions.json`
- `execution_guide.json`

### 10.2 Deprecate in Core Schema
以下字段/概念从 V1 核心契约中移除：
- `TargetEntity`
- `GoalType`
- `decision_model.targetEntity`
- `execution_guide.scope.targetEntity`
- `execution_guide.scope.goalType`

### 10.3 Replace With New Artifacts
- `abstraction_input.json` -> `behavior_evidence.json`
- `workflow_guide.json` -> `behavior_workflow.json`
- `decision_model.json` -> `semantic_intent_draft.json`
- `clarification_questions.json` 保留，但语义来源改成 agent-owned
- `execution_guide.json` 保留为最终消费工件，但 schema 重定义

### 10.4 Implementation Order
1. 新增 V1 domain contracts
2. 仅实现 `behavior_evidence` / `behavior_workflow` 落盘
3. 接入 `semantic_intent_draft` prompt
4. 接入 `clarification_questions` 覆盖校验
5. 最后重写 `execution_guide` 编译器

### 10.5 Migration Status
- Phase-0 已完成：V1 domain contracts 已新增，`behavior_evidence.json` / `behavior_workflow.json` 已在 `sop-compact` 中双写落盘。
- Phase-1 已完成：`semantic_intent_draft.json` / `semantic_intent_raw.txt` 已接入并落盘，当前链路为 `behavior_evidence + behavior_workflow + observed_examples -> semantic_intent_draft`。
- 当前进入 Phase-2：迁移 `clarification_questions` 到 agent-owned 语义链路，但继续保留 V0 的 `decision_model / execution_guide` 作为稳定消费与对照基线。
- 迁移策略保持 `add-first`：未验证通过前，不直接替换现有 V0 replay-facing 输出。

## 11. Acceptance Criteria
| ID | Scenario | Expected Output | Evidence |
| --- | --- | --- | --- |
| AC-1 | V0 归档 | V0 文档带 archive note，且有替代文档路径 | `.plan/20260308_sop_compact_intent_abstraction_v0.md` |
| AC-2 | V1 设计冻结 | 完成新的 artifact split、状态机、迁移计划 | `.plan/20260308_sop_compact_behavior_semantics_split_v1.md` |
| AC-3 | 责任边界清晰 | deterministic / agent / HITL 的边界明确且可实现 | 文档章节 5/7/9 |
| AC-4 | 去领域偏置 | V1 核心 schema 不再依赖 `TargetEntity/GoalType` | 文档章节 6/10 |
| AC-5 | replay 真源不变 | `execution_guide.json` 继续是唯一 replay-facing guide | 文档章节 6.7 |

## 12. Verification Strategy
本轮仅做文档验证：
1. 检查 V0 文档已加 archive note
2. 检查 V1 文档明确移除了 `TargetEntity/GoalType` 的核心驱动地位
3. 检查 V1 定义了新的 artifact split
4. 检查 `PROGRESS/NEXT_STEP/MEMORY` 已同步到 V1

## 13. P0 Next
review V1 设计并冻结以下点，然后再开始迁移代码：
1. `behavior_workflow.json` 是否作为 deterministic 真源
2. `semantic_intent_draft.json` 的最小字段集合
3. `clarification_questions` 是否严格 agent-owned
4. `execution_guide.json` 的 V1 最小消费 schema
