"""Human interaction handler abstraction interface.

This module defines the abstract interface for human-in-the-loop (HITL) interactions.
The engine layer depends only on this interface, not on any specific implementation.
Different frontends (CLI, Web, Desktop) provide their own implementations.
"""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Optional
from dataclasses import dataclass, field

from sasiki.engine.replay_models import AgentAction


class HumanDecision(str, Enum):
    """用户在 HITL 暂停时的决策选项"""
    CONTINUE = "continue"
    RETRY = "retry"
    SKIP_STAGE = "skip"
    ABORT = "abort"
    PROVIDE_INPUT = "input"


@dataclass
class HITLContext:
    """HITL 暂停时的上下文信息"""
    stage_name: str
    stage_index: int
    step_number: int
    agent_message: Optional[str] = None
    last_action: Optional[AgentAction] = None
    current_goal: Optional[str] = None
    error_message: Optional[str] = None
    history: list[str] = field(default_factory=list)


class HumanInteractionHandler(ABC):
    """人工介入处理器抽象接口

    设计原则：
    1. 引擎层依赖此接口，不依赖具体实现
    2. 各前端（CLI/Web/Client）各自实现此接口
    3. 实现通过依赖注入传入 WorkflowRefiner
    """

    @abstractmethod
    async def handle_hitl_pause(
        self,
        context: HITLContext
    ) -> tuple[HumanDecision, Optional[str]]:
        """处理 HITL 暂停，等待用户决策

        Args:
            context: HITL 上下文信息

        Returns:
            (decision, feedback): 用户决策和可选的反馈信息
        """
        pass

    @abstractmethod
    async def handle_checkpoint(
        self,
        stage_index: int,
        stage_name: str,
        description: str,
        manual_confirmation: bool = True,
    ) -> tuple[bool, Optional[str]]:
        """处理 Checkpoint 暂停

        Args:
            stage_index: 当前 stage 索引
            stage_name: stage 名称
            description: checkpoint 描述
            manual_confirmation: 是否需要手动确认

        Returns:
            (should_continue, action): action 可以是 "repeat" 或 None
        """
        pass
