# 当前最高优先级任务

**更新日期：2026-03-03**

## 目标：进入 E2E 实战测试阶段（小红书等复杂站点）

---

## 背景

完成了 AI-Native 重构设计（详见 `docs/AI_NATIVE_REDESIGN.md`）。

核心问题：当前架构把录制的微操作 actions list 当成 Agent 指令（本末倒置），导致 Agent 在任何页面偏差时失去自适应能力。

重构方向已确定，分两条演化路径：
- **Path A（当前）**：忠实复刻 + 流程优化（浏览器执行，semantic narrative，step 优化）
- **Path B（未来）**：理解用户意图，最优实现（API/tool/browser 自主选择）

---

## 已完成：P2 ExecutionStrategy 接口预留（Path B）

**实现内容**：
1. 新增 `ExecutionStrategy` 抽象接口（`src/sasiki/engine/execution_strategy.py`）
   - `observe()`: 观察环境状态（browser: AriaSnapshot, api: endpoint state）
   - `execute()`: 执行 AgentDecision（browser: Playwright, api: HTTP call）
   - `check_completion()`: 验证完成状态
   - `cleanup()`: 资源清理

2. `BrowserExecutionStrategy` 默认实现（Path A）
   - 使用 Playwright 执行浏览器操作
   - 支持 AriaSnapshot 观察（accessibility tree）
   - DOM hash 用于停滞检测
   - 通过 agent.execute_action 保持向后兼容

3. `ApiExecutionStrategy` / `HybridExecutionStrategy` 占位（Path B）
   - 为未来 API-only 和混合执行预留
   - 清晰的扩展点注释

4. `StageExecutor` 集成
   - 支持通过 `execution_strategy` 参数注入策略
   - 默认保持 browser-first 行为
   - 所有 189 个单元测试通过

5. 新增 26 个单元测试覆盖策略接口

---

## 已完成：P0 最小 PR（统一观测入口 + browser-use snapshot 试点）

**实现内容**：
1. 新增 `ObservationProvider` 抽象与默认实现（`src/sasiki/engine/observation_provider.py`）
   - `LegacyObservationProvider`（回滚保底）
   - `BrowserUseObservationProvider`（默认）
   - `ProviderObservation` 统一输出：`dom_hash/llm_payload/selector_map/debug_stats`
2. `BrowserExecutionStrategy.observe()` 委托 provider
   - 支持 `observation_mode` 与 `observation_compare_log`
   - compare log 输出 old/new 元素数与 payload 大小
3. `StageExecutor` 与 `ReplayAgent` 观测链路打通
   - 每步只观测一次（消除“双观测/双格式”）
   - 同一 observation 在正常路径与 retry 路径复用
4. CLI 接入观测开关（`sasiki refine`）
   - `--observation-mode [browser_use|legacy]`（默认 `browser_use`）
   - `--observation-compare-log`
5. 测试覆盖
   - 新增 `tests/engine/test_observation_provider.py`
   - 更新 execution_strategy/replay_agent/workflow_refiner 相关回归测试
   - `uv run mypy src` 通过，`uv run pytest -q` 通过（205 passed）

> 说明：全量 `ruff check src tests` 仍受历史 lint 债影响（与本次最小 PR 非直接耦合），待单独清理。

---

## 下一步任务（当前主线）

1. **E2E 实战测试（进行中，当前最高优先级）**
   - 目标：在小红书等真实复杂网站验证执行稳定性与准确率。
   - 建议命令：
     - `sasiki refine <workflow_id> --cdp-url http://localhost:9222 --observation-mode browser_use --observation-compare-log`
   - 验收：
     - 形成可复现测试流程与失败样例归档
     - 关键 Stage 成功率指标可对照 legacy 基线
2. **Agent Prompt Cache / Message History 成本优化**
3. **Phase 4 设计**：CLI 管理、批量执行、体验优化
4. **观测层收尾：E2E 稳定后移除 legacy provider**

---

## Review 回收问题（2026-03-03）

1. ✅ **P0（已处理）**：修复 `BrowserExecutionStrategy.execute()` 对 mock `page.url` 的未 await 调用，避免 RuntimeWarning 与元数据异常。
2. ✅ **P1（已处理）**：修复 `StageExecutor` 中 `ExecutionContext.episode_log` 赋值的类型不兼容（mypy 报错）。
3. ✅ **P1（已处理）**：修复 `execution_strategy._describe_target()` 返回 `Any` 的类型问题（mypy 报错）。
4. ⏳ **P2（待处理）**：清理仓库历史 lint 债并恢复全量 lint 门禁（当前 `ruff check src tests` 约 195 项）。

---

## 重构全景（见 docs/AI_NATIVE_REDESIGN.md）

14 个 TODO，按 P0 → P2 优先级：

**P0（核心概念对齐）**：
1. ✅ WorkflowSpec model 扩展
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
14. ✅ ExecutionStrategy 接口预留（Path B）

**🎉 AI-Native Pipeline 重构全部完成！**
