# SOP Compact V1 Full-Chain Shift (2026-03-09)

## 0. Normative Source
本文档是 `sop-compact` 下一阶段的唯一实现依据。

本文建立在以下文档之上：
- `.plan/20260308_sop_compact_behavior_semantics_split_v1.md`
- `.plan/checklist_sop_compact_behavior_semantics_split_v1.md`

若本文与上述文档冲突，以本文为准。

## 1. Why This Design Update Exists
当前样本 `run_id=20260308_110124_276` 已证明三件事：
- OpenRouter + `minimax/minimax-m2.1` 已可跑通三次语义调用
- `semantic_intent_draft.json` 已开始体现 V1 价值
- gate 仍能阻止不稳定资产进入 `ready_for_replay`

但也同时暴露出当前主链路仍被 V0 牵制：
1. `clarification_questions.json` 仍是“模型产出 + 模板补齐”的混合物
2. `structured_abstraction_draft.json` 的 step kind 仍不稳定，需要后处理归一化
3. `execution_guide.json` 仍由 V0 的 `workflow_guide + decision_model` 编译

因此下一步不能再继续修补 V0 merge 链路，而应把 replay-facing 主链路整体切到 V1。

## 2. Current Findings
### 2.1 clarification_questions Mixed Ownership
现象：
- 前两条问题更像模型根据当前任务写出的语义问题
- 后两条问题明显是模板补齐风格

直接原因：
- 现有实现会先吸收模型问题，再对未覆盖的 blocking uncertainty 走 deterministic 模板补齐

结论：
- 当前 `clarification_questions` 不是 agent-owned
- 它仍是 V0 coverage workaround

### 2.2 structured_abstraction Step Kind Drift
现象：
- 模型常返回 `click` / `select` / `edit_content` / `submit_action`
- builder 再把这些词强行归一化到 V0 的有限枚举

直接原因：
- 当前 prompt 是“自然语言约束 JSON 形状”，不是强 schema enforcement
- V0 `WorkflowStepKind` 枚举太窄，天然与模型更细粒度的行为语言冲突

结论：
- `structured_abstraction` 现在更像“模型先说自己的话，代码再翻译”
- 这不是稳定的长期主链路

### 2.3 execution_guide Still V0-Driven
现象：
- `execution_guide.json` 仍依赖 `goalType` / `targetEntity` / `decisionRules` / `doneCriteria`
- `semantic_intent_draft.json` 虽已生成，但并未成为最终消费真源

直接原因：
- 当前 `execution_guide` 编译入口仍是 V0 builder

结论：
- 这不是单个 prompt 的问题
- 是主编译路径仍未切换

## 3. Design Goal
下一阶段目标不是继续提升单个工件质量，而是完成：

`behavior evidence -> semantic interpretation -> clarification/resolution -> execution guide`

这一整条 replay-facing 主链路的 V1 切换。

同时满足两个要求：
1. 最终产物必须足够 general
- 能表达整体目标、流程、分支与完成条件
- 不对具体站点、具体对象或单次示教实例过拟合

2. 必须保留足够的历史细节
- run 阶段不仅要知道“整体要做什么”
- 还要能在执行某一步时访问相关历史证据、示例和界面线索

## 4. Scope
本阶段包含：
- 将 `clarification_questions` 改为 agent-owned
- 将 `execution_guide` 编译入口改为 V1
- 通过 prompt schema 约束，让模型承担大部分结构解释工作
- 收缩 deterministic 逻辑到行为抽取、schema 校验和 gate
- 重新定义最终 replay-facing guide 的“general + detail”分层

## 5. Non-goals
本阶段不做：
- 不修改 observe 录制协议
- 不修改 runtime HITL 主链路
- 不改 SOP 检索模块
- 不追求一次性消灭所有 fallback
- 不要求现在就删除所有 V0 中间工件

## 6. New Architectural Direction
### 6.1 Deterministic Owns Only Three Things
deterministic 层只保留：
1. 行为证据抽取
2. schema / coverage / pollution / gate 校验
3. 工件编译与状态机

它不再负责：
- 业务语义补齐
- 问题模板补齐
- 任务类型/业务对象的主导判断

### 6.2 Model Owns Most of the Reasoning
模型负责：
- 从行为证据解释任务目标
- 解释每个行为块的业务用途
- 生成选择/跳过/完成的语义假设
- 生成需要向用户补齐的 blocking questions

因此下一阶段要通过 prompt schema 约束，替代当前大量 V0 rule-based merge/fallback。

### 6.3 HITL Owns Semantic Resolution
用户输入只进入：
- unresolved blocking semantics

不再承担：
- 帮系统补 V0 模板问题
- 修复模型 step kind 漂移

## 7. Final Replay Artifact Principle
`execution_guide.json` 仍是唯一 replay-facing 工件，但其内部必须显式分层：

### 7.1 General Layer
给 run 阶段的全局理解：
- `goal`
- `scope`
- `workflowOutline`
- `doneCriteria`
- `semanticConstraints`

特点：
- 足够 general
- 可跨站点、跨页面形态迁移
- 不把某次示教中的对象名、按钮文案、消息文本写成硬规则

### 7.2 Detail Layer
给 run 阶段的执行细节参考：
- `stepDetails`
- `branchHints`
- `uiAnchors`
- `exampleRefs`
- `evidenceRefs`

特点：
- 不直接驱动全局策略
- 但在执行某个行为块时可作为高价值局部记忆

### 7.3 Why Both Layers Are Required
如果只有 general：
- run 会知道方向，但缺少页面落点和历史经验细节

如果只有 detail：
- run 会收敛到具体 case，失去泛化能力

所以最终产物必须同时承载：
- general workflow
- detail memory access

## 8. Proposed V1 Artifact Set
### 8.1 Internal Artifacts
保留内部工件用于审计和编译：
- `behavior_evidence.json`
- `behavior_workflow.json`
- `semantic_intent_draft.json`
- `observed_examples.json`
- `clarification_questions.json`
- `intent_resolution.json`
- `compact_manifest.json`

### 8.2 Final Replay Artifact
最终运行时只消费：
- `execution_guide.json`

但它要内含两层数据：
- `generalPlan`
- `detailContext`

## 9. Prompt Schema Direction
### 9.1 structured_abstraction
不再作为最终主链路核心。

若保留，仅作为过渡兼容工件：
- 用于对照
- 不再主导最终 `execution_guide`

### 9.2 semantic_intent_draft
升级为主语义工件：
- 用 schema 强约束输出字段
- 要求每条语义判断回链到 evidence refs
- 直接承接后续 `clarification_questions`

### 9.3 clarification_questions
V1 规则：
- 由模型直接生成
- 每个 blocking uncertainty 必须有 question coverage
- deterministic 只检查 coverage，不再模板补题

## 10. Migration Plan
### 10.1 Phase-2
目标：
- `semantic_intent_draft -> clarification_questions` 切到 agent-owned

验收：
- blocking uncertainty 全覆盖
- 不再出现模板补齐问题混入最终 `clarification_questions`

### 10.2 Phase-3
目标：
- 新增 `execution_guide.v1`
- 编译来源切到：
  - `behavior_workflow`
  - `semantic_intent_draft`
  - `intent_resolution`
  - `compact_manifest`

验收：
- `execution_guide` 不再含 `goalType/targetEntity`
- 同时具备 `generalPlan + detailContext`

### 10.3 Phase-4
目标：
- 将 V0 `workflow_guide/decision_model` 从 replay 主链路中退役

验收：
- V0 工件仅作为历史/兼容参考
- replay 主链路完全 V1 化

## 11. Acceptance Criteria
1. `clarification_questions` 全量 agent-owned
2. `execution_guide` 编译入口切换到 V1
3. `execution_guide` 同时包含 general workflow 与 detail context
4. `execution_guide` 不再依赖 `goalType/targetEntity`
5. run 阶段可通过一个 replay-facing guide 既理解全局流程，也能访问历史细节

## 12. Verification Strategy
使用样本：
- `artifacts/e2e/20260308_110124_276`

重点检查：
1. `clarification_questions` 是否仍出现模板补齐痕迹
2. `execution_guide` 是否仍包含 V0 领域枚举
3. general 层是否仍被具体 URL / 数量 / 文案污染
4. detail 层是否保留了足以支持 run 的示例/锚点/证据索引

## 13. P0 Next
进入 `SOP Compact V1` 全链路切换：
1. 先把 `clarification_questions` 改成 agent-owned
2. 再冻结 `execution_guide.v1` 的 `generalPlan + detailContext` schema
3. 最后切换 replay 主编译入口到 V1
