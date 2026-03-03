# 当前最高优先级任务

**更新日期：2026-03-03**

## 目标：AI-Native Pipeline 重构 — P2 ExecutionStrategy

---

## 背景

完成了 AI-Native 重构设计（详见 `docs/AI_NATIVE_REDESIGN.md`）。

核心问题：当前架构把录制的微操作 actions list 当成 Agent 指令（本末倒置），导致 Agent 在任何页面偏差时失去自适应能力。

重构方向已确定，分两条演化路径：
- **Path A（当前）**：忠实复刻 + 流程优化（浏览器执行，semantic narrative，step 优化）
- **Path B（未来）**：理解用户意图，最优实现（API/tool/browser 自主选择）

---

## 当前优先级

### P2：ExecutionStrategy 接口预留（Path B）

**任务描述**：
为未来 Path B（browser/api/tool/hybrid）预留统一执行策略接口，在不改变现有 browser-first 行为前提下抽象执行层边界。

**验收标准**：
- 新增策略抽象接口与默认 browser 实现占位
- 当前执行路径行为保持不变（回归测试通过）
- 代码中新增清晰的扩展点注释或接口文档
- 单元测试通过（`uv run pytest -q`）

---

## 重构全景（见 docs/AI_NATIVE_REDESIGN.md）

14 个 TODO，按 P0 → P2 优先级：

**P0（核心概念对齐）**：
1. ✅ WorkflowSpec model 扩展（本次任务）
2. ✅ SkillGenerator prompt 更新（产出 objective/success_criteria）
3. ✅ AriaSnapshot 替代 CompressedNode（去 node_id，加 dom_hash）
4. ✅ StageContext 类（替代 _build_stage_goal() 字符串）
5. ✅ AgentDecision 替代 AgentAction（target 用 role+name）
6. ✅ ActionExecutor（Playwright get_by_role 替代 CDP 坐标）

**P1（稳定性提升）**：
7. ✅ EpisodeMemory（结构化 step log 替代 history strings）
8. ✅ SemanticNarrative 字段（semantic_meaning + progress_assessment）
9. ✅ StagnationDetector（dom_hash 停滞检测）
10. ✅ Multi-level retry（L1/L2/L3/L4）
11. ✅ StageVerifier（evidence-based done）

**P2（记忆与输出）**：
12. ✅ WorldState 跨 Stage 传递
13. ✅ ExecutionReport 输出格式
14. ExecutionStrategy 接口预留（Path B）
