# implementation_plan

## 1) 项目状态快照（基于当前代码）

| 模块 | 当前状态 | 证据（文件） | 结论 |
|---|---|---|---|
| WorkflowSpec / WorkflowStage | 仅旧字段（actions/action_details） | `src/sasiki/workflow/models.py` | ❌ `objective/success_criteria/context_hints/reference_actions` 尚未落地 |
| SemanticPlan / SemanticStagePlan | 仅旧字段（action_ids 等） | `src/sasiki/workflow/skill_models.py` | ❌ 未扩展 AI-native 字段 |
| SkillGenerator Prompt/Assembler | 仍输出旧 schema（stage 仅 action_ids） | `src/sasiki/workflow/skill_generator.py` | ❌ 未要求 LLM 产出 objective/success_criteria |
| PageObserver | 仍是 `CompressedNode + node_id` 体系 | `src/sasiki/engine/page_observer.py` | 🔨 与 AI-native 目标不一致（AriaSnapshot/dom_hash 未落地） |
| StageExecutor | 仍用 `_build_stage_goal()` 字符串 + `history: list[str]` | `src/sasiki/engine/stage_executor.py` | 🔨 StageContext/EpisodeMemory 尚未落地 |
| Retry/HITL 抽象 | 已完成并可用 | `src/sasiki/engine/human_interface.py`, `src/sasiki/commands/handlers.py` | ✅ 可作为后续重构稳定底座 |
| 测试覆盖 | 主要覆盖旧模型与旧生成流程 | `tests/test_workflow_models.py`, `tests/test_skill_generator.py` | ⚠️ 需补 AI-native 字段回归测试 |

> 备注：`PROGRESS.md` 与 `Memory.md` 日期新鲜，但与代码存在“文档-实现漂移”（文档标记部分 P0 为小改，代码尚未体现）。

---

## 2) 推荐的最小可执行 TODO

### 推荐 TODO
**P0-1：WorkflowSpec model 扩展（向后兼容）**

### 选择理由
1. **依赖最少**：仅集中在 workflow 模型与生成链路，属于小范围改动。  
2. **阻塞最多**：后续 P0（SkillGenerator prompt、StageContext、AgentDecision）都依赖该数据契约。  
3. **可在单 session 完成核心闭环**：模型 + 组装逻辑 + 单元测试可形成可验证增量。  

### 依赖关系（简化）
`WorkflowSpec 扩展` → `SkillGenerator 产出新字段` → `StageContext/Replay 决策重构`

### 工作量等级
**S（小）**：单模块主改 + 少量联动测试。

---

## 3) Proposed Changes

### A. Workflow 数据契约
- [MODIFY] `src/sasiki/workflow/models.py`
  - 在 `WorkflowStage` 新增：
    - `objective: str = ""`
    - `success_criteria: str = ""`
    - `context_hints: list[str] = Field(default_factory=list)`
    - `reference_actions: list[dict[str, Any]] = Field(default_factory=list)`
  - 在 `Workflow.to_execution_plan()` 中：
    - 保留旧字段输出；
    - 同步输出上述新字段；
    - 变量替换覆盖 `objective/success_criteria/reference_actions` 的字符串值（向后兼容不变）。

### B. LLM 语义计划模型
- [MODIFY] `src/sasiki/workflow/skill_models.py`
  - 在 `SemanticStagePlan` 新增：
    - `objective: str = ""`
    - `success_criteria: str = ""`
    - `context_hints: list[str] = Field(default_factory=list)`

### C. 生成器 Prompt 与组装
- [MODIFY] `src/sasiki/workflow/skill_generator.py`
  - 更新 `_build_extraction_prompt()` 的输出 schema，要求 LLM 返回：
    - stage-level `objective/success_criteria/context_hints`
  - 更新 `_build_stage_from_action_ids()`：
    - 保留 `actions/action_details`（兼容）；
    - 生成 `reference_actions`（由 action_details 提炼的 hint 集合）；
    - 写入 `objective/success_criteria/context_hints`。
  - 更新 `_convert_to_workflow()`：
    - 将新字段注入 `WorkflowStage(...)`。

### D. 测试回归
- [MODIFY] `tests/test_workflow_models.py`
  - 新增：旧 YAML 缺失新字段时默认值正确。
  - 新增：`to_execution_plan()` 包含新字段并可替换变量。
- [MODIFY] `tests/test_skill_generator.py`
  - 新增：LLM 返回新字段时可正确组装到 WorkflowStage。
  - 新增：缺失新字段时仍兼容（默认空值）。

---

## 4) 关键设计决策

1. **新字段默认值策略：使用空字符串/空列表（不是 Optional None）**  
   - 原因：简化下游 prompt 拼接与条件判断，避免空值分支扩散。  
   - 兼容性：旧 YAML 自动兼容。

2. **`actions` 与 `reference_actions` 双轨并存（短期）**  
   - 原因：当前执行链路仍消费 `actions/action_details`；`reference_actions` 先作为 AI-native 过渡契约。  
   - 风险控制：不破坏现有 `refine/run` 流程。

3. **`objective/success_criteria` 当前先“建议必填、技术上可空”**（待你确认）  
   - 原因：可先保证兼容和落地，再在后续版本逐步收紧校验。  
   - 需要确认：是否在本轮就将二者改为严格必填并在解析失败时报错。

---

## 5) Verification Plan

### 单元测试场景

| 场景 | 输入 | 预期 |
|---|---|---|
| 旧 workflow 兼容 | stage 无新字段 | 模型加载成功，字段为默认值 |
| 新字段保留 | stage 包含 objective/success_criteria/context_hints/reference_actions | `WorkflowStage` 与 `to_execution_plan()` 均保留 |
| 变量替换 | `objective`/`success_criteria`/`reference_actions` 含 `{{var}}` | 计划输出中占位符被正确替换 |
| 生成链路组装 | LLM 返回 `SemanticStagePlan` 新字段 | `SkillGenerator` 组装到 stage 正确 |
| 缺字段容错 | LLM 未返回新字段 | 生成仍成功，默认空值 |

### 建议执行命令（实现后）

```bash
uv run pytest -q tests/test_workflow_models.py tests/test_skill_generator.py
uv run ruff check src tests
uv run mypy src
uv run pytest -q
```

### 手动验证
1. 用 `sasiki generate <recording.jsonl> --dry-run` 生成 workflow。  
2. 检查输出 YAML 中 stage 是否包含新字段。  
3. 用旧 YAML 执行 `sasiki run/refine`，确认未破坏现有行为。  

