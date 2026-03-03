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

## 下一步（最小可执行）

**P1-7：EpisodeMemory（结构化 step log 替代 history strings）**

### 目标
将 `history: list[str]` 升级为结构化 `EpisodeEntry` 记忆，承载语义与页面变化信息，为稳定重试和阶段验证提供基础。

### 改动范围
1. `src/sasiki/engine/replay_models.py`：新增 `EpisodeEntry` 等结构化记忆模型。
2. `src/sasiki/engine/stage_executor.py`：写入 episode log 并替代裸 history。
3. `src/sasiki/engine/refiner_state.py`：在 `StageResult` 里承载结构化日志。
4. `tests/engine/*`：补充 episode memory 回归测试。

### 验证
```bash
uv run pytest -q tests/engine/test_workflow_refiner.py tests/engine/test_replay_agent_retry.py
uv run mypy src
uv run pytest -q
uv run ruff check src tests
```
