> [!NOTE]
> **归档文档** | 归档日期：2026-03-02
> 本文档记录了 human in the loop 循环的重构计划
> HITL 已经进行基本功能开发，此文档归档处理，不做参考
> 

# WorkflowRefiner Retry 机制与 HITL 循环重构计划

## 背景与问题

当前 `WorkflowRefiner` 实现存在两个关键缺陷：

### 问题 1: Retry 缺乏失败经验传递

**现状：**
```python
except Exception as e:
    logger.warning("action_failed_retrying", error=str(e))
    action = await self.agent.step(page, goal)  # ❌ 相同的 goal，Agent 不知道失败原因
```

**缺陷：**
- Agent 不知道上一次为什么失败
- DOM 没有重新观测，页面可能已变化
- 失败经验没有累积到 history

### 问题 2: HITL 暂停后没有真正的恢复机制

**现状：**
```python
if result.status == "paused":
    final_status = "paused"
    for remaining_stage in stages[stage_index + 1 :]:
        stage_results.append(StageResult(..., status="skipped", ...))
    break  # ❌ 直接退出，没有用户输入，没有恢复！
```

**缺陷：**
- `ask_human` 只是打印消息，没有等待用户响应
- Checkpoint 自动继续，没有真正暂停
- 无法从 Stage 中间恢复执行

---

## 目标

1. **智能 Retry**: 失败时传递错误上下文，让 Agent 能调整策略
2. **真正的 HITL**: 暂停时等待用户输入，支持多种决策（继续/重试/跳过/中止）
3. **可恢复执行**: 支持从 Stage 任意步骤断点恢复

---

## 设计方案

### 1. 增强 Retry 机制

#### 1.1 新的 Prompt 结构

```python
@dataclass
class RetryContext:
    """Retry 时的上下文信息"""
    original_goal: str
    failed_action: AgentAction
    error_message: str
    error_type: str  # "execution_error", "element_not_found", "navigation_error", etc.
    previous_attempts: int
    page_state_changed: bool  # DOM 是否有变化
```

#### 1.2 带失败经验的 Prompt

```pythonndef _build_retry_goal(
    self,
    original_goal: str,
    retry_context: RetryContext,
    current_observation: dict
) -> str:
    """构建包含失败经验的 retry goal"""
    return f"""
{original_goal}

⚠️  PREVIOUS ACTION FAILED ⚠️
Failed action: {retry_context.failed_action.model_dump_json()}
Error: {retry_context.error_message}
Attempt: {retry_context.previous_attempts + 1}/2

IMPORTANT: The previous action failed. Please analyze why and try a DIFFERENT approach.
Possible reasons to consider:
- Element not found or not visible
- Page navigation occurred
- Network delay
- Wrong target selected

Current page state (updated):
{json.dumps(current_observation["compressed_tree"], ensure_ascii=False)}

Choose the next action carefully.
"""
```

#### 1.3 Retry 执行流程

```python
async def _execute_step_with_retry(
    self,
    page: Page,
    goal: str,
    step_number: int,
    history: list[str]
) -> tuple[AgentAction, bool]:
    """
    执行单步，带智能 retry

    Returns:
        (action, success): 执行的动作和是否成功
    """
    max_retries = 1

    for attempt in range(max_retries + 1):
        try:
            # 每次 retry 都重新观测页面
            observation = await self.agent.observer.observe(page)

            if attempt == 0:
                # 首次尝试，使用原始 goal
                current_goal = goal
            else:
                # Retry，构建包含失败经验的 goal
                retry_context = RetryContext(
                    original_goal=goal,
                    failed_action=last_failed_action,
                    error_message=str(last_error),
                    error_type=self._classify_error(last_error),
                    previous_attempts=attempt - 1,
                    page_state_changed=self._has_page_changed(
                        previous_observation, observation
                    )
                )
                current_goal = self._build_retry_goal(goal, retry_context, observation)

            # 调用 Agent
            action = await self.agent.step(page, current_goal)

            # 执行动作
            await self.agent.execute_action(page, action)

            return action, True

        except Exception as e:
            last_error = e
            last_failed_action = action if 'action' in locals() else None
            previous_observation = observation if 'observation' in locals() else None

            if attempt < max_retries:
                logger.warning(
                    "step_failed_retrying",
                    step=step_number,
                    attempt=attempt + 1,
                    error=str(e)
                )
                continue
            else:
                # 所有 retry 耗尽
                raise StepExecutionError(
                    f"Step {step_number} failed after {max_retries + 1} attempts: {e}",
                    failed_action=last_failed_action,
                    error=e
                )
```

---

### 2. HITL 循环重构

#### 2.1 新的状态机设计

```
┌─────────────┐
│   RUNNING   │
└──────┬──────┘
       │
       ▼
┌─────────────────┐     ┌─────────────┐
│  EXECUTE_STEP   │────▶│    DONE     │
└────────┬────────┘     └─────────────┘
         │
         │  ask_human / checkpoint
         ▼
┌─────────────────┐
│ AWAITING_HUMAN  │◄──────┐
└────────┬────────┘       │
         │                 │
         ▼                 │
┌─────────────────┐        │
│  HUMAN_DECISION │────────┘
│  (continue/skip │  resume
│   /retry/abort) │
└─────────────────┘
```

#### 2.2 HumanDecision 模型

```python
class HumanDecision(str, Enum):
    """用户在 HITL 暂停时的决策选项"""
    CONTINUE = "continue"    # 继续执行（使用 Agent 的下一步）
    RETRY = "retry"          # 重试上一步
    SKIP_STAGE = "skip"      # 跳过当前 Stage
    ABORT = "abort"          # 中止整个流程
    EDIT = "edit"            # 编辑当前 goal（高级）

@dataclass
class HITLContext:
    """HITL 暂停时的上下文信息"""
    stage_name: str
    stage_index: int
    step_number: int
    agent_message: str
    last_action: Optional[AgentAction]
    current_goal: str
    page_screenshot: Optional[bytes]  # 可选：当前页面截图
    history: list[str]
    options: list[HumanDecision]
```

#### 2.3 交互式 HITL 实现

```python
async def _handle_human_intervention(
    self,
    context: HITLContext
) -> tuple[HumanDecision, Optional[str]]:
    """
    处理人工介入，等待用户决策

    Returns:
        (decision, feedback): 用户决策和可选的反馈信息
    """
    print(f"\n{'='*60}")
    print(f"⏸️  HUMAN INTERVENTION REQUIRED")
    print(f"{'='*60}")
    print(f"\nStage: {context.stage_name} (Step {context.step_number})")

    if context.agent_message:
        print(f"\n🤖 Agent says:\n   {context.agent_message}")

    if context.last_action:
        print(f"\n📍 Last action:\n   {context.last_action.model_dump_json(indent=2)}")

    print(f"\nRecent progress:")
    for thought in context.history[-3:]:
        print(f"   • {thought[:80]}...")

    print(f"\nOptions:")
    print(f"  [c]ontinue  - Resume with Agent's next action")
    print(f"  [r]etry     - Retry the last action")
    print(f"  [s]kip      - Skip to next stage")
    print(f"  [a]bort     - Stop refinement")
    if context.last_action and context.last_action.action_type == "ask_human":
        print(f"  [t]ext      - Provide text response to Agent")

    while True:
        choice = input("\nYour choice [c/r/s/a]: ").strip().lower()

        if choice in ('c', 'continue', ''):
            return HumanDecision.CONTINUE, None
        elif choice in ('r', 'retry'):
            return HumanDecision.RETRY, None
        elif choice in ('s', 'skip'):
            return HumanDecision.SKIP_STAGE, None
        elif choice in ('a', 'abort'):
            return HumanDecision.ABORT, None
        elif choice in ('t', 'text') and context.last_action.action_type == "ask_human":
            feedback = input("Enter your response: ")
            return HumanDecision.CONTINUE, feedback
        else:
            print("Invalid choice. Please try again.")
```

#### 2.4 重构后的 Stage 执行循环

```python
async def _execute_stage_with_hitl(
    self,
    page: Page,
    stage: dict[str, Any],
    stage_index: int,
    resume_from_step: int = 0
) -> StageResult:
    """
    执行单个 Stage，支持 HITL 暂停和恢复
    """
    stage_name = stage["name"]
    goal = self._build_stage_goal(stage)

    taken_actions: list[AgentAction] = []
    steps_taken = resume_from_step

    # 如果恢复执行，恢复 history
    if resume_from_step > 0:
        self._history = self._checkpoint_history.copy()
    else:
        self._history = []

    while steps_taken < self.max_steps_per_stage:
        try:
            # 执行单步（带 retry）
            action, success = await self._execute_step_with_retry(
                page, goal, steps_taken, self._history
            )

            taken_actions.append(action)
            steps_taken += 1

            # 累积 thought
            if action.thought:
                self._history.append(action.thought)

            # 检查是否完成
            if action.action_type == "done":
                return StageResult(
                    stage_name=stage_name,
                    status="success",
                    steps_taken=steps_taken,
                    actions=taken_actions
                )

            # 检查是否需要人工介入
            if action.action_type == "ask_human":
                hitl_context = HITLContext(
                    stage_name=stage_name,
                    stage_index=stage_index,
                    step_number=steps_taken,
                    agent_message=action.message,
                    last_action=action,
                    current_goal=goal,
                    history=self._history,
                    options=[HumanDecision.CONTINUE, HumanDecision.RETRY,
                            HumanDecision.SKIP_STAGE, HumanDecision.ABORT]
                )

                decision, feedback = await self._handle_human_intervention(hitl_context)

                if decision == HumanDecision.ABORT:
                    return StageResult(
                        stage_name=stage_name,
                        status="failed",
                        steps_taken=steps_taken,
                        actions=taken_actions,
                        error="Aborted by user"
                    )

                elif decision == HumanDecision.SKIP_STAGE:
                    return StageResult(
                        stage_name=stage_name,
                        status="skipped",
                        steps_taken=steps_taken,
                        actions=taken_actions
                    )

                elif decision == HumanDecision.RETRY:
                    # 回退一步，重试
                    steps_taken -= 1
                    if taken_actions:
                        taken_actions.pop()
                    if self._history:
                        self._history.pop()
                    continue

                elif decision == HumanDecision.CONTINUE:
                    # 如果有用户反馈，可以传递给 Agent（通过某种机制）
                    if feedback:
                        self._history.append(f"Human feedback: {feedback}")
                    continue

        except StepExecutionError as e:
            # Step 执行失败（retry 耗尽）
            hitl_context = HITLContext(
                stage_name=stage_name,
                stage_index=stage_index,
                step_number=steps_taken,
                agent_message=f"Step failed: {e.error}",
                last_action=e.failed_action,
                current_goal=goal,
                history=self._history,
                options=[HumanDecision.RETRY, HumanDecision.SKIP_STAGE, HumanDecision.ABORT]
            )

            decision, _ = await self._handle_human_intervention(hitl_context)

            if decision == HumanDecision.ABORT:
                return StageResult(
                    stage_name=stage_name,
                    status="failed",
                    steps_taken=steps_taken,
                    actions=taken_actions,
                    error=f"Aborted after error: {e}"
                )

            elif decision == HumanDecision.SKIP_STAGE:
                return StageResult(
                    stage_name=stage_name,
                    status="skipped",
                    steps_taken=steps_taken,
                    actions=taken_actions
                )

            elif decision == HumanDecision.RETRY:
                # 重试当前 step
                continue

    # Max steps reached
    return StageResult(...)
```

---

### 3. Checkpoint 增强

```python
async def _handle_checkpoint(
    self,
    checkpoint: dict,
    stage_index: int,
    stage_result: StageResult
) -> tuple[bool, Optional[str]]:
    """
    处理 checkpoint，返回 (should_continue, abort_reason)
    """
    description = checkpoint.get("description", "Checkpoint")
    manual_confirmation = checkpoint.get("manual_confirmation", True)
    verify_outputs = checkpoint.get("verify_outputs", [])

    print(f"\n{'='*60}")
    print(f"⏸️  CHECKPOINT after stage {stage_index + 1}")
    print(f"{'='*60}")
    print(f"\nDescription: {description}")

    # 展示 Stage 执行结果
    print(f"\nStage Summary:")
    print(f"  Steps executed: {stage_result.steps_taken}")
    print(f"  Status: {stage_result.status}")

    if verify_outputs:
        print(f"\nVerified outputs:")
        for output in verify_outputs:
            print(f"  • {output}")

    if not manual_confirmation:
        print("\n[Auto-continuing...]")
        return True, None

    # 等待用户确认
    print(f"\nOptions:")
    print(f"  [c]ontinue  - Proceed to next stage")
    print(f"  [r]epeat    - Repeat this stage")
    print(f"  [a]bort     - Stop refinement")

    while True:
        choice = input("\nYour choice [c/r/a]: ").strip().lower()

        if choice in ('c', 'continue', ''):
            return True, None
        elif choice in ('r', 'repeat'):
            return False, "repeat_stage"  # 特殊信号
        elif choice in ('a', 'abort'):
            return False, "aborted"
        else:
            print("Invalid choice. Please try again.")
```

---

### 4. 可恢复执行（断点续传）

```python
@dataclass
class ExecutionCheckpoint:
    """执行断点，用于恢复"""
    workflow_id: str
    stage_index: int
    step_number: int
    history: list[str]
    page_url: str
    timestamp: datetime
    variables: dict[str, str]

class WorkflowRefiner:
    def __init__(self, ...):
        ...
        self._checkpoint_store: Optional[ExecutionCheckpoint] = None

    async def run(
        self,
        workflow: Workflow,
        inputs: dict[str, str],
        start_stage: int = 0,
        resume_from_checkpoint: Optional[ExecutionCheckpoint] = None,
        ...
    ) -> RefineResult:

        if resume_from_checkpoint:
            # 从断点恢复
            start_stage = resume_from_checkpoint.stage_index
            self._checkpoint_history = resume_from_checkpoint.history.copy()
            # 导航回之前的页面
            await page.goto(resume_from_checkpoint.page_url)

        ...

    def _save_checkpoint(self, stage_index: int, step_number: int):
        """保存当前执行状态"""
        self._checkpoint_store = ExecutionCheckpoint(
            workflow_id=str(self.current_workflow_id),
            stage_index=stage_index,
            step_number=step_number,
            history=self._history.copy(),
            page_url=self.current_page_url,
            timestamp=datetime.now(),
            variables=self.current_variables.copy()
        )
        # 持久化到文件，支持跨进程恢复
        self._persist_checkpoint(self._checkpoint_store)
```

---

## 修改的文件清单

| 文件 | 修改类型 | 修改内容 |
|------|----------|----------|
| `src/sasiki/engine/workflow_refiner.py` | 大幅修改 | 添加 RetryContext, HITLContext, 重构 _execute_stage |
| `src/sasiki/engine/replay_agent.py` | 小幅修改 | 优化 retry prompt 构建 |
| `src/sasiki/engine/replay_models.py` | 添加 | HumanDecision, ExecutionCheckpoint 模型 |
| `src/sasiki/commands/refine.py` | 修改 | 添加 resume 参数，支持从断点恢复 |
| `tests/engine/test_workflow_refiner.py` | 添加测试 | 测试 retry 逻辑、HITL 决策、断点恢复 |

---

## 验证计划

### 单元测试

```python
# 新测试用例
class TestRetryMechanism:
    async def test_retry_includes_error_context(self):
        """验证 retry 时传递了失败上下文"""

    async def test_retry_reobserves_page(self):
        """验证 retry 时重新观测了页面"""

    async def test_retry_exhausted_raises_error(self):
        """验证 retry 耗尽后抛出 StepExecutionError"""

class TestHITLInteraction:
    async def test_ask_human_presents_options(self):
        """验证 ask_human 显示正确的选项"""

    async def test_human_can_retry_step(self):
        """验证用户选择 retry 后重试当前 step"""

    async def test_human_can_skip_stage(self):
        """验证用户选择 skip 后跳过当前 stage"""

    async def test_human_can_abort(self):
        """验证用户选择 abort 后中止流程"""

class TestCheckpointEnhanced:
    async def test_checkpoint_shows_summary(self):
        """验证 checkpoint 显示 stage 执行摘要"""

    async def test_checkpoint_can_repeat_stage(self):
        """验证 checkpoint 支持重复当前 stage"""
```

### 手动验证

```bash
# 1. 测试 retry 逻辑
sasiki refine <workflow_id> --max-steps 5
# 观察当 action 失败时，Agent 是否收到错误上下文

# 2. 测试 HITL
sasiki refine <workflow_id>
# 当 Agent 返回 ask_human 时，验证是否出现交互式选项

# 3. 测试断点恢复
sasiki refine <workflow_id> --resume-from checkpoint.json
```

---

## 向后兼容性

- `StageResult` 和 `RefineResult` 模型保持不变
- `run()` 方法签名新增可选参数 `resume_from_checkpoint`
- 默认行为不变（非交互式模式仍然可用）
- 新增 `--no-interactive` flag 禁用 HITL，用于自动化场景
