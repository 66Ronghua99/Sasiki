# Phase 3: LLM Replay & Refinement Engine 设计文档

**文档状态**: Draft / Active
**创建日期**: 2026-03-01

## 1. 背景与目标 (Overview)

当前 Phase 2 产出的 `skill.yaml` (Draft Workflow) 存在以下问题：
1. **过度琐碎或冗余**：包含用户无意中的点击、试探性操作或多余的滚动。
2. **缺乏精确的执行定位符 (Locator)**：录制时提取的 `target_hint` 是启发式的，在未来自动执行时可能不够稳定或唯一。
3. **缺少隐性操作 (Implicit Actions)**：用户“浏览”、“肉眼确认”、“寻找信息”等过程无法被记录为显性点击，但它们是整个工作流不可或缺的一部分（例如：需要先提取文本，再进行下一步）。

**Phase 3 的核心目标**是引入一个 **LLM Replay (试运行与提纯)** 阶段。
相当于让一个具备推理能力的 Agent 在真实的浏览器环境中，照着 Phase 2 的“草图 (Draft)”，亲自把流程跑一遍。在跑的过程中，Agent 将：
- 剔除无价值的冗余步骤。
- 将原本模糊的 `target_hint` 锚定为当前页面中唯一、稳定、精确的执行 Locator。
- 发掘并显式定义隐性的“信息提取 (Reading/Extracting)”步骤。
- 最终产出一个经过验证的、极其稳定的标准操作手册 (Executable Workflow)。

---

## 2. 产物隔离与可追溯性 (Traceability)

为了确保任何环节的数据不丢失，并且支持在目标网站改版后重新生成，我们采用严格的数据流转隔离机制。**坚决不覆盖原有文件，而是新增产物。**

数据流向如下：
1. **`recording.jsonl` (Raw Data)**：浏览器动作流水账（包含坐标、时间戳、基础 hint）。
2. **`xxx_draft.yaml` (Skill Draft)**：Phase 2 产出。经过大模型初步语义提炼的“草图”，包含阶段划分和变量识别。
3. **`xxx_final.yaml` (Executable Workflow)**：**Phase 3 产出**。Replay Agent 在真实浏览器里跑通、验证、并修正过 Locator 后的最终可执行版本。

---

## 3. 核心循环：Observe -> Think -> Act -> Verify

Replay Agent 基于 Playwright + Chromium 运行，执行以下循环：

1. **Observe (观测)**：获取当前页面的精简状态结构。
2. **Think (思考)**：根据当前的 `Draft Workflow` 步骤预期，结合当前页面状态，决策下一步操作。
3. **Act (行动)**：执行具体的动作（点击、输入或提取信息）。
4. **Verify (验证)**：等待页面稳定，判断操作是否达到了预期效果。
5. **Refine (提纯)**：将成功的操作、对应的精确 Locator 记录到 `final_yaml` 中。

---

## 4. 页面观测方案 (Page Observation Strategy)

将完整的 DOM 树发送给 LLM 会导致 Token 爆炸和严重幻觉。我们需要高效的 DOM 压缩策略。

### 首选方案 (方案 A): 辅助功能树 (Accessibility Tree)
*   **原理**：利用 Playwright 的 `page.accessibility.snapshot()`。
*   **优势**：极度精简，自带高度语义化标签（如 `role="button"`, `name="搜索"`）。浏览器内核自身已经过滤掉了纯视觉的 `<div>`、样式和脚本，非常契合 LLM 的语义理解能力。
*   **实施路径**：优先基于此树提取页面节点，映射到对应的 Playwright Locator。

### 备用方案 (方案 C): 注入 ID 的剪枝 DOM (Pruned DOM with IDs)
*   **原理**：作为当站点严重缺乏 Accessibility 语义（大量使用原生 div 模拟点击）时的 Fallback。通过注入自定义 JS (`page.evaluate`)：
    1. 剔除不可见节点和无关标签 (`<style>`, `<script>`, 替换大 `<svg>`)。
    2. 只保留原生交互节点 (`a`, `button`, `input`) 和有意义的文本节点 (`p`, `span`)。
    3. 为每个保留的节点注入 `sasiki-id="X"`。
*   **优势**：不会漏掉绑定了 onClick 但没有 role 的“坏味道”代码元素，且执行指令极其明确（"click sasiki-id=5"）。

---

## 5. 扩充的动作空间 (Agent Action Space)

不仅支持传统的交互，必须支持**阅读和提取**操作，以应对工作流中的隐性需求。LLM 在 Replay 时输出的格式设计如下：

```json
{
  "thought": "根据 Draft 提示，这一步需要获取商品价格。当前页面辅助树显示有一个 text 节点包含价格信息。我需要提取它并保存为变量。",
  "action": "extract_text",
  "target_locator": "text='¥199.00'",
  "variable_name": "product_price"
}
```

**核心 Action 集合：**
*   `click(locator)`: 交互
*   `fill(locator, value)`: 输入
*   `hover(locator)`: 触发浮层
*   `extract_text(locator) -> var_name`: **阅读/复制**（代替用户的肉眼阅读，极其关键）
*   `assert_visible(locator)`: 验证页面状态
*   `ask_human(question)`: 触发 HITL（见下文）

---

## 6. 情境化人机协同 (Contextual HITL)

将 Human-In-The-Loop 机制直接整合在 Replay 的过程中，而不是脱离上下文的后期 Review。

**场景描述**：
当 Agent 遇到低置信度步骤（例如：Draft 中记录了连续两次点击空白处，Agent 无法在辅助树中找到明确目标，且判断可能没有意义时）：
1. **Agent 发起中断**：输出 `ask_human` action。
2. **环境挂起**：Playwright 暂停执行 (Pause)，保持浏览器当前可见状态。
3. **终端交互**：CLI 向用户提问：
   > "⚠️ 遇到不明确的操作：步骤 4 (原操作点击了坐标 [x,y])。当前浏览器已停留在该状态。
   > 请问此操作意图：
   > [1] 这是多余操作，直接跳过 (Skip)
   > [2] 这是为了关闭遮罩层等特殊操作，请保留 (Keep)
   > [3] 请让我在浏览器中重新指认元素 (Re-pick)"
4. **决策应用**：用户输入后，Agent 吸收意图，继续后续流程的重放与提纯。
