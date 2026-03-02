# 当前最高优先级任务

**更新日期：2026-03-02**

## 目标：构建 `WorkflowRefiner` 核心调度器

> **命名说明**：Phase 3 的目标是 **Rehearsal（试运行提纯）**——让 Agent 照着 Draft Workflow 跑一遍，剔除冗余、锚定 Locator、补全隐性步骤，最终产出 `*_final.yaml`。  
> 这与未来 Phase 4 真正的 `WorkflowReplayer`（生产环境一键回放）是不同职责，故命名为 `WorkflowRefiner`。

---

## 前置条件（✅ 全部就绪）

| 依赖模块 | 文件 | 状态 |
|---|---|---|
| 单步 Agent | `src/sasiki/engine/replay_agent.py` | ✅ Observe→Think→Act 已打通 |
| 页面观测器 | `src/sasiki/engine/page_observer.py` | ✅ CDP AXTree 压缩可用 |
| 浏览器环境 | `src/sasiki/engine/playwright_env.py` | ✅ CDP/持久化/临时模式可用 |
| Cookie 注入 | `src/sasiki/engine/cookie_manager.py` | ✅ JSON 注入已验证 |
| Workflow 模型 | `src/sasiki/workflow/models.py` | ✅ `to_execution_plan()` 已实现 |
| 原型验证 | `test_agent_loop.py` | ✅ 手动 YAML→Agent 循环已跑通 |

---

## Proposed Changes

### [NEW] `src/sasiki/engine/workflow_refiner.py`

核心调度器，职责：

1. **加载 Workflow**：从 `WorkflowStorage` 读取 YAML → `to_execution_plan()` 解析变量
2. **Stage 循环**：遍历 stages，为每个 Stage 构建独立的 Agent goal（含 stage name + actions）
3. **Step 循环**：在 Stage 内调用 `ReplayAgent.step()` → `execute_action()`，收集结果
4. **Checkpoint 处理**：指定 Stage 后暂停等待用户确认
5. **终止条件**：Agent 返回 `done` / 达到 max_steps / 用户中断
6. **产出 Final YAML**：将验证通过的步骤、锚定的 Locator 输出为 `*_final.yaml`

核心类签名：

```python
class StageResult(BaseModel):
    stage_name: str
    status: Literal["success", "failed", "skipped", "paused"]
    steps_taken: int
    actions: list[AgentAction]
    error: Optional[str] = None

class RefineResult(BaseModel):
    workflow_id: str
    workflow_name: str
    status: Literal["completed", "failed", "paused"]
    stage_results: list[StageResult]
    total_steps: int

class WorkflowRefiner:
    async def run(self, workflow, inputs, ...) -> RefineResult
    async def _execute_stage(self, page, stage, ...) -> StageResult
    async def _handle_checkpoint(self, checkpoint) -> bool
```

**关键设计决策**：

- 每个 Stage 构建独立 goal（减少 token，提高精度），而非把整个 YAML 丢给 Agent
- 首版简单 history：Stage 内累积 `action.thought`，Stage 间清零
- 失败容错：单步失败重试 1 次，连续 N 步重复相同动作则标记 Stage 失败

### [NEW] `src/sasiki/commands/refine.py`

新增 `sasiki refine <workflow_id>` CLI 命令，调用 `WorkflowRefiner.run()`。  
`sasiki run --execute` 保留给未来 Phase 4 的生产级回放，本阶段不动。

| CLI 命令 | 阶段 | 职责 |
|---|---|---|
| `sasiki refine <workflow_id>` | Phase 3（本次） | 试运行提纯，产出 `*_final.yaml` |
| `sasiki run <workflow_id> --execute` | Phase 4（未来） | 正式执行 Final Workflow |

---

## 测试方案

### 单元测试 — `tests/engine/test_workflow_refiner.py`

**完全 Mock 外部依赖**（不启动浏览器、不调用 LLM）：

| 测试场景 | 覆盖内容 |
|---|---|
| 单 Stage 单步 done | Mock Agent 返回 `done` → `StageResult.status == "success"` |
| 多 Stage 按序执行 | 每 Stage 1 步 done → 验证 stage_results 长度与顺序 |
| 最大步数保护 | Agent 每步返回 click → 达到 max_steps 后标记 failed |
| Checkpoint 暂停 | 验证指定 Stage 后暂停 |
| 单步异常 + 重试 | 首次执行抛异常、第二次成功 → 验证重试逻辑 |
| 变量解析传递 | `to_execution_plan` 的变量替换正确到达 Stage goal |

```bash
PYTHONPATH=src uv run --with pytest --with pytest-asyncio pytest tests/engine/test_workflow_refiner.py -v
```

### 手动验证（单元测试通过后）

1. `sasiki list` 选一个已有 Workflow
2. `sasiki refine <workflow_id>`
3. 观察浏览器逐 Stage 执行是否符合预期
