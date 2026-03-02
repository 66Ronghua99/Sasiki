"""CLI implementation of HumanInteractionHandler."""

from typing import Optional

from sasiki.engine.human_interface import (
    HITLContext,
    HumanDecision,
    HumanInteractionHandler,
)


class CLIInteractiveHandler(HumanInteractionHandler):
    """命令行交互式实现

    通过标准输入输出与用户交互，适用于 CLI 场景。
    """

    async def handle_hitl_pause(
        self,
        context: HITLContext,
    ) -> tuple[HumanDecision, Optional[str]]:
        """处理 HITL 暂停，等待用户决策。

        Args:
            context: HITL 上下文信息

        Returns:
            (用户决策, 可选的反馈信息)
        """
        print(f"\n{'='*60}")
        print("⏸️  HUMAN INTERVENTION REQUIRED")
        print(f"Stage: {context.stage_name} (Step {context.step_number})")

        if context.agent_message:
            print(f"\n🤖 Agent says: {context.agent_message}")

        if context.error_message:
            print(f"\n❌ Error: {context.error_message}")

        if context.last_action:
            print(f"\n📝 Last action: {context.last_action.action_type}", end="")
            if context.last_action.target_id:
                print(f" (target_id={context.last_action.target_id})", end="")
            print()

        print(f"\n{'='*60}")
        print("Options:")
        print("  [c]ontinue - Continue with execution")
        print("  [r]etry    - Retry the failed action")
        print("  [s]kip     - Skip this stage")
        print("  [a]bort    - Abort the workflow")
        print("  [i]nput    - Provide input/feedback to the agent")

        while True:
            choice = input("\nYour choice: ").strip().lower()

            if choice in ("c", "continue", ""):
                return HumanDecision.CONTINUE, None
            elif choice in ("r", "retry"):
                return HumanDecision.RETRY, None
            elif choice in ("s", "skip"):
                return HumanDecision.SKIP_STAGE, None
            elif choice in ("a", "abort"):
                return HumanDecision.ABORT, None
            elif choice in ("i", "input"):
                feedback = input("Your feedback/input: ").strip()
                return HumanDecision.PROVIDE_INPUT, feedback
            else:
                print("Invalid choice. Please try again.")

    async def handle_checkpoint(
        self,
        stage_index: int,
        stage_name: str,
        description: str,
        manual_confirmation: bool = True,
    ) -> tuple[bool, Optional[str]]:
        """处理 Checkpoint 暂停。

        Args:
            stage_index: 当前 stage 索引
            stage_name: stage 名称
            description: checkpoint 描述
            manual_confirmation: 是否需要手动确认

        Returns:
            (是否继续, 可选的动作)
        """
        print(f"\n{'='*60}")
        print(f"⏸️  CHECKPOINT after stage {stage_index + 1}: {stage_name}")
        if description:
            print(f"   {description}")
        print(f"{'='*60}")

        if not manual_confirmation:
            print("   [Auto-continuing...]")
            return True, None

        print("Options:")
        print("  [c]ontinue - Continue to next stage")
        print("  [r]epeat   - Repeat the current stage")
        print("  [a]bort    - Abort the workflow")

        while True:
            choice = input("\nYour choice: ").strip().lower()

            if choice in ("c", "continue", ""):
                return True, None
            elif choice in ("r", "repeat", "retry"):
                return False, "repeat"
            elif choice in ("a", "abort"):
                return False, None
            else:
                print("Invalid choice. Please try again.")
