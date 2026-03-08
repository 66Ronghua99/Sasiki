# SOP Compact Intent Abstraction v0 (2026-03-08)

## 0. Normative Source
本文档中，以下章节为实现期唯一规范源：
- `## 17. Freeze Order v1`
- `### Admission Matrix v0`
- `### Single Source Policy v0`
- `### Remaining Artifact Schema Decisions v0`
- `### State Machine v0 Frozen`
- `## 18. Minimum Validation Rules Before Implementation`
- `### Frozen Validation Set v0`

若前文的概念性描述与以上冻结章节冲突，以冻结章节为准。前文中“仅 high 触发澄清/阻断”的早期表述已被后文的“high 或 admission-blocking medium”规则替代。

## 1. Problem Statement
当前 `sop-compact` 已具备 rule-based 降噪与 optional semantic guide 生成能力，但输出仍容易把单次示教中的具体实例误提升为通用规则，导致 run 侧消费时出现“case 过拟合”：
- 具体用户名、具体消息片段、具体回复话术泄漏到 guide 主体。
- agent 将“列表状态变化”误判为“业务完成”，缺少对目标、跳过条件、完成条件的显式建模。
- 用户初始任务描述往往不完整，单靠原始 taskHint 与单次示教无法稳定恢复真实意图边界。

本阶段目标不是继续提升自然语言润色质量，而是把 `sop-compact` 升级为“可自动抽象 + 可最小澄清 + 可冻结验收”的 SOP 资产构建流程。

## 2. Scope
本阶段仅聚焦 `sop-compact` 抽象闭环，冻结如下最小输出能力：
- 从现有 `intent seed + demonstration trace/raw + webElementHints` 中自动拆分：
  - `workflow_guide`
  - `decision_model`
  - `observed_examples`
  - `clarification_questions`
  - `compact_manifest`
- 显式建模不确定项（`uncertainFields`）与资产状态：
  - `draft`
  - `needs_clarification`
  - `ready_for_replay`
  - `rejected`
- 仅在存在未解决 `high` 或 admission-blocking `medium` 时触发 compact-stage HITL。
- 将人工澄清结果作为结构化 `intent_resolution` 覆盖自动推断，而不是直接拼接自由文本到 guide。

## 3. Non-goals
- 本阶段不修改 `observe` 录制协议，不调整 `demonstration_raw.jsonl` / `demonstration_trace.json` schema。
- 本阶段不优化 run 侧消费策略、检索排序或 runtime HITL。
- 本阶段不追求对所有任务类型的完美泛化，只先建立“规则/样例分离 + 不确定项澄清”的最小闭环。
- 本阶段不做复杂对话式多轮访谈，仅支持围绕高价值边界的最小问题集。

## 4. Boundary & Ownership
- `src/runtime/sop-compact.ts`
  - 负责编排 compact pipeline：抽象、澄清触发、产物落盘。
- `src/core/semantic-compactor.ts`
  - 负责从 rule compact 和 trace 摘要中生成抽象层候选结果。
- `src/domain/*`
  - 新增或扩展 compact 相关契约：
    - `workflow_guide`
    - `decision_model`
    - `observed_examples`
    - `clarification_questions`
    - `compact_manifest`
    - `intent_resolution`
- `artifacts/e2e/{run_id}`
  - 落盘新的 compact-stage 结构化工件。

## 5. Proposed Closed Loop
1. Input Collection
- 输入：
  - `intent_seed`
  - `demonstration_raw.jsonl`
  - `demonstration_trace.json`
  - `webElementHints`
- 输出状态：`compact_started`

2. Workflow Extraction
- 从示教中提取稳定流程骨架：
  - 导航
  - 遍历
  - 比较
  - 编辑
  - 提交
  - 总检查
- 只允许输出可泛化步骤，不得混入具体实例。

3. Decision Inference
- 生成候选：
  - `selectionRules`
  - `decisionRules`
  - `doneCriteria`
  - `uncertainFields`
- 每条规则必须带 `source` 与 `confidence`。

4. Example Isolation
- 将用户名、具体文本、具体回复话术、特定页面提示等单独沉淀到 `observed_examples`。
- 对这些内容统一打 `example_only=true` 约束，禁止默认提升为 policy。

5. Uncertainty Classification
- 对不确定项做分级：
  - `high`: 阻塞 replay
  - `medium`: 允许保留但需提示
  - `low`: 记录即可
- 若存在未解决 `high` 或 admission-blocking `medium`，资产状态置为 `needs_clarification`。

6. Compact-Stage HITL
- 对未解决 `high` 与 admission-blocking `medium` 生成 2-5 个 `clarification_questions`。
- 用户回答后生成 `intent_resolution`。
- 合并优先级：
  - `intent_resolution > observed inference > intent_seed > defaults`

7. Final Freeze
- 生成最终：
  - `workflow_guide`
  - `decision_model`
  - `observed_examples`
  - `clarification_questions`
  - `compact_manifest`
- 若仍有未解决 `high` 或 admission-blocking `medium`，则不得进入 `ready_for_replay`。

## 6. Output Contract v0
### 6.1 workflow_guide
- 只描述通用流程、目标、范围、完成信号。
- 不允许出现：
  - 用户名
  - 具体消息片段
  - 固定回复全文

### 6.2 decision_model
- 必须包含：
  - `goalType`
  - `targetEntity`
  - `selectionRules`
  - `decisionRules`
  - `doneCriteria`
  - `uncertainFields`
- 每条规则必须带：
  - `source`
  - `confidence`

### 6.3 observed_examples
- 仅保存本次示教中的具体实例与证据，不参与默认 replay 规则。

### 6.4 clarification_questions
- 仅在存在未解决 `high` 或 admission-blocking `medium` 时生成。
- 每个问题必须映射到一个 `uncertainField`。

### 6.5 compact_manifest
- 汇总 runId、输出路径、状态、置信度、不确定项数量。

## 7. HITL Trigger Rules
触发 compact-stage HITL 的场景：
- 完成条件不明确。
- 跳过规则不明确。
- 回复/编辑策略不明确。
- 系统检测到实例污染正在上升为通用规则。

不触发场景：
- 纯导航细节。
- 明显可由轨迹稳定推出的流程骨架。
- 只影响文案美观、不影响执行语义的问题。

## 8. Acceptance Criteria
| ID | Scenario | Expected Output | Evidence |
| --- | --- | --- | --- |
| AC-1 | 单次示教生成抽象产物 | 同时生成 `workflow_guide/decision_model/observed_examples/compact_manifest` | 新工件文件存在 |
| AC-2 | 实例污染隔离 | 用户名、具体文本、固定回复全文不出现在 `workflow_guide` | guide 内容检查 |
| AC-3 | 决策显式化 | `decision_model` 包含规则、完成条件、不确定项，且带 `source/confidence` | `decision_model.json` |
| AC-4 | HITL 触发可控 | 存在未解决 `high` 或 admission-blocking `medium` 时生成 `clarification_questions` 并置 `needs_clarification` | `clarification_questions.json` + `compact_manifest.json` |
| AC-5 | 冻结门禁 | 未解决 `high` 或 admission-blocking `medium` 时不得进入 `ready_for_replay` | `compact_manifest.json` |

## 9. Verification Strategy
Static:
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

Manual:
1. 选择一个容易过拟合的客服示教样例。
2. 运行 `sop-compact` 新流程。
3. 检查 `workflow_guide` 是否仍包含具体实例污染。
4. 检查 `decision_model` 是否显式暴露关键不确定项。
5. 若有未解决 `high` 或 admission-blocking `medium`，确认状态为 `needs_clarification` 而非 `ready_for_replay`。

## 10. Deferred Scope
- 录制阶段决策点采集增强。
- compact-stage HITL 的具体 UI/交互协议。
- replay 侧消费 `decision_model` 的策略收紧。
- 跨 run 归纳与学习。

## 11. P0 Next
冻结 `decision_model/uncertainFields/intent_resolution` 的字段级 schema，并明确 `high` / admission-blocking `medium` 的门禁规则。

## 12. Field-Level Schema Draft v0
### 12.1 intent_seed
用途：
- 保留用户原始任务表达与最小上下文。
- 不直接作为最终 replay 规则，只作为抽象输入之一。

建议字段：
```json
{
  "schemaVersion": "intent_seed.v0",
  "runId": "20260308_110124_276",
  "rawTask": "把未分配的客服消息全部都回复了",
  "site": "seller.tiktokshopglobalselling.com",
  "surface": "chat_inbox_current",
  "capturedAt": "2026-03-08T00:00:00.000Z"
}
```

字段说明：
- `rawTask`: 用户原始任务语句，允许模糊。
- `site`: 站点主域名。
- `surface`: 页面/功能面标识。

### 12.2 workflow_guide
用途：
- 只描述可泛化流程、前置条件、完成信号。
- 不允许出现具体实例污染。

建议字段：
```json
{
  "schemaVersion": "workflow_guide.v0",
  "taskName": "处理未分配客服消息",
  "goal": "处理当前页面中的目标未分配会话",
  "scope": {
    "site": "seller.tiktokshopglobalselling.com",
    "surface": "chat_inbox_current",
    "targetCollection": "conversation_thread"
  },
  "preconditions": [
    "已登录目标系统",
    "可进入目标收件箱"
  ],
  "steps": [
    {
      "id": "open_inbox",
      "kind": "navigate",
      "summary": "进入客服收件箱"
    },
    {
      "id": "inspect_unassigned_threads",
      "kind": "iterate_collection",
      "summary": "遍历未分配会话"
    },
    {
      "id": "assign_thread",
      "kind": "state_change",
      "summary": "将目标会话分配给当前操作者"
    },
    {
      "id": "inspect_thread",
      "kind": "decision_gate",
      "summary": "打开会话并检查是否需要人工回复"
    },
    {
      "id": "reply_if_needed",
      "kind": "conditional_action",
      "summary": "必要时根据会话内容发送回复"
    },
    {
      "id": "verify_completion",
      "kind": "verification",
      "summary": "确认所有目标会话已检查完成"
    }
  ],
  "completionSignals": [
    "所有目标会话已检查",
    "需要回复的会话已发送回复",
    "跳过项有明确原因"
  ]
}
```

`steps.kind` 枚举：
- `navigate`
- `iterate_collection`
- `filter`
- `state_change`
- `decision_gate`
- `conditional_action`
- `verification`

### 12.3 decision_model
用途：
- 显式表达“选谁、怎么判、什么时候算完成”。
- 这是 compact 最重要的可消费契约。

建议字段：
```json
{
  "schemaVersion": "decision_model.v0",
  "goalType": "collection_processing",
  "targetEntity": "conversation_thread",
  "selectionRules": [
    {
      "id": "select_unassigned_threads",
      "rule": "处理当前未分配会话",
      "source": "inferred_from_trace",
      "confidence": "high"
    }
  ],
  "decisionRules": [
    {
      "id": "human_reply_rule",
      "condition": "会话中已存在人工回复",
      "action": "skip_or_mark_done",
      "source": "uncertain",
      "confidence": "low"
    },
    {
      "id": "bot_reply_rule",
      "condition": "会话仅存在机器人回复",
      "action": "needs_manual_reply",
      "source": "uncertain",
      "confidence": "low"
    },
    {
      "id": "reply_strategy_rule",
      "condition": "会话需要人工回复",
      "action": "generate_reply_from_thread_content",
      "source": "inferred_from_trace",
      "confidence": "medium"
    }
  ],
  "doneCriteria": [
    {
      "id": "all_target_threads_checked",
      "rule": "所有目标会话都已打开并检查",
      "source": "inferred_from_trace",
      "confidence": "medium"
    },
    {
      "id": "all_required_replies_sent",
      "rule": "所有需要人工回复的会话都已发送回复",
      "source": "uncertain",
      "confidence": "low"
    }
  ],
  "uncertainFields": [
    {
      "field": "human_reply_counts_as_done",
      "severity": "high",
      "reason": "示教未稳定覆盖已有人工回复时的跳过逻辑"
    },
    {
      "field": "bot_reply_counts_as_done",
      "severity": "high",
      "reason": "示教无法区分机器人回复是否算完成"
    },
    {
      "field": "reply_style_policy",
      "severity": "medium",
      "reason": "示教只出现单个具体话术，无法直接推断是模板还是按内容生成"
    }
  ]
}
```

`goalType` 枚举：
- `single_object_update`
- `collection_processing`
- `search_and_select`
- `form_submission`
- `multi_step_transaction`

`targetEntity` 枚举：
- `conversation_thread`
- `product`
- `order`
- `listing`
- `form`
- `generic_page_object`

`source` 枚举：
- `intent_seed`
- `inferred_from_trace`
- `inferred_from_examples`
- `human_clarified`
- `default_rule`
- `uncertain`

`confidence` 枚举：
- `high`
- `medium`
- `low`

### 12.4 uncertainFields Grading
用途：
- 决定是否触发 compact-stage HITL，以及资产是否可进入 replay。

分级规则：
- `high`
  - 会直接改变目标对象、跳过条件、完成条件或提交行为。
  - 未解决时必须阻止 `ready_for_replay`。
- `medium`
  - 不改变主闭环能否执行，但会影响策略质量、回复风格或效率。
  - 可进入 replay，但需要显式风险提示。
- `low`
  - 只影响表述细节、命名、文案可读性。
  - 记录即可，不阻塞 replay。

建议阻塞字段类型：
- `doneCriteria` 未明确
- `skip condition` 未明确
- `submission requirement` 未明确
- `target scope` 未明确

### 12.5 observed_examples
用途：
- 保存这次示教中的具体实例，防止它们污染通用流程。

建议字段：
```json
{
  "schemaVersion": "observed_examples.v0",
  "examples": [
    {
      "id": "thread_example_1",
      "entityType": "conversation_thread",
      "observedSignals": {
        "username": "thanhhangg903",
        "messageSnippet": "Và nhận về khác nhau hoàn toàn",
        "operatorName": "Customer Service580"
      },
      "observedAction": {
        "type": "reply",
        "replySnippet": "很抱歉您收到的样品跟视频的有差异..."
      },
      "exampleOnly": true
    }
  ],
  "antiPromotionRules": [
    "用户名不能默认提升为筛选条件",
    "具体消息片段不能默认提升为任务目标",
    "固定回复全文不能默认提升为统一模板"
  ]
}
```

### 12.6 clarification_questions
用途：
- 只补关键边界，不做开放式访谈。

建议字段：
```json
{
  "schemaVersion": "clarification_questions.v0",
  "questions": [
    {
      "id": "q_human_reply_done",
      "topic": "completion",
      "question": "已有人工回复的会话，是否可以直接视为已处理并跳过？",
      "targetsField": "human_reply_counts_as_done",
      "priority": "high"
    },
    {
      "id": "q_bot_reply_done",
      "topic": "completion",
      "question": "只有机器人自动回复的会话，是否仍需要人工补充回复？",
      "targetsField": "bot_reply_counts_as_done",
      "priority": "high"
    },
    {
      "id": "q_reply_style",
      "topic": "reply_policy",
      "question": "回复应按会话内容生成，还是允许对同类问题复用固定模板？",
      "targetsField": "reply_style_policy",
      "priority": "medium"
    }
  ]
}
```

约束：
- 最多 5 个问题。
- 每个问题必须映射到一个 `uncertainField`。
- 若无 `high` 不确定项，可不生成该文件。

### 12.7 intent_resolution
用途：
- 保存人工澄清结果，作为最高优先级结构化意图覆盖。

建议字段：
```json
{
  "schemaVersion": "intent_resolution.v0",
  "resolvedFields": {
    "human_reply_counts_as_done": true,
    "bot_reply_counts_as_done": false,
    "reply_style_policy": "generate_from_thread_content"
  },
  "notes": [
    "已有人工回复可跳过",
    "机器人回复不算人工完成"
  ],
  "resolvedAt": "2026-03-08T00:00:00.000Z"
}
```

### 12.8 compact_manifest
用途：
- 汇总 compact 产物、状态与可 replay 判定。

建议字段：
```json
{
  "schemaVersion": "compact_manifest.v0",
  "runId": "20260308_110124_276",
  "status": "needs_clarification",
  "artifacts": {
    "workflowGuideJson": "workflow_guide.json",
    "workflowGuideMd": "workflow_guide.md",
    "decisionModel": "decision_model.json",
    "observedExamples": "observed_examples.json",
    "clarificationQuestions": "clarification_questions.json",
    "intentResolution": null
  },
  "quality": {
    "exampleCount": 1,
    "highUncertaintyCount": 2,
    "mediumUncertaintyCount": 1,
    "pollutionDetected": true
  }
}
```

`status` 枚举：
- `draft`
- `needs_clarification`
- `ready_for_replay`
- `rejected`

## 13. Merge Priority Rules
意图合并优先级固定为：
1. `intent_resolution`
2. `decision_model` 中 `source=human_clarified` 的规则项
3. `inferred_from_trace`
4. `intent_seed`
5. `default_rule`

规则：
- 高优先级来源覆盖低优先级来源。
- 被人工澄清覆盖的字段，`source` 必须改写为 `human_clarified`。
- 若高优先级字段与低优先级字段冲突，保留冲突审计记录，但最终 replay 只消费最高优先级值。

## 14. ready_for_replay Gate v0
资产进入 `ready_for_replay` 必须同时满足：
- `workflow_guide` 不含实例污染。
- `decision_model` 已包含 `selectionRules/decisionRules/doneCriteria`。
- `high severity uncertainFields = 0`。
- 不存在 admission-blocking `medium`。
- 若产生 `clarification_questions`，则对应 blocking 字段已被 `intent_resolution` 解决。
- `compact_manifest.status` 已显式设置为 `ready_for_replay`。

以下任一情况必须阻止 replay：
- 目标对象不明确。
- 完成条件不明确。
- “需要发送/提交” 是否发生无法判断。
- 关键跳过条件缺失。

## 15. Resolved Review Questions
- `medium` 不确定项放行策略：已冻结为 admission matrix；若为 admission-blocking，则必须触发澄清并阻断 replay。
- `workflow_guide` 主从关系：已冻结为 `workflow_guide.json` 单一真源，`workflow_guide.md` 仅渲染。
- `observed_examples` 拆分粒度：v0 不拆文件，统一保留单文件并用 `entityType` 区分。

## 16. Review Outcome (2026-03-08)
本轮 review 结论：
- 总体方向通过：`uncertainFields + compact-stage HITL + ready_for_replay gate` 已形成可验证闭环。
- 当前进入实现前仍有 3 个阻塞点需要一次性冻结：
  1. `medium` 不确定项放行策略
  2. `workflow_guide` 的 `.md/.json` 主从关系
  3. `observed_examples` / `clarification_questions` / `compact_manifest` 的字段级 schema 与状态机转移规则

review 建议的 P0 收敛顺序：
1. 先冻结放行矩阵：`goalType x uncertaintySeverity -> replay gate behavior`
2. 再冻结工件主从关系：`JSON` 为单一真源，`MD` 仅作为渲染产物
3. 最后冻结字段级 schema 与状态机转移规则，再进入实现

## 17. Freeze Order v1
### Step A: Admission Matrix
先定义不同 `goalType` 在不同不确定级别下的放行策略，至少覆盖：
- `single_object_update`
- `collection_processing`
- `search_and_select`
- `form_submission`
- `multi_step_transaction`

最小原则：
- 任意 `goalType` 下，只要存在未解决 `high`，一律不得进入 `ready_for_replay`
- `medium` 是否允许放行，取决于它是否影响：
  - 目标对象
  - 跳过规则
  - 完成条件
  - 提交/发送动作

### Admission Matrix v0
| goalType | high unresolved | medium unresolved | low unresolved | Replay Admission |
| --- | --- | --- | --- | --- |
| `single_object_update` | Block | Allow with warning if medium does not affect target selection or final submit semantics | Allow | `ready_for_replay` only when submit target and success signal remain deterministic |
| `collection_processing` | Block | Default block if medium affects iteration scope, skip rules, done criteria, or reply/send policy; otherwise allow with warning | Allow | Prefer conservative gating because list tasks amplify policy drift |
| `search_and_select` | Block | Allow with warning if medium only affects ranking preference; block if it affects selection criteria | Allow | Search result choice must remain auditable |
| `form_submission` | Block | Default block if medium affects required field mapping, validation expectations, or submit criteria; otherwise allow with warning | Allow | Form tasks are high-cost for silent drift |
| `multi_step_transaction` | Block | Block by default | Allow with warning only if low is presentation-only | Transaction tasks require near-deterministic policy |

### Medium Severity Decision Rule
对 `medium` 不确定项采用两段式判断：
1. 若影响以下任一项，则提升为 admission-blocking：
   - 目标对象选择
   - 列表遍历范围
   - 跳过/保留规则
   - 完成条件
   - 提交/发送动作是否发生
   - 关键字段映射
2. 若仅影响以下项，则允许 replay 但必须显式 warning：
   - 回复风格
   - 排序偏好
   - 文案措辞
   - 辅助展示信息

### GoalType-Specific Notes
- `single_object_update`
  - 允许少量风格类 `medium` 放行，因为对象唯一且回查成本低。
- `collection_processing`
  - 默认最保守；这类任务最容易因为“跳过条件”或“doneCriteria”不明而出现伪完成。
- `search_and_select`
  - 搜索类任务可以容忍偏好级别的不确定，但不能容忍选择规则本身模糊。
- `form_submission`
  - 字段映射或提交流程不明时必须阻断；否则容易写错数据。
- `multi_step_transaction`
  - 默认视为高风险链路，除 presentation-only 的低级不确定项外，不放行。

### Step B: Single Source of Truth
冻结工件主从关系：
- `workflow_guide.json` 为单一真源
- `workflow_guide.md` 若存在，仅为渲染结果，不作为 replay 输入
- `decision_model.json`
- `observed_examples.json`
- `clarification_questions.json`
- `intent_resolution.json`
- `compact_manifest.json`
统一由 JSON 契约驱动，避免 run 侧同时消费两套不一致文本。

### Single Source Policy v0
最终决议：
- `workflow_guide.json` 是唯一可消费 guide 契约。
- `workflow_guide.md` 仅用于：
  - 人类 review
  - 调试
  - 文档展示
- replay、检索、状态机和校验逻辑一律只读取 JSON。
- 严禁从 `workflow_guide.md` 反向解析回结构化字段。

派生规则：
- `workflow_guide.md` 必须由 `workflow_guide.json` 单向渲染生成。
- 当 `.md` 与 `.json` 表达冲突时，以 `.json` 为准。
- 若未生成 `.md`，不得阻塞 `ready_for_replay` 判定。

### Step C: Schema + State Machine
冻结以下状态与转移：
- `draft`
- `needs_clarification`
- `ready_for_replay`
- `rejected`

最小状态转移规则：
- `draft -> needs_clarification`
  - 条件：存在未解决 `high` 或 admission-blocking `medium`
- `draft -> ready_for_replay`
  - 条件：`high=0`、不存在 admission-blocking `medium` 且通过污染检测与结构完整性校验
- `needs_clarification -> ready_for_replay`
  - 条件：所有 blocking uncertainties 已被 `intent_resolution` 覆盖
- `draft|needs_clarification -> rejected`
  - 条件：实例污染严重、关键字段缺失或产物不可解析

### Remaining Artifact Schema Decisions v0
#### observed_examples.json
最终决议：
- v0 不按实体类型拆文件。
- 统一保留单文件 `observed_examples.json`，每条 example 自带 `entityType`。
- 该文件仅保存“具体实例证据”，不参与默认 replay 规则。

最小字段：
```json
{
  "schemaVersion": "observed_examples.v0",
  "examples": [
    {
      "id": "example_1",
      "entityType": "conversation_thread",
      "observedSignals": {},
      "observedAction": {},
      "exampleOnly": true
    }
  ],
  "antiPromotionRules": []
}
```

约束：
- `examples[*].id` 必须唯一
- `entityType` 必填
- `exampleOnly` 必须恒为 `true`

#### clarification_questions.json
最终决议：
- v0 保持单文件
- 仅在存在未解决 `high` 或 admission-blocking `medium` 时生成
- 问题数量上限为 `5`

最小字段：
```json
{
  "schemaVersion": "clarification_questions.v0",
  "questions": [
    {
      "id": "q1",
      "topic": "completion",
      "question": "示例问题",
      "targetsField": "human_reply_counts_as_done",
      "priority": "high"
    }
  ]
}
```

约束：
- 每个 `targetsField` 必须存在于 `decision_model.uncertainFields`
- `priority` 仅允许 `high|medium`
- 无需澄清时可不生成该文件
- 若存在 blocking uncertainty，则该文件必须生成

#### compact_manifest.json
最终决议：
- `compact_manifest.json` 是 compact 阶段的唯一状态真源
- `status` 只能在此文件中声明
- 其他工件禁止各自携带独立状态字段

最小字段：
```json
{
  "schemaVersion": "compact_manifest.v0",
  "runId": "20260308_110124_276",
  "status": "draft",
  "artifacts": {
    "workflowGuideJson": "workflow_guide.json",
    "workflowGuideMd": "workflow_guide.md",
    "decisionModel": "decision_model.json",
    "observedExamples": "observed_examples.json",
    "clarificationQuestions": null,
    "intentResolution": null
  },
  "quality": {
    "highUncertaintyCount": 0,
    "mediumUncertaintyCount": 0,
    "lowUncertaintyCount": 0,
    "pollutionDetected": false
  }
}
```

约束：
- `status` 仅允许 `draft|needs_clarification|ready_for_replay|rejected`
- `workflowGuideJson`、`decisionModel`、`observedExamples` 必填
- `quality.*Count` 必须与 `decision_model.uncertainFields` 一致

### State Machine v0 Frozen
允许转移：
- `draft -> needs_clarification`
- `draft -> ready_for_replay`
- `draft -> rejected`
- `needs_clarification -> ready_for_replay`
- `needs_clarification -> rejected`

禁止转移：
- `ready_for_replay -> draft`
- `ready_for_replay -> needs_clarification`
- `rejected -> *`

转移 guard：
- `draft -> needs_clarification`
  - `highUncertaintyCount > 0`
  - 或存在 admission-blocking `medium`
- `draft -> ready_for_replay`
  - `highUncertaintyCount = 0`
  - 不存在 admission-blocking `medium`
  - 通过结构完整性与污染检测
- `needs_clarification -> ready_for_replay`
  - 所有 blocking uncertainties 已被 `intent_resolution` 覆盖
  - 重新计算后仍满足 admission matrix
- `draft|needs_clarification -> rejected`
  - 工件缺失
  - JSON 不可解析
  - 污染检测失败且无法自动隔离
  - `targetsField` 映射不完整

## 18. Minimum Validation Rules Before Implementation
进入实现前先冻结最小自动校验清单：
1. 实例污染检测
- `workflow_guide` 不得包含：
  - 用户名
  - 具体消息片段
  - 固定回复全文

2. Replay Gate 校验
- `compact_manifest.status=ready_for_replay` 前必须保证：
  - `high severity uncertainFields = 0`
  - 不存在 admission-blocking `medium`
  - `selectionRules/decisionRules/doneCriteria` 齐全

3. Question Mapping 完整性
- 每个 `clarification_question.targetsField` 必须能映射到一个 `uncertainField`
- 每个 blocking uncertainty 必须有对应问题，除非已被 `intent_resolution` 解决

4. Admission Matrix Consistency
- `compact_manifest.status=ready_for_replay` 时，必须能根据 `goalType + unresolved uncertainties` 推导出“允许放行”
- 若推导结果为 block，状态机不得进入 `ready_for_replay`

### Frozen Validation Set v0
实现前最小自动校验固定为 5 条：
1. `workflow_guide_pollution_check`
- 检测 `workflow_guide` 是否含实例污染

2. `decision_model_shape_check`
- 校验 `selectionRules/decisionRules/doneCriteria/uncertainFields` 完整性

3. `question_mapping_check`
- 校验每个 `clarification_question.targetsField` 都映射到 `uncertainField`

4. `manifest_consistency_check`
- 校验 `compact_manifest.quality` 与 `decision_model.uncertainFields` 计数一致

5. `replay_gate_check`
- 基于 `goalType + unresolved uncertainties + admission matrix` 计算是否允许进入 `ready_for_replay`

## 19. Updated P0 Next
实现前设计冻结已完成；下一步等待最终 review，确认后再进入实现。
