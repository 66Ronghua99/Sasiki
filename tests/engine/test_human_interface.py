"""Tests for HumanInteractionHandler implementations."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from sasiki.engine.human_interface import (
    HumanInteractionHandler,
    HITLContext,
    HumanDecision,
)
from sasiki.engine.handlers.auto import NonInteractiveHandler
from sasiki.engine.replay_models import AgentAction


class TestNonInteractiveHandler:
    """Tests for NonInteractiveHandler."""

    @pytest.mark.asyncio
    async def test_default_abort_on_hitl(self):
        """Test that default is to abort on HITL."""
        handler = NonInteractiveHandler()
        context = HITLContext(
            stage_name="Test Stage",
            stage_index=0,
            step_number=1,
        )

        decision, feedback = await handler.handle_hitl_pause(context)

        assert decision == HumanDecision.ABORT
        assert feedback is None

    @pytest.mark.asyncio
    async def test_custom_hitl_default(self):
        """Test custom HITL default decision."""
        handler = NonInteractiveHandler(hitl_default=HumanDecision.CONTINUE)
        context = HITLContext(
            stage_name="Test Stage",
            stage_index=0,
            step_number=1,
        )

        decision, feedback = await handler.handle_hitl_pause(context)

        assert decision == HumanDecision.CONTINUE
        assert feedback is None

    @pytest.mark.asyncio
    async def test_checkpoint_auto_continue(self):
        """Test that checkpoint auto-continues by default."""
        handler = NonInteractiveHandler()

        should_continue, action = await handler.handle_checkpoint(
            stage_index=0,
            stage_name="Test Stage",
            description="Test checkpoint",
            manual_confirmation=True,
        )

        assert should_continue is True
        assert action is None

    @pytest.mark.asyncio
    async def test_checkpoint_auto_stop(self):
        """Test that checkpoint can be configured to stop."""
        handler = NonInteractiveHandler(checkpoint_auto_continue=False)

        should_continue, action = await handler.handle_checkpoint(
            stage_index=0,
            stage_name="Test Stage",
            description="Test checkpoint",
            manual_confirmation=True,
        )

        assert should_continue is False
        assert action is None

    @pytest.mark.asyncio
    async def test_hitl_context_ignored(self):
        """Test that HITL context is ignored in non-interactive mode."""
        handler = NonInteractiveHandler(hitl_default=HumanDecision.SKIP_STAGE)

        # Create context with various fields set
        context = HITLContext(
            stage_name="Stage",
            stage_index=5,
            step_number=10,
            agent_message="Help needed",
            error_message="Something broke",
            current_goal="Complete task",
            history=["Step 1", "Step 2"],
        )

        # Handler should ignore all context and return default
        decision, feedback = await handler.handle_hitl_pause(context)
        assert decision == HumanDecision.SKIP_STAGE


class TestHumanDecisionEnum:
    """Tests for HumanDecision enum."""

    def test_enum_values(self):
        """Test that enum values are correct."""
        assert HumanDecision.CONTINUE == "continue"
        assert HumanDecision.RETRY == "retry"
        assert HumanDecision.SKIP_STAGE == "skip"
        assert HumanDecision.ABORT == "abort"
        assert HumanDecision.PROVIDE_INPUT == "input"

    def test_enum_from_string(self):
        """Test creating enum from string."""
        assert HumanDecision("continue") == HumanDecision.CONTINUE
        assert HumanDecision("abort") == HumanDecision.ABORT


class TestHITLContext:
    """Tests for HITLContext dataclass."""

    def test_context_creation(self):
        """Test creating HITLContext."""
        action = AgentAction(
            thought="Test thought",
            action_type="click",
            target_id=1,
        )

        context = HITLContext(
            stage_name="Test Stage",
            stage_index=0,
            step_number=5,
            agent_message="Need help",
            last_action=action,
            current_goal="Complete task",
            error_message="Error occurred",
            history=["Step 1", "Step 2"],
        )

        assert context.stage_name == "Test Stage"
        assert context.stage_index == 0
        assert context.step_number == 5
        assert context.agent_message == "Need help"
        assert context.last_action == action
        assert context.current_goal == "Complete task"
        assert context.error_message == "Error occurred"
        assert context.history == ["Step 1", "Step 2"]

    def test_context_defaults(self):
        """Test HITLContext with default values."""
        context = HITLContext(
            stage_name="Test",
            stage_index=0,
            step_number=1,
        )

        assert context.agent_message is None
        assert context.last_action is None
        assert context.current_goal is None
        assert context.error_message is None
        assert context.history == []
