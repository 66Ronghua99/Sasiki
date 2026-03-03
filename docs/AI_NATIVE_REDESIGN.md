# AI-Native Pipeline 重构设计文档

**文档状态**: Active Design  
**创建日期**: 2026-03-03  
**背景**: 基于 E2E 验证过程中暴露的根本性架构问题，对 Phase 2（Skill 生成）和 Phase 3（Workflow Refinement）进行 AI-native 重构。

---

## 1. 问题根因

当前 pipeline 存在一个**根本性的设计倒置**：

> 它把录制的微操作步骤（actions list）当成了 Agent 的"任务"，而不是"参考证据"。

### 表现

- `StageExecutor._build_stage_goal()` 把 YAML 里的 actions 列表展平为字符串传给 Agent：
  ```
  Complete stage: 执行搜索
  Actions to perform:
    1. click on 搜索框
    2. fill with "春季穿搭"
    3. press Enter
  ```
  Agent 变成了照本宣科的脚本执行器，遇到任何页面变化（顺序、样式、动态内容）就失去恢复能力。

- `AccessibilityObserver` 每步重置 `node_counter`，历史记录里的 ID 无意义，Agent 无法建立跨步语义关联。

- `history: list[str]` 只存 thought 文本，无结构，无页面状态关联，Stage 开始时直接 `clear()`。

- 重试只换了 system prompt，Agent 依然面对同样的 DOM，大概率做出类似选择。

- 停滞检测只检测精确相同的连续 action，无法发现 A→B→A→B 类型的语义循环。

---

## 2. 全链路 Workflow Graph

```
[Phase 1: 录制] — 不变
Chrome Extension
    ↓ WebSocket
Python Server
    ↓ JSONL 落盘
Recording File (*.jsonl)
    │
    │ [Phase 2: Intent Extraction — SkillGenerator]  ← 小改
    ↓
RecordingParser.to_structured_packet()
→ StructuredPacket (JSON)  — 不变
    │
    ↓ LLM (intent + stage 分组 + objective/success_criteria)
SemanticPlan  — 新增 objective/success_criteria 字段
    │
    ↓ 代码确定性组装
WorkflowSpec (*.yaml)  ← 核心 model 变更
    │
    │ [Phase 3: Goal-Driven Execution — WorkflowRefiner v2]  ← 重构
    ↓
WorkflowRefiner.run(spec, inputs)
    │
    ├─ [per stage] StageExecutor
    │       │
    │       ├─ build StageContext (objective + hints + episode memory + world_state)
    │       │
    │       ├─ loop:
    │       │     AriaSnapshot.capture() → {role/name, dom_hash, interactive/readable}
    │       │     StagnationDetector.check(dom_hash)  → 停滞时触发 HITL
    │       │     ReplayAgent.decide(StageContext, snapshot) → AgentDecision
    │       │     ActionExecutor.run(decision) → page.get_by_role(role, name)
    │       │     EpisodeMemory.record(EpisodeEntry)
    │       │     StageVerifier.check(success_criteria, page)  → 验证完成
    │       │
    │       └─ StageResult (含 episode_log, verified, verification_evidence)
    │
    ├─ WorldState 摘要 → 传递给下一 Stage
    │
    └─ FinalWorkflowWriter → *_final.yaml + ExecutionReport
```

---

## 3. 各节点数据格式

### 3.1 Recording File (*.jsonl) — 不变

```jsonl
{"_meta": true, "session_id": "...", "started_at": "...", "action_count": 42}
{"type": "click", "timestamp": "...", "page_context": {"url": "...", "title": "..."}, "target_hint": {"role": "searchbox", "placeholder": "搜索"}}
{"type": "type", "timestamp": "...", "value": "春季穿搭 男", ...}
```

### 3.2 StructuredPacket (JSON) — 不变

```json
{
  "metadata": {"session_id": "...", "action_count": 42},
  "actions": [
    {
      "action_id": 1,
      "raw": {"type": "click", "value": null},
      "page_context": {"url": "https://...", "title": "小红书"},
      "normalized_target_hint_raw": {"role": "searchbox", "placeholder": "搜索"},
      "target_hint_compact": {"role": "searchbox", "placeholder": "搜索"}
    }
  ],
  "page_groups": {"https://xiaohongshu.com/": [1, 2, 3]}
}
```

> **关于 raw_target_hint**：数据层保留用于调试。**LLM prompt 层只传 `target_hint_compact`**（role/name/placeholder 等语义字段），CSS class 等 DOM 实现细节是噪音。

### 3.3 WorkflowSpec (*.yaml) — ⚠️ 核心变更

**旧设计（script-driven，本末倒置）**：
```yaml
stages:
  - name: 执行搜索
    actions:
      - "Click on search box"
      - "Type '春季穿搭 男'"
      - "Press Enter"
    action_details: [...]       # 录制数据照搬
```

**新设计（goal-driven，AI-native）**：
```yaml
id: uuid
name: 小红书搜索
description: 搜索并浏览小红书笔记
variables:
  - name: search_query
    description: 搜索关键词
    type: text
    required: true
    example: 春季穿搭 男

stages:
  - id: stage-search
    name: 执行搜索
    objective: "在小红书找到搜索入口，输入 {{search_query}} 并执行搜索"
    success_criteria: "页面显示 {{search_query}} 的搜索结果列表（出现多个笔记卡片）"
    entry_url_hint: "https://www.xiaohongshu.com"
    context_hints:
      - "搜索框通常在页面顶部，role=searchbox 或包含'搜索'字样"
      - "输入后按 Enter 或点击搜索图标"
    reference_actions:          # ← 仅作 hint，不作指令；由 recording 数据生成
      - {type: click, target: {role: searchbox}}
      - {type: type, value: "{{search_query}}"}
      - {type: press, value: Enter}
```

向后兼容：旧 YAML 中的 `actions`/`action_details` 字段保留，执行时降为 `reference_actions`。

### 3.4 StageContext (Runtime) — 新增

替代 `_build_stage_goal()` 产出的单一字符串：

```python
@dataclass
class StageContext:
    workflow_name: str
    workflow_variables: dict[str, str]    # resolved
    stage_name: str
    stage_index: int
    total_stages: int
    objective: str                         # high-level goal
    success_criteria: str                  # verifiable condition
    context_hints: list[str]               # optional hints from recording
    reference_actions: list[dict]          # from recording, hints only
    episode_memory: list[EpisodeEntry]     # structured step log
    world_state: str | None                # 上一 Stage 传递的当前状态摘要
    current_page_url: str
    current_page_title: str

    def build_prompt(self) -> str:
        """Build LLM prompt from structured context."""
        ...
```

### 3.5 AriaSnapshot (Runtime) — 替代 CompressedNode + node_id

**核心变更**：去掉 node_id，改用 role+name 寻址，加入 dom_hash 用于停滞检测。

```json
{
  "url": "https://www.xiaohongshu.com/search",
  "title": "搜索结果 - 小红书",
  "dom_hash": "a3f2b1c9",
  "interactive": [
    {"role": "searchbox", "name": "搜索", "value": "春季穿搭 男"},
    {"role": "button", "name": "搜索"},
    {"role": "link", "name": "笔记标题 A"},
    {"role": "link", "name": "笔记标题 B"}
  ],
  "readable": [
    {"role": "heading", "text": "搜索结果"},
    {"role": "text", "text": "找到 1234 条结果"}
  ]
}
```

`dom_hash`：对 interactive 元素集合（role+name 集合）做 hash，用于 StagnationDetector。

### 3.6 AgentDecision (Runtime) — 替代 AgentAction

**旧**：`{"action_type": "click", "target_id": 42}`（每步失效的 ID）  
**新**：用 role+name 描述，Playwright locator 执行

```json
{
  "thought": "搜索框有 role=searchbox，当前已有文字，需要先清空再输入",
  "action_type": "fill",
  "target": {"role": "searchbox", "name": "搜索"},
  "value": "春季穿搭 男",
  "semantic_meaning": "Filling search input with the query term",
  "progress_assessment": "Step 2/3: About to submit search after filling input"
}
```

完成时：
```json
{
  "thought": "搜索结果已出现多个笔记卡片，目标达成",
  "action_type": "done",
  "evidence": "Page shows 15 note cards matching '春季穿搭 男'",
  "semantic_meaning": "Search completed successfully",
  "progress_assessment": "Stage objective achieved"
}
```

执行：
```python
await page.get_by_role(decision.target.role, name=decision.target.name).fill(decision.value)
```

### 3.7 EpisodeEntry — 替代 history: list[str]

核心新增 `semantic_meaning` 和 `progress_assessment`，让 Agent 有真正的语义记忆：

```python
@dataclass
class EpisodeEntry:
    step: int
    action_type: str
    target_description: str      # "searchbox '搜索'"
    value: str | None
    result: Literal["success", "failed", "skipped"]
    error: str | None
    # 页面变化感知
    page_url_before: str
    page_url_after: str
    dom_hash_before: str
    dom_hash_after: str
    page_changed: bool
    # 语义理解（核心新增）
    thought: str
    semantic_meaning: str        # "Activated search input for query entry"
    progress_assessment: str     # "Step 2/3: Search box focused, ready to type"
```

**作用**：在构建下一步 StageContext 时，`episode_memory` 列表传入语义摘要（而非 ID 列表），Agent 拥有真实的语义连续性。

### 3.8 StageResult — 扩展

```python
class StageResult(BaseModel):
    stage_name: str
    status: Literal["success", "failed", "skipped", "paused"]
    steps_taken: int
    episode_log: list[EpisodeEntry]    # 结构化，替代 actions: list[AgentAction]
    verified: bool                     # success_criteria 是否被 StageVerifier 验证
    verification_evidence: str | None
    error: str | None
    stagnation_detected: bool
    world_state_summary: str | None    # 本 Stage 结束后的页面状态摘要
```

### 3.9 *_final.yaml (Output)

与 WorkflowSpec 格式相同，附加：
```yaml
execution_metadata:
  refined_at: "2026-03-03T01:35:16Z"
  total_steps: 12
  stages_verified: 3
  stages_failed: 0
```

### 3.10 ExecutionReport (Output) — 新增

```json
{
  "workflow_id": "...",
  "status": "completed",
  "stages": [
    {
      "stage_name": "执行搜索",
      "status": "success",
      "verified": true,
      "verification_evidence": "Found 15 note cards matching '春季穿搭 男'",
      "steps_taken": 4,
      "episode_log": [...]
    }
  ],
  "total_steps": 4
}
```

---

## 4. 核心设计决策

### Decision 1: 取消 node_id，改用 role+name locator

| 方案 | 优点 | 缺点 |
|---|---|---|
| 当前: CDP node_id | 精确坐标控制 | 每步失效；history 里 ID 无意义 |
| **新: role+name locator** | **跨步稳定；更符合 LLM 语义** | 重名元素需额外 hint |

对重名元素（多个同 role 的 button），Agent 可指定 `nth` 或用 parent context hint。

### Decision 2: Stage 目标从 actions list → objective + success_criteria

| 方案 | 优点 | 缺点 |
|---|---|---|
| 当前: actions list | 具体明确 | 照搬失败，无法适应变化 |
| **新: objective + hints** | **Agent 有自主性，能应对变化** | LLM 生成时需更好的 semantic extraction |

recording actions 降为 `reference_actions`（可选 hint），不作为执行指令。

### Decision 3: 分层 Retry 策略

```
L1 (element miss):  同类型动作，换目标 → Agent 重新观察选不同元素
L2 (action fail):   换策略 → temperature 升高，强制选不同路径
L3 (stagnation):    停滞检测 → dom_hash 连续 3 步不变 → 强制 HITL 或 abort
L4 (HITL):          人工介入 → 现有 HITLHandler 接口保持
```

### Decision 4: evidence-based done detection

Agent 不能直接 `done`，必须提供 `evidence` 字段。  
`StageVerifier` 用规则或 LLM cross-check `evidence` vs `success_criteria`，只有通过才 `StageResult.verified = True`。

### Decision 5: 跨 Stage 状态摘要 (WorldState)

每 Stage 结束时生成 1-2 句 `world_state_summary`（当前 URL + 页面状态），传给下一 Stage：
```
"On XHS search results page showing 15 notes for '春季穿搭 男'. User is logged in."
```
替代 `history.clear()` 后什么都不传的信息断层。

---

## 5. 两条演化路径

### Path A：忠实复刻 + 流程优化（当前目标）

> 理解录制每步语义，重放时选最优路径，合并冗余步骤。  
> `click → navigate` = 直接 `navigate`；多余的 `fill + clear` = 保留最后一次有效操作。

- 仍然依赖浏览器
- Agent 有完整 semantic narrative，步骤间有连贯语义理解
- 目标：相同结果，更干净的执行

### Path B：理解用户意图 + 革命性优化（未来方向）

> 完全理解"用户在做什么业务"，找到最优实现方式。  
> "搜索小红书" = 调 XHS API；"查快递" = 调快递 API；不需要打开浏览器。

- 执行策略由 Agent 自主决定（browser / api / tool / hybrid）
- 录制结果只是"用户意图的证据"，不是"执行脚本"
- 目标：相同目的，最佳实现

### 分层架构（向上扩展，不破坏现有）

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Intent Layer (Path B 未来)                     │
│  理解业务目标 → 选择执行策略 (browser/api/tool/hybrid)    │
│  输入: WorkflowSpec.stage.objective                      │
│  输出: ExecutionPlan (strategy + steps)                  │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Semantic Understanding Layer (Path A+B 桥梁)   │
│  理解每步"在做什么"，产出语义叙事，优化步骤序列           │
│  → click+navigate = navigate                            │
│  → 识别出可 API 化的步骤并标记                           │
│  输出: SemanticNarrative per step (本次 Path A 引入入口)  │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Execution Layer (Path A 当前核心)              │
│  浏览器自动化执行，role+name locator，episode memory     │
└─────────────────────────────────────────────────────────┘
```

**当前重构聚焦 Layer 1 + Layer 2 入口**（EpisodeEntry 引入 semantic_meaning）。  
Layer 3 通过 `ExecutionStrategy` 接口预留插槽，未来不破坏现有结构。

---

## 6. 变更边界

| 组件 | 变更范围 | 说明 |
|---|---|---|
| Chrome Extension 录制 | 🚫 不变 | 录制格式已稳定 |
| WebSocket 协议 | 🚫 不变 | 不变 |
| RecordingParser | 🚫 不变 | 已包含 to_structured_packet |
| StructuredPacket | 🚫 不变 | LLM prompt 层去掉 raw_target_hint |
| WorkflowSpec model | ✅ 小改 | 新增字段，向后兼容旧 YAML |
| SkillGenerator prompt | ✅ 小改 | 要求产出 objective/success_criteria |
| SemanticPlan model | ✅ 小改 | 新增字段 |
| PageObserver | 🔨 重构 | 去 node_id，改 AriaSnapshot + dom_hash |
| ReplayAgent | 🔨 重构 | AgentDecision 用 role+name，语义叙事 |
| StageExecutor | 🔨 重构 | StageContext，分层 retry，停滞检测 |
| WorkflowRefiner | ✅ 小改 | WorldState 传递，调用新 StageExecutor |
| HITL Handler 接口 | 🚫 不变 | 接口保持，可能扩展 |
| Storage 层 | 🚫 不变 | YAML 格式向后兼容 |
| CLI 命令结构 | 🚫 不变 | 命令参数保持 |

---

## 7. TODO 列表

### P0：核心概念对齐

1. **WorkflowSpec model 扩展** — `WorkflowStage` 新增 `objective`, `success_criteria`, `context_hints`, `reference_actions`
2. **SkillGenerator prompt 更新** — 要求 LLM 产出 `objective` 和 `success_criteria`
3. **AriaSnapshot 替代 CompressedNode** — 去 node_id，role+name + dom_hash
4. **StageContext 类** — 替代 `_build_stage_goal()` 字符串，含 `build_prompt()`
5. **AgentDecision 替代 AgentAction** — target 用 role+name，含 semantic_meaning/progress_assessment
6. **ActionExecutor** — 用 `page.get_by_role()` 执行，替代 CDP 坐标

### P1：稳定性提升

7. **EpisodeMemory** — 替代 `history: list[str]`，结构化 step log
8. **SemanticNarrative 字段** — EpisodeEntry + AgentDecision 语义叙事
9. **StagnationDetector** — dom_hash 连续不变检测，集成到 StageExecutor
10. **Multi-level retry** — L1/L2/L3/L4 四层重试
11. **StageVerifier** — evidence-based done 验证

### P2：记忆与输出

12. **WorldState 跨 Stage 传递** — Stage 结束时生成状态摘要
13. **ExecutionReport 输出** — 完整执行报告格式
14. **ExecutionStrategy 接口预留 (Path B)** — browser/api/tool 抽象接口

---

## 8. 参考文档

- `docs/PHASE3_REPLAY_DESIGN.md` — Phase 3 原始设计（当前实现基线）
- `docs/retry-hitl-redesign.md` — Retry & HITL 重构设计
- `docs/WORKFLOW_IMPROVEMENT_PLAN.md` — Workflow 改进计划
