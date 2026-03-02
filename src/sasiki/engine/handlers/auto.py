"""Non-interactive handler implementation for automated/testing scenarios."""

from typing import Optional

from sasiki.engine.human_interface import (
    HumanInteractionHandler,
    HITLContext,
    HumanDecision,
)


class NonInteractiveHandler(HumanInteractionHandler):
    """非交互式实现，用于自动化/测试场景

    此 handler 不进行任何交互式输入，而是根据预设的默认值自动决策。
    适用于 CI/CD 环境、自动化测试等不需要人工干预的场景。

    Example:
        handler = NonInteractiveHandler(hitl_default=HumanDecision.ABORT)
        refiner = WorkflowRefiner(human_handler=handler)
        result = await refiner.run(workflow, inputs)
    """

    def __init__(
        self,
        hitl_default: HumanDecision = HumanDecision.ABORT,
        checkpoint_auto_continue: bool = True,
    ):
        """Initialize the non-interactive handler.

        Args:
            hitl_default: HITL 暂停时的默认决策
            checkpoint_auto_continue: Checkpoint 是否自动继续
        """
        self.hitl_default = hitl_default
        self.checkpoint_auto_continue = checkpoint_auto_continue

    async def handle_hitl_pause(
        self,
        context: HITLContext,
    ) -> tuple[HumanDecision, Optional[str]]:
        """非交互式处理 HITL 暂停，直接返回默认决策。

        Args:
            context: HITL 上下文（在此实现中被忽略）

        Returns:
            (默认决策, None)
        """
        return self.hitl_default, None

    async def handle_checkpoint(
        self,
        stage_index: int,
        stage_name: str,
        description: str,
        manual_confirmation: bool = True,
    ) -> tuple[bool, Optional[str]]:
        """非交互式处理 Checkpoint，根据配置自动决策。

        Args:
            stage_index: 当前 stage 索引
            stage_name: stage 名称
            description: checkpoint 描述
            manual_confirmation: 是否需要手动确认（在此实现中被忽略）

        Returns:
            (是否继续, None)
        """
        # 在非交互模式下，根据配置决定是否继续
        # 如果 checkpoint 要求手动确认但我们处于非交互模式，
        # 则根据 checkpoint_auto_continue 配置决定
        return self.checkpoint_auto_continue, None
