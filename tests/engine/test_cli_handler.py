"""Tests for CLIInteractiveHandler."""

import pytest
from unittest.mock import patch, MagicMock

from sasiki.commands.handlers import CLIInteractiveHandler
from sasiki.engine.human_interface import HITLContext, HumanDecision
from sasiki.engine.replay_models import AgentAction


class TestCLIInteractiveHandler:
    """Tests for CLIInteractiveHandler."""

    @pytest.fixture
    def handler(self):
        """Create a CLI handler for testing."""
        return CLIInteractiveHandler()

    @pytest.fixture
    def sample_context(self):
        """Create a sample HITLContext."""
        return HITLContext(
            stage_name="Test Stage",
            stage_index=1,
            step_number=5,
            agent_message="Please verify the result",
            error_message=None,
            last_action=None,
            current_goal="Complete task",
            history=["Step 1", "Step 2"],
        )

    @pytest.mark.asyncio
    @patch("builtins.input")
    async def test_hitl_continue(self, mock_input, handler, sample_context):
        """Test HITL with continue decision."""
        mock_input.return_value = "c"

        decision, feedback = await handler.handle_hitl_pause(sample_context)

        assert decision == HumanDecision.CONTINUE
        assert feedback is None

    @pytest.mark.asyncio
    @patch("builtins.input")
    async def test_hitl_retry(self, mock_input, handler, sample_context):
        """Test HITL with retry decision."""
        mock_input.return_value = "r"

        decision, feedback = await handler.handle_hitl_pause(sample_context)

        assert decision == HumanDecision.RETRY
        assert feedback is None

    @pytest.mark.asyncio
    @patch("builtins.input")
    async def test_hitl_skip(self, mock_input, handler, sample_context):
        """Test HITL with skip decision."""
        mock_input.return_value = "s"

        decision, feedback = await handler.handle_hitl_pause(sample_context)

        assert decision == HumanDecision.SKIP_STAGE
        assert feedback is None

    @pytest.mark.asyncio
    @patch("builtins.input")
    async def test_hitl_abort(self, mock_input, handler, sample_context):
        """Test HITL with abort decision."""
        mock_input.return_value = "a"

        decision, feedback = await handler.handle_hitl_pause(sample_context)

        assert decision == HumanDecision.ABORT
        assert feedback is None

    @pytest.mark.asyncio
    @patch("builtins.input")
    async def test_hitl_input(self, mock_input, handler, sample_context):
        """Test HITL with input decision."""
        mock_input.side_effect = ["i", "my feedback"]

        decision, feedback = await handler.handle_hitl_pause(sample_context)

        assert decision == HumanDecision.PROVIDE_INPUT
        assert feedback == "my feedback"

    @pytest.mark.asyncio
    @patch("builtins.input")
    async def test_hitl_invalid_then_valid(self, mock_input, handler, sample_context):
        """Test HITL with invalid input followed by valid."""
        mock_input.side_effect = ["invalid", "c"]

        decision, feedback = await handler.handle_hitl_pause(sample_context)

        assert decision == HumanDecision.CONTINUE
        assert mock_input.call_count == 2

    @pytest.mark.asyncio
    @patch("builtins.input")
    async def test_hitl_empty_defaults_to_continue(self, mock_input, handler, sample_context):
        """Test HITL with empty input defaults to continue."""
        mock_input.return_value = ""

        decision, feedback = await handler.handle_hitl_pause(sample_context)

        assert decision == HumanDecision.CONTINUE

    @pytest.mark.asyncio
    @patch("builtins.input")
    async def test_checkpoint_continue(self, mock_input, handler):
        """Test checkpoint with continue decision."""
        mock_input.return_value = "c"

        should_continue, action = await handler.handle_checkpoint(
            stage_index=0,
            stage_name="Test Stage",
            description="Verify completion",
            manual_confirmation=True,
        )

        assert should_continue is True
        assert action is None

    @pytest.mark.asyncio
    @patch("builtins.input")
    async def test_checkpoint_repeat(self, mock_input, handler):
        """Test checkpoint with repeat decision."""
        mock_input.return_value = "r"

        should_continue, action = await handler.handle_checkpoint(
            stage_index=0,
            stage_name="Test Stage",
            description="Verify completion",
            manual_confirmation=True,
        )

        assert should_continue is False
        assert action == "repeat"

    @pytest.mark.asyncio
    @patch("builtins.input")
    async def test_checkpoint_abort(self, mock_input, handler):
        """Test checkpoint with abort decision."""
        mock_input.return_value = "a"

        should_continue, action = await handler.handle_checkpoint(
            stage_index=0,
            stage_name="Test Stage",
            description="Verify completion",
            manual_confirmation=True,
        )

        assert should_continue is False
        assert action is None

    @pytest.mark.asyncio
    async def test_checkpoint_auto_continue(self, handler):
        """Test checkpoint auto-continues when manual_confirmation is False."""
        should_continue, action = await handler.handle_checkpoint(
            stage_index=0,
            stage_name="Test Stage",
            description="Verify completion",
            manual_confirmation=False,
        )

        assert should_continue is True
        assert action is None

    @pytest.mark.asyncio
    @patch("builtins.input")
    async def test_hitl_with_error_context(self, mock_input, handler):
        """Test HITL displays error information."""
        mock_input.return_value = "c"

        context = HITLContext(
            stage_name="Failed Stage",
            stage_index=0,
            step_number=3,
            error_message="Element not found",
            agent_message=None,
        )

        # Just verify it doesn't raise an exception
        decision, feedback = await handler.handle_hitl_pause(context)
        assert decision == HumanDecision.CONTINUE

    @pytest.mark.asyncio
    @patch("builtins.input")
    async def test_hitl_with_last_action(self, mock_input, handler):
        """Test HITL displays last action information."""
        mock_input.return_value = "c"

        action = AgentAction(
            thought="Click the button",
            action_type="click",
            target_id=42,
        )

        context = HITLContext(
            stage_name="Test Stage",
            stage_index=0,
            step_number=2,
            last_action=action,
        )

        # Just verify it doesn't raise an exception
        decision, feedback = await handler.handle_hitl_pause(context)
        assert decision == HumanDecision.CONTINUE
