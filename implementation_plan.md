# implementation_plan

## 当前状态（P0）

| 项 | 状态 |
|---|---|
| P0-1 WorkflowSpec model 扩展 | ✅ |
| P0-2 SkillGenerator prompt 更新 | ✅ |
| P0-3 AriaSnapshot 替代 CompressedNode | ✅ |
| P0-4 StageContext 类 | ✅ |
| P0-5 AgentDecision 替代 AgentAction | ✅ |
| P0-6 ActionExecutor(get_by_role) | ✅ |

## 已完成

**P1-7：EpisodeMemory（结构化 step log 替代 history strings）**

### 结果
- 新增 `EpisodeEntry` 并在 `StageExecutor` 每步写入 `episode_log`。
- `StageResult` 扩展为携带 `episode_log`，并覆盖普通执行、重试、HITL 分支。
- `test_workflow_refiner.py` 补充 episode memory 断言与语义字段回归测试。

### 改动范围
1. `src/sasiki/engine/replay_models.py`：新增 `EpisodeEntry` 等结构化记忆模型。
2. `src/sasiki/engine/stage_executor.py`：写入 episode log 并替代裸 history。
3. `src/sasiki/engine/refiner_state.py`：在 `StageResult` 里承载结构化日志。
4. `tests/engine/*`：补充 episode memory 回归测试。

### 验证结果
```bash
uv run ruff check src tests
uv run mypy src
uv run pytest -q
```

**P1-8：SemanticNarrative 字段完善（semantic_meaning + progress_assessment）**

### 结果
- `ReplayAgent` 正常与重试 system prompt 均显式要求输出 `semantic_meaning` 和 `progress_assessment`。
- `StageExecutor` 在模型未返回语义字段时提供确定性 fallback，保证 `episode_log` 中语义字段稳定可用。
- 增加 prompt/schema 与 fallback 的回归断言测试。

**P1-9：StagnationDetector（dom_hash 停滞检测）**

### 结果
- `ReplayAgent` 暴露 `last_dom_hash`，由每步 observation 更新。
- `StageExecutor` 新增 dom_hash 连续检测逻辑，触发时返回明确的 stagnation failure。
- `EpisodeEntry` 记录 `dom_hash_before/dom_hash_after`，并新增停滞检测回归测试。

**P1-10：Multi-level retry（L1/L2/L3/L4）**

### 结果
- `StageExecutor` 增加 `max_retry_attempts`，将重试从单次扩展为多层升级重试（默认最多 3 次总尝试）。
- 每层重试通过 `RetryContext.attempt_number/max_attempts` 显式传递到 Agent，失败后继续升级到下一层，最终再进入 HITL。
- 新增回归测试覆盖“第二层重试成功”路径，并校验 attempt 编号。

**P1-11：StageVerifier（evidence-based done）**

### 结果
- 新增 `StageVerifier`，对 `done` 决策执行 evidence-based 校验。
- `StageResult` 新增 `verified` 与 `verification_evidence`，在成功/拒绝路径中明确记录验证结果。
- `ReplayAgent` prompt schema 增加 `evidence` 字段要求，补充对应回归断言。
- 增加 verified/unverified 两条回归测试，覆盖 `done` 的成功与失败分支。

**P2-12：WorldState 跨 Stage 传递**

### 结果
- `StageResult` 新增 `world_state_summary` 字段。
- `StageExecutor` 在 stage 成功结束时生成 `world_state_summary`（URL + done evidence）。
- `WorkflowRefiner` 在 Stage 间传递 world state，并注入下一阶段 prompt。
- 新增回归测试覆盖 world state prompt 注入与 `_build_stage_goal` 渲染。

**P2-13：ExecutionReport 输出格式**

### 结果
- 在 `RefinerState` 中新增 `ExecutionReport/ExecutionStageReport` 结构，统一汇总 workflow 级与 stage 级执行结果。
- `WorkflowRefiner` 在每次运行结束后生成并持久化 `execution_report_<suffix>.json`（含失败场景）。
- `RefineResult` 新增 `execution_report` 与 `execution_report_path`，CLI 汇总输出新增报告路径展示。
- 增加回归断言，校验 report 基本字段与 stage 明细字段。

## 下一步（最小可执行）

**P2-14：ExecutionStrategy 接口预留（Path B）**
