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

## 下一步（最小可执行）

**P1-8：SemanticNarrative 字段完善（semantic_meaning + progress_assessment）**
