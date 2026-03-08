# Checklist: SOP Compact Intent Abstraction v0

## Implementation
- [x] 输出 `workflow_guide` 字段 schema 草案
- [x] 输出 `decision_model` 字段 schema 草案
- [x] 冻结 `observed_examples` 字段 schema v0
- [x] 冻结 `clarification_questions` 字段 schema v0
- [x] 冻结 `compact_manifest` 字段 schema v0
- [x] 冻结 `goalType x uncertaintySeverity` 放行矩阵 v0
- [x] 冻结 `workflow_guide.json` 为单一真源、`workflow_guide.md` 为渲染产物
- [x] 输出 `uncertainFields` 的 `high/medium/low` 分级规则草案
- [x] 输出 `intent_resolution` 覆盖自动推断的优先级规则草案
- [x] 输出 `ready_for_replay` 的最小门禁草案
- [x] 冻结状态机转移规则（`draft/needs_clarification/ready_for_replay/rejected`）
- [x] 冻结最小自动校验规则（污染检测 / high=0 gate / question 映射完整性 / admission matrix 一致性）
- [x] 冻结以上 schema 与门禁规则（待实现前最终 review）

## Evidence
- [x] `.plan/20260308_sop_compact_intent_abstraction_v0.md` 已冻结最小闭环
- [x] 至少一个失败样例被纳入验证目标
- [x] 新增工件路径与状态机定义明确
- [x] 字段级 schema 草案已写入设计文档
- [x] review 阻塞点与冻结顺序已回写设计文档
- [x] `goalType x uncertaintySeverity` 放行矩阵已写入设计文档
- [x] JSON 单一真源、状态机与最小自动校验已写入设计文档

## Quality Gates
- [x] 文档讨论阶段不宣称实现完成
- [ ] 如进入代码实现，必须通过 `npm --prefix apps/agent-runtime run typecheck`
- [ ] 如进入代码实现，必须通过 `npm --prefix apps/agent-runtime run build`

## Docs Sync
- [x] `PROGRESS.md` 已切换 `P0-NEXT` 到 `sop-compact` 抽象闭环
- [x] `NEXT_STEP.md` 与 `P0-NEXT` 单指针对齐
- [x] `MEMORY.md` 已补充“规则/样例分离 + compact-stage HITL”经验
