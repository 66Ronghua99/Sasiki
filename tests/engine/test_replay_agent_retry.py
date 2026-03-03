"""Tests for ReplayAgent retry context support."""

import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch

from sasiki.engine.replay_agent import ReplayAgent
from sasiki.engine.replay_models import AgentAction, RetryContext
from sasiki.engine.page_observer import (
    AriaElement,
    AriaSnapshot,
    CompressedNode,
    LocatorInfo,
    NodeMapping,
    ObservationResult,
)


class TestReplayAgentStepWithContext:
    """Tests for ReplayAgent.step_with_context method."""

    @pytest.fixture
    def mock_observer(self):
        """Create a mock observer."""
        with patch("sasiki.engine.replay_agent.AccessibilityObserver") as MockObserver:
            mock = MagicMock()
            # Create proper ObservationResult with model instances
            compressed_node = CompressedNode(node_id=1, role="button", name="button")
            node_mapping = NodeMapping(
                clean_node=compressed_node,
                raw_node={"backendDOMNodeId": 123},
                locator_args=LocatorInfo(role="button", name="button"),
            )
            snapshot = AriaSnapshot(
                url="https://example.com",
                title="Example",
                dom_hash="deadbeef",
                interactive=[AriaElement(role="button", name="button")],
                readable=[AriaElement(role="text", text="Example")],
            )
            mock.observe = AsyncMock(return_value=ObservationResult(
                compressed_tree=compressed_node,
                node_map={1: node_mapping},
                snapshot=snapshot,
            ))
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
        locator = AsyncMock()
        locator.inner_text = AsyncMock(return_value="mock text")
        locator.is_visible = AsyncMock(return_value=True)
        page.get_by_role = MagicMock(return_value=locator)
        return page

    @pytest.mark.asyncio
    async def test_step_without_context(self, mock_observer, mock_llm, mock_page):
        """Test normal step without retry context."""
        agent = ReplayAgent()

        action = await agent.step(mock_page, "Click the button")

        assert action.action_type == "click"
        assert action.target_id == 1
        assert agent.last_dom_hash == "deadbeef"
        # Should use normal system prompt
        calls = mock_llm.complete_async.call_args_list
        assert len(calls) == 1
        messages = calls[0].kwargs.get("messages", calls[0][1].get("messages", []))
        # Verify it's a normal prompt (not retry)
        assert any("DOM Snapshot" in msg.get("content", "") for msg in messages)
        system_message = messages[0]["content"] if messages else ""
        assert "semantic_meaning" in system_message
        assert "progress_assessment" in system_message
        assert "evidence" in system_message
        user_message = messages[1]["content"] if len(messages) > 1 else ""
        assert "dom_hash" in user_message
        assert "deadbeef" in user_message

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
        system_message = messages[0]["content"] if messages else ""
        assert "semantic_meaning" in system_message
        assert "progress_assessment" in system_message
        assert "evidence" in system_message
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

    @pytest.mark.asyncio
    async def test_step_with_semantic_target(self, mock_observer, mock_llm, mock_page):
        """Test parsing semantic target schema without legacy target_id."""
        mock_llm.complete_async.return_value = json.dumps({
            "thought": "Use semantic target",
            "action_type": "click",
            "target": {"role": "button", "name": "button"},
        })
        agent = ReplayAgent()

        action = await agent.step(mock_page, "Click the button")

        assert action.action_type == "click"
        assert action.target is not None
        assert action.target.role == "button"
        assert action.target_id is None

    @pytest.mark.asyncio
    async def test_execute_action_resolves_target_id_from_semantic_target(self, mock_observer, mock_llm, mock_page):
        """Test semantic target executes via role-based locator path."""
        agent = ReplayAgent()
        action = AgentAction(
            thought="Click semantic target",
            action_type="click",
            target={"role": "button", "name": "button"},
        )
        await agent.step(mock_page, "Click the button")

        await agent.execute_action(mock_page, action)

        mock_page.get_by_role.assert_called_with("button", name="button")

    @pytest.mark.asyncio
    async def test_execute_action_click_falls_back_to_text_when_role_click_times_out(self, mock_observer, mock_llm):
        """Test click fallback to get_by_text when role-based click fails."""
        page = AsyncMock()
        page.wait_for_load_state = AsyncMock()

        primary_locator = AsyncMock()
        primary_locator.click = AsyncMock(side_effect=Exception("click timeout"))
        page.get_by_role = MagicMock(return_value=primary_locator)

        fallback_locator = AsyncMock()
        fallback_locator.click = AsyncMock()
        fallback_query = MagicMock()
        fallback_query.first = fallback_locator
        page.get_by_text = MagicMock(return_value=fallback_query)

        agent = ReplayAgent()
        action = AgentAction(
            thought="Click post link",
            action_type="click",
            target={"role": "link", "name": "早春就让男朋友这样穿"},
        )

        await agent.execute_action(page, action)

        page.get_by_text.assert_called_with("早春就让男朋友这样穿", exact=False)
        fallback_locator.click.assert_called_once_with(timeout=5000)


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

    def test_serialize_tree_with_snapshot(self, agent):
        """Test serializing AI-native snapshot payload."""
        snapshot = AriaSnapshot(
            url="https://example.com",
            title="Example",
            dom_hash="abc123ff",
            interactive=[AriaElement(role="button", name="Search")],
            readable=[AriaElement(role="text", text="Results")],
        )
        serialized = agent._serialize_tree(snapshot)
        assert '"dom_hash":"abc123ff"' in serialized

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

    def test_normalize_action_data_maps_navigate_target_url_and_missing_thought(self, agent):
        """Test normalization for navigate action with URL in target and missing thought."""
        normalized = agent._normalize_action_data(
            {
                "action_type": "navigate",
                "target": {"url": "https://example.com"},
                "semantic_meaning": "Navigate to example",
            }
        )

        assert normalized["action_type"] == "navigate"
        assert normalized["value"] == "https://example.com"
        assert normalized["target"] is None
        assert normalized["thought"] == "Navigate to example"

    def test_normalize_action_data_maps_press_key_and_key_field(self, agent):
        """Test normalization for press_key alias and key->value mapping."""
        normalized = agent._normalize_action_data(
            {
                "action_type": "press_key",
                "target": {"role": "textbox", "name": "Search"},
                "key": "Enter",
                "progress_assessment": "Submit search",
            }
        )

        assert normalized["action_type"] == "press"
        assert normalized["value"] == "Enter"
        assert normalized["thought"] == "Submit search"

    def test_normalize_action_data_maps_element_identifier_to_target(self, agent):
        """Test normalization for element_identifier fallback."""
        normalized = agent._normalize_action_data(
            {
                "action_type": "fill",
                "element_identifier": {"role": "textbox", "name": "搜索小红书"},
                "value": "春季穿搭 男",
                "thought": "fill input",
            }
        )

        assert normalized["target"] == {"role": "textbox", "name": "搜索小红书"}
