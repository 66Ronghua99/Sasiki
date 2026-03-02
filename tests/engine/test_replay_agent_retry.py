"""Tests for ReplayAgent retry context support."""

import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch

from sasiki.engine.replay_agent import ReplayAgent
from sasiki.engine.replay_models import AgentAction, RetryContext


class TestReplayAgentStepWithContext:
    """Tests for ReplayAgent.step_with_context method."""

    @pytest.fixture
    def mock_observer(self):
        """Create a mock observer."""
        with patch("sasiki.engine.replay_agent.AccessibilityObserver") as MockObserver:
            mock = MagicMock()
            mock.observe = AsyncMock(return_value={
                "compressed_tree": [{"id": 1, "name": "button"}],
                "node_map": {1: {"raw_node": {"backendDOMNodeId": 123}}},
            })
            MockObserver.return_value = mock
            yield mock

    @pytest.fixture
    def mock_llm(self):
        """Create a mock LLM client."""
        with patch("sasiki.engine.replay_agent.LLMClient") as MockLLM:
            mock = MagicMock()
            mock.complete_async = AsyncMock(return_value=json.dumps({
                "thought": "Test thought",
                "action_type": "click",
                "target_id": 1,
            }))
            MockLLM.return_value = mock
            yield mock

    @pytest.fixture
    def mock_page(self):
        """Create a mock Playwright page."""
        page = AsyncMock()
        return page

    @pytest.mark.asyncio
    async def test_step_without_context(self, mock_observer, mock_llm, mock_page):
        """Test normal step without retry context."""
        agent = ReplayAgent()

        action = await agent.step(mock_page, "Click the button")

        assert action.action_type == "click"
        assert action.target_id == 1
        # Should use normal system prompt
        calls = mock_llm.complete_async.call_args_list
        assert len(calls) == 1
        messages = calls[0].kwargs.get("messages", calls[0][1].get("messages", []))
        # Verify it's a normal prompt (not retry)
        assert any("DOM Snapshot" in msg.get("content", "") for msg in messages)

    @pytest.mark.asyncio
    async def test_step_with_retry_context(self, mock_observer, mock_llm, mock_page):
        """Test step with retry context."""
        agent = ReplayAgent()

        failed_action = AgentAction(
            thought="Try to click",
            action_type="click",
            target_id=1,
        )

        retry_ctx = RetryContext(
            failed_action=failed_action,
            error_message="Element not found",
            error_type="element_not_found",
            attempt_number=2,
            max_attempts=2,
        )

        action = await agent.step_with_context(
            mock_page, "Click the button", retry_context=retry_ctx
        )

        assert action.action_type == "click"
        # Should use retry system prompt
        calls = mock_llm.complete_async.call_args_list
        assert len(calls) == 1
        messages = calls[0].kwargs.get("messages", calls[0][1].get("messages", []))
        # Verify retry context is in the prompt
        user_message = messages[1]["content"] if len(messages) > 1 else ""
        assert "PREVIOUS ACTION FAILED" in user_message
        assert "Element not found" in user_message
        assert "element_not_found" in user_message
        assert "Attempt: 2/2" in user_message

    @pytest.mark.asyncio
    async def test_step_with_action_history(self, mock_observer, mock_llm, mock_page):
        """Test step with action history."""
        agent = ReplayAgent()

        history = ["Step 1: Clicked button", "Step 2: Typed text"]

        action = await agent.step(
            mock_page, "Click the button", action_history=history
        )

        # Verify history is in the prompt
        calls = mock_llm.complete_async.call_args_list
        messages = calls[0].kwargs.get("messages", calls[0][1].get("messages", []))
        user_message = messages[1]["content"] if len(messages) > 1 else ""
        assert "Recent actions" in user_message
        assert "Step 1: Clicked button" in user_message
        assert "Step 2: Typed text" in user_message

    @pytest.mark.asyncio
    async def test_retry_prompt_includes_error_analysis(self, mock_observer, mock_llm, mock_page):
        """Test retry prompt includes error analysis instructions."""
        agent = ReplayAgent()

        retry_ctx = RetryContext(
            failed_action=None,
            error_message="Timeout waiting for element",
            error_type="timeout",
            attempt_number=1,
            max_attempts=2,
        )

        await agent.step_with_context(
            mock_page, "Click the button", retry_context=retry_ctx
        )

        calls = mock_llm.complete_async.call_args_list
        messages = calls[0].kwargs.get("messages", calls[0][1].get("messages", []))
        user_message = messages[1]["content"] if len(messages) > 1 else ""

        # Should include error analysis guidance
        assert "Element not found or not visible" in user_message
        assert "Page navigation occurred" in user_message
        assert "Network delay" in user_message
        assert "Wrong target selected" in user_message

    @pytest.mark.asyncio
    async def test_retry_prompt_with_failed_action_json(self, mock_observer, mock_llm, mock_page):
        """Test retry prompt includes failed action as JSON."""
        agent = ReplayAgent()

        failed_action = AgentAction(
            thought="Click the submit button",
            action_type="click",
            target_id=42,
            value=None,
        )

        retry_ctx = RetryContext(
            failed_action=failed_action,
            error_message="Backend node not found",
            error_type="element_not_found",
            attempt_number=2,
            max_attempts=2,
        )

        await agent.step_with_context(
            mock_page, "Submit the form", retry_context=retry_ctx
        )

        calls = mock_llm.complete_async.call_args_list
        messages = calls[0].kwargs.get("messages", calls[0][1].get("messages", []))
        user_message = messages[1]["content"] if len(messages) > 1 else ""

        # Should include failed action details
        assert "Failed action:" in user_message
        assert "click" in user_message
        assert "42" in user_message


class TestReplayAgentPromptBuilding:
    """Tests for ReplayAgent prompt building methods."""

    @pytest.fixture
    def agent(self):
        """Create a ReplayAgent instance."""
        with patch("sasiki.engine.replay_agent.AccessibilityObserver"):
            with patch("sasiki.engine.replay_agent.LLMClient"):
                return ReplayAgent()

    def test_build_normal_prompt(self, agent):
        """Test building normal prompt."""
        compressed_tree = [{"id": 1, "name": "button"}]
        history = ["Previous thought"]

        prompt = agent._build_normal_prompt(
            "Click the button", compressed_tree, history
        )

        assert "Goal: Click the button" in prompt
        assert "Recent actions:" in prompt
        assert "Previous thought" in prompt
        assert json.dumps(compressed_tree) in prompt

    def test_build_normal_prompt_without_history(self, agent):
        """Test building normal prompt without history."""
        compressed_tree = [{"id": 1, "name": "button"}]

        prompt = agent._build_normal_prompt(
            "Click the button", compressed_tree, None
        )

        assert "Goal: Click the button" in prompt
        assert "Recent actions:" not in prompt

    def test_build_retry_prompt(self, agent):
        """Test building retry prompt."""
        compressed_tree = [{"id": 1, "name": "button"}]
        failed_action = AgentAction(
            thought="Try to click",
            action_type="click",
            target_id=1,
        )
        retry_ctx = RetryContext(
            failed_action=failed_action,
            error_message="Not found",
            error_type="element_not_found",
            attempt_number=2,
            max_attempts=2,
        )

        prompt = agent._build_retry_prompt(
            "Click the button", retry_ctx, compressed_tree, None
        )

        assert "⚠️  PREVIOUS ACTION FAILED ⚠️" in prompt
        assert "Error type: element_not_found" in prompt
        assert "Error message: Not found" in prompt
        assert "Attempt: 2/2" in prompt
        assert "IMPORTANT: Analyze why" in prompt

    def test_build_retry_prompt_with_history(self, agent):
        """Test building retry prompt with action history."""
        compressed_tree = [{"id": 1, "name": "button"}]
        history = ["Step 1", "Step 2", "Step 3"]
        retry_ctx = RetryContext(
            failed_action=None,
            error_message="Timeout",
            error_type="timeout",
            attempt_number=1,
            max_attempts=2,
        )

        prompt = agent._build_retry_prompt(
            "Click the button", retry_ctx, compressed_tree, history
        )

        # Should include last 3 actions
        assert "Previous actions before failure:" in prompt
        assert "Step 1" in prompt
        assert "Step 2" in prompt
        assert "Step 3" in prompt
