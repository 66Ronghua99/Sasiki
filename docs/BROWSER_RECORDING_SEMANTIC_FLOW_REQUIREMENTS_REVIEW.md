# RFC Review: Browser Recording Semantic Flow Requirements (v1)

**Reviewer**: PM Review  
**Review Date**: 2026-03-03  
**Target Doc**: `BROWSER_RECORDING_SEMANTIC_FLOW_REQUIREMENTS.md`  
**Status**: 待修订

---

## 总体评估

文档整体结构清晰，端到端契约意图正确，数据分层思路合理。但存在若干**定义空洞与边界模糊**点，若不在开发前修订，将在实现阶段产生意图漂移。以下按严重性分级列出。

---

## 🔴 Critical — 会直接导致意图漂移

### C1. Raw Event → Canonical Action 的转换主体未定义

文档定义了两者的 schema，但**没有说明谁负责执行这个转换**。

- 是录制层（Chrome Extension / WebSocket Server）实时产出 Canonical Action？
- 还是 Generator 在生成阶段离线做转换？
- 还是一个独立的预处理服务？

**影响**：Phase B 和 Phase C 的实现者会各自理解，导致重复建设或职责空洞，以及在 Generator 中是否应该读 Raw Event 还是 Canonical Action 的分歧。

**需要补充**：显式定义 `Raw Event → Canonical Action` 的**组件归属**（哪个模块、哪个执行阶段、同步/异步触发）。建议增加一张数据流责任图：

```
[Chrome Extension] → Raw Event → [???] → Canonical Action → [Generator] → Semantic Stage → [Refiner] → Execution Trace
```

---

### C2. `postconditions` 无结构化格式，verifier 无法消费

文档示例中同时出现两种完全不同的格式：

```
"url contains keyword=%E6%98%A5%E5%AD%A3%E7%A9%BF%E6%90%AD"   // 字符串断言
"search result cards visible"                                    // 自然语言描述
```

这两种格式无法用同一个 verifier 消费。而 Section 6（Refiner Consumption Criteria）要求 `verification match: success_criteria 可由当前 verifier 判定`，但 verifier 的判定逻辑依赖结构化输入，自然语言描述无法可靠判定。

**需要补充**：定义 postcondition 的**枚举类型**与每种类型的**字段结构**。建议最小集合：

```json
{ "type": "url_contains", "value": "keyword=..." }
{ "type": "element_visible", "role": "listitem", "name_pattern": "..." }
{ "type": "text_changed", "role": "...", "name": "...", "pattern": "..." }
{ "type": "count_changed", "role": "...", "min_count": 1 }
```

---

### C3. `context_hints` 字段完全未定义

Section 4.3 的 `Semantic Stage` 中，`context_hints` 只有字段名，**无类型、无格式、无示例**。

Semantic Stage 是 Refiner 的直接输入。如果 context_hints 格式由实现者自由发挥，Refiner 与 Generator 之间会形成隐式耦合，破坏"分层可替换"的工程目标。

**需要补充**：给出 `context_hints` 的数据结构（`List[str]`？`Dict[str, Any]`？）和至少 2 个具体示例，例如：

```json
"context_hints": [
  "用户已登录，无需处理登录态",
  "搜索结果页存在分页，目标内容在第一屏"
]
```

---

### C4. `intent` 字段的生成主体与约束未定义

`Canonical Action.intent` 示例有 `search`、`open_post`、`like_post`，但**没有说明谁来赋值、依据什么赋值**。

- 如果是 LLM 自由生成：不同录制间的 intent 标签无法比较、聚合或用于规则匹配。
- 如果是受控枚举：枚举集合定义在哪里？如何扩展？

**影响**：Generator 实现者会选择 LLM 自由生成；Refiner 实现者会期望稳定枚举值；两者在集成时冲突。

**需要补充**：明确 intent 是**开放语义标签**（LLM 提取，不用于程序判断）还是**受控枚举**（程序可消费），以及是否需要归一化处理。

---

## 🟠 Major — 会造成实现歧义

### M1. `triggered_by` 字段的适用范围不一致

Hard requirement 仅说"任何 `navigate` 必须有 `triggered_by`"，但 Appendix A 示例中 `fill` 事件的 `triggered_by` 是 `user_input`——说明其他事件类型也在使用此字段，但规则只约束了 navigate。

**需要补充**：
- 哪些 `event_type` 需要填写 `triggered_by`？
- 每种 event_type 的合法 `triggered_by` 值集合是什么？
- 对于不适用的情况，是 `null` 还是省略？

---

### M2. `reference_actions` 与 `Canonical Action` 的关系不清

Section 4.3 说 `reference_actions` 是"来自 Canonical Action 的可执行提示，非死脚本"，但没有定义：

- 是 Canonical Action 的 **ID 引用**（Refiner 需要回查存储）？
- 是 Canonical Action 字段的**子集内联**（哪些字段保留，哪些丢弃）？
- 还是 Generator 重新包装的**新格式**？

**影响**：如果是 ID 引用，Refiner 需要 Canonical Action 存储层；如果是内联子集，Generator 和 Refiner 需要约定保留字段集合。两者架构成本差异显著。

---

### M3. Execution Trace 与 Canonical Action 的追溯链路在数据层断裂

Section 4.4 Hard requirement 说"每步必须可关联到上游 Canonical Action 或 Stage objective"，但 Execution Trace 的 Required fields 中**没有 `source_canonical_action_id` 字段**。

仅有 `stage_id` 无法精确追溯到具体动作，与"失败定位到事件、动作、证据"的目标（Section 7.1，Failure traceability = 100%）矛盾。

**需要补充**：在 Execution Trace 的 Required fields 中明确加入 `source_canonical_action_id`（可为 null 当无对应 action 时）。

---

### M4. Schema 与现有代码模型的对应关系缺失

项目当前已有 `WorkflowStage`、`AgentDecision`、`AriaSnapshot`、`EpisodeMemory` 等 Pydantic 模型。文档未说明：

- 新 schema 是**替换**现有模型还是**新增并双轨兼容**？
- `Semantic Stage` 对应当前的 `WorkflowStage` 哪些字段？
- `Execution Trace` 对应 `EpisodeMemory` 还是新结构？
- 历史 YAML recordings 如何处理？

**影响**：开发者在 Phase A/B 不知道该修改哪些现有文件，还是新建独立模块，导致并行改动冲突。

---

## 🟡 Minor — 影响开发体验和验收

### m1. 验收指标缺乏基线和分母定义

- "Flow generation consistency >= 95%"：对比基线是什么？当前数字是多少？
- "Stage pass rate >= 80%"：分母是总 stage 数还是总 workflow 数？失败的定义是 exception、success_criteria 未达成，还是 timeout？

---

### m2. Migration Plan 各 Phase 缺少退出条件

Phase A/B/C/D/E 描述了做什么，但没有说明**满足什么条件才能进入下一 Phase**。开发者无法判断 Phase B 何时完成，Phase C 何时可以启动。

**建议**：每个 Phase 增加 `Exit Criteria` 字段，例如：
> Phase B 退出条件：schema validator 通过率 100%，录制层新增字段覆盖率 >= 90%。

---

### m3. Open Questions 无负责人和决策截止时间

Section 10 的三个 Open Questions 均需要在编码前确定答案，否则 v1 实现会做出不同假设：

1. `submit` 事件判定边界 → 影响 Recording layer 实现
2. `postconditions` 最小集合 → 影响 Verifier 实现范围
3. `action cost` 字段 → 影响 Canonical Action schema 是否需要扩展

**建议**：每条标注 `Owner` 和 `Deadline（需在哪个 Phase 启动前确定）`。

---

## 建议修订动作汇总

| 优先级 | 编号 | 行动项 | 影响 Phase |
|--------|------|--------|------------|
| P0 | C1 | 补充 Raw Event → Canonical Action 的组件归属图 | Phase A/B |
| P0 | C2 | 定义 postconditions 的类型枚举 + 字段结构 | Phase A/C/D |
| P0 | C3 | 补充 context_hints 的数据结构 + 示例 | Phase C/D |
| P0 | C4 | 明确 intent 是开放标签还是受控枚举 | Phase B/C |
| P1 | M1 | 澄清 triggered_by 的全事件类型适用规则 | Phase B |
| P1 | M2 | 定义 reference_actions 与 Canonical Action 的关系与字段映射 | Phase C/D |
| P1 | M3 | 在 Execution Trace 中补充 source_canonical_action_id 字段 | Phase D |
| P1 | M4 | 补充新 schema 与现有 Pydantic 模型的对应关系表 | Phase A |
| P2 | m1 | 为验收指标补充基线数字和分母定义 | Phase E |
| P2 | m2 | 为每个 Migration Phase 补充退出条件 | 全部 Phase |
| P2 | m3 | 关闭 Section 10 三个 Open Questions，标注负责人和截止时间 | Phase A 前 |
