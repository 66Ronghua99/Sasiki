"""Unit tests for ExecutionStrategy interface.

Tests cover:
- BrowserExecutionStrategy (default Path A implementation)
- ApiExecutionStrategy placeholder (Path B)
- HybridExecutionStrategy placeholder (Path B)
- Strategy factory function
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from sasiki.engine.execution_strategy import (
    BrowserExecutionStrategy,
    ApiExecutionStrategy,
    HybridExecutionStrategy,
    ExecutionContext,
    create_execution_strategy,
)
from sasiki.engine.observation_provider import ProviderObservation
from sasiki.engine.replay_models import AgentDecision, AgentTarget


class TestBrowserExecutionStrategy:
    """Tests for BrowserExecutionStrategy (Path A implementation)."""

    @pytest.fixture
    def mock_agent(self):
        """Create a mock agent for browser execution."""
        agent = AsyncMock()
        agent.execute_action = AsyncMock()
        return agent

    @pytest.fixture
    def browser_strategy(self, mock_agent):
        """Create a BrowserExecutionStrategy with mock agent."""
        return BrowserExecutionStrategy(agent=mock_agent)

    @pytest.fixture
    def mock_page(self):
        """Create a mock Playwright page."""
        page = AsyncMock()
        page.url = "https://example.com"
        page.title = AsyncMock(return_value="Test Page")
        page.evaluate = AsyncMock(return_value=[])
        return page

    @pytest.fixture
    def execution_context(self):
        """Create a sample execution context."""
        return ExecutionContext(
            stage_name="Test Stage",
            objective="Test objective",
            success_criteria="Test criteria",
            context_hints=["hint1", "hint2"],
        )

    def test_strategy_type(self, browser_strategy):
        """Test that strategy reports correct type."""
        assert browser_strategy.strategy_type == "browser"

    @pytest.mark.asyncio
    async def test_initialize(self, browser_strategy, mock_page):
        """Test initialization (noop for browser strategy)."""
        await browser_strategy.initialize(mock_page)
        # Should not raise or do anything significant

    @pytest.mark.asyncio
    async def test_observe_returns_valid_result(
        self, browser_strategy, mock_page, execution_context
    ):
        """Test observation returns valid ObservationResult."""
        result = await browser_strategy.observe(mock_page, execution_context)

        assert result.strategy_type == "browser"
        assert "url" in result.state
        assert result.state["url"] == "https://example.com"
        assert result.summary is not None
        assert isinstance(result.summary, str)
        assert result.state["provider_observation"] is not None
        assert result.state["snapshot_mode"] in {"legacy", "browser_use"}

    @pytest.mark.asyncio
    async def test_observe_uses_injected_provider(
        self, mock_agent, mock_page, execution_context
    ):
        """Test custom observation provider injection."""
        provider = AsyncMock()
        provider.observe = AsyncMock(
            return_value=ProviderObservation(
                snapshot_mode="legacy",
                url="https://injected.example",
                title="Injected",
                dom_hash="deadbeef",
                summary="Injected observation",
                llm_payload={"mock": True},
                node_map={},
                selector_map={},
                available_actions=[],
                debug_stats={"interactive_count": 0, "payload_bytes": 2},
            )
        )
        strategy = BrowserExecutionStrategy(agent=mock_agent, observation_provider=provider)

        result = await strategy.observe(mock_page, execution_context)

        provider.observe.assert_called_once_with(mock_page)
        assert result.state_hash == "deadbeef"
        assert result.state["url"] == "https://injected.example"

    @pytest.mark.asyncio
    async def test_observe_handles_mock_environment(
        self, browser_strategy, execution_context
    ):
        """Test observation handles mock pages gracefully."""
        # Mock page with AsyncMock url (simulating test environment)
        mock_page = AsyncMock()
        mock_page.url = AsyncMock(return_value="mock-url")
        mock_page.title = AsyncMock(return_value="Mock")
        mock_page.evaluate = AsyncMock(return_value=[])

        result = await browser_strategy.observe(mock_page, execution_context)

        assert result.strategy_type == "browser"
        # In mock env, state_hash should be None to disable stagnation detection
        assert result.state_hash is None

    @pytest.mark.asyncio
    async def test_execute_click_delegates_to_agent(
        self, browser_strategy, mock_page, mock_agent, execution_context
    ):
        """Test click execution delegates to agent."""
        decision = AgentDecision(
            thought="Click button",
            action_type="click",
            target=AgentTarget(role="button", name="Submit"),
        )

        result = await browser_strategy.execute(mock_page, decision, execution_context)

        assert result.success is True
        assert result.action_type == "click"
        mock_agent.execute_action.assert_called_once_with(mock_page, decision)

    @pytest.mark.asyncio
    async def test_execute_done_returns_success(
        self, browser_strategy, mock_page, execution_context
    ):
        """Test done action returns success without agent call."""
        decision = AgentDecision(
            thought="Task complete",
            action_type="done",
            evidence="Results visible",
        )

        result = await browser_strategy.execute(mock_page, decision, execution_context)

        assert result.success is True
        assert result.action_type == "done"
        assert result.metadata["evidence"] == "Results visible"

    @pytest.mark.asyncio
    async def test_execute_ask_human_returns_success(
        self, browser_strategy, mock_page, execution_context
    ):
        """Test ask_human action returns success without agent call."""
        decision = AgentDecision(
            thought="Need help",
            action_type="ask_human",
            message="Please solve captcha",
        )

        result = await browser_strategy.execute(mock_page, decision, execution_context)

        assert result.success is True
        assert result.action_type == "ask_human"
        assert result.metadata["message"] == "Please solve captcha"

    @pytest.mark.asyncio
    async def test_execute_awaits_async_url_callable(
        self, browser_strategy, execution_context
    ):
        """Test execute awaits async callable page.url in mock environments."""
        mock_page = AsyncMock()
        mock_page.url = AsyncMock(return_value="https://example.com/after")

        decision = AgentDecision(
            thought="Click button",
            action_type="click",
            target=AgentTarget(role="button", name="Submit"),
        )

        result = await browser_strategy.execute(mock_page, decision, execution_context)

        assert result.success is True
        assert result.metadata is not None
        assert result.metadata["url_after"] == "https://example.com/after"

    @pytest.mark.asyncio
    async def test_execute_handles_agent_failure(
        self, browser_strategy, mock_page, mock_agent, execution_context
    ):
        """Test execution handles agent failure gracefully."""
        mock_agent.execute_action.side_effect = Exception("Element not found")

        decision = AgentDecision(
            thought="Click button",
            action_type="click",
            target=AgentTarget(role="button", name="Missing"),
        )

        result = await browser_strategy.execute(mock_page, decision, execution_context)

        assert result.success is False
        assert "Element not found" in (result.error or "")

    @pytest.mark.asyncio
    async def test_execute_handles_no_page(
        self, browser_strategy, execution_context
    ):
        """Test execution handles None page."""
        decision = AgentDecision(
            thought="Click button",
            action_type="click",
            target=AgentTarget(role="button"),
        )

        result = await browser_strategy.execute(None, decision, execution_context)

        assert result.success is False
        assert "No page" in (result.error or "")

    @pytest.mark.asyncio
    async def test_check_completion_without_criteria(
        self, browser_strategy, mock_page
    ):
        """Test completion check without success criteria accepts any evidence."""
        decision = AgentDecision(
            thought="Done",
            action_type="done",
            message="Task finished",
        )

        is_complete, evidence = await browser_strategy.check_completion(
            mock_page, "", decision
        )

        assert is_complete is True
        assert evidence == "Task finished"

    @pytest.mark.asyncio
    async def test_check_completion_with_criteria_requires_evidence(
        self, browser_strategy, mock_page
    ):
        """Test completion check with criteria requires evidence."""
        decision = AgentDecision(
            thought="Done",
            action_type="done",
            evidence="Results are visible",
        )

        is_complete, evidence = await browser_strategy.check_completion(
            mock_page, "Results visible", decision
        )

        assert is_complete is True
        assert evidence == "Results are visible"

    @pytest.mark.asyncio
    async def test_check_completion_rejects_missing_evidence(
        self, browser_strategy, mock_page
    ):
        """Test completion check rejects done without evidence when criteria exist."""
        decision = AgentDecision(
            thought="Done",
            action_type="done",
            # No evidence or message
        )

        is_complete, evidence = await browser_strategy.check_completion(
            mock_page, "Results visible", decision
        )

        assert is_complete is False

    @pytest.mark.asyncio
    async def test_cleanup(self, browser_strategy):
        """Test cleanup (noop for browser strategy)."""
        await browser_strategy.cleanup()
        # Should not raise

    def test_last_dom_hash_property(self, browser_strategy):
        """Test last_dom_hash property."""
        # Initially None
        assert browser_strategy.last_dom_hash is None


class TestApiExecutionStrategy:
    """Tests for ApiExecutionStrategy placeholder (Path B)."""

    @pytest.fixture
    def api_strategy(self):
        """Create an ApiExecutionStrategy."""
        return ApiExecutionStrategy()

    def test_strategy_type(self, api_strategy):
        """Test that strategy reports correct type."""
        assert api_strategy.strategy_type == "api"

    @pytest.mark.asyncio
    async def test_initialize_placeholder(self, api_strategy):
        """Test initialize is a placeholder."""
        await api_strategy.initialize(None)
        # Should not raise

    @pytest.mark.asyncio
    async def test_observe_returns_placeholder(self, api_strategy):
        """Test observe returns placeholder result."""
        context = ExecutionContext(
            stage_name="Test",
            objective="Test",
            success_criteria="Test",
            context_hints=[],
        )

        result = await api_strategy.observe(None, context)

        assert result.strategy_type == "api"
        assert "not yet implemented" in result.summary.lower()

    @pytest.mark.asyncio
    async def test_execute_returns_not_implemented(self, api_strategy):
        """Test execute returns not implemented error."""
        decision = AgentDecision(
            thought="Call API",
            action_type="navigate",
        )
        context = ExecutionContext(
            stage_name="Test",
            objective="Test",
            success_criteria="Test",
            context_hints=[],
        )

        result = await api_strategy.execute(None, decision, context)

        assert result.success is False
        assert "placeholder" in (result.error or "").lower()

    @pytest.mark.asyncio
    async def test_check_completion_returns_not_implemented(self, api_strategy):
        """Test check_completion returns not implemented."""
        decision = AgentDecision(
            thought="Done",
            action_type="done",
        )

        is_complete, reason = await api_strategy.check_completion(
            None, "criteria", decision
        )

        assert is_complete is False
        assert "not yet implemented" in (reason or "").lower()


class TestHybridExecutionStrategy:
    """Tests for HybridExecutionStrategy placeholder (Path B)."""

    @pytest.fixture
    def hybrid_strategy(self):
        """Create a HybridExecutionStrategy."""
        return HybridExecutionStrategy()

    def test_strategy_type(self, hybrid_strategy):
        """Test that strategy reports correct type."""
        assert hybrid_strategy.strategy_type == "hybrid"

    @pytest.mark.asyncio
    async def test_all_methods_are_placeholders(self, hybrid_strategy):
        """Test all methods are placeholders."""
        context = ExecutionContext(
            stage_name="Test",
            objective="Test",
            success_criteria="Test",
            context_hints=[],
        )
        decision = AgentDecision(
            thought="Action",
            action_type="click",
        )

        # All should return placeholder results
        await hybrid_strategy.initialize(None)

        obs = await hybrid_strategy.observe(None, context)
        assert obs.strategy_type == "hybrid"

        exec_result = await hybrid_strategy.execute(None, decision, context)
        assert exec_result.success is False

        is_complete, _ = await hybrid_strategy.check_completion(None, "", decision)
        assert is_complete is False

        await hybrid_strategy.cleanup()


class TestCreateExecutionStrategy:
    """Tests for strategy factory function."""

    def test_create_browser_strategy(self):
        """Test factory creates BrowserExecutionStrategy."""
        strategy = create_execution_strategy("browser")
        assert isinstance(strategy, BrowserExecutionStrategy)
        assert strategy.strategy_type == "browser"

    def test_create_api_strategy(self):
        """Test factory creates ApiExecutionStrategy."""
        strategy = create_execution_strategy("api")
        assert isinstance(strategy, ApiExecutionStrategy)
        assert strategy.strategy_type == "api"

    def test_create_hybrid_strategy(self):
        """Test factory creates HybridExecutionStrategy."""
        strategy = create_execution_strategy("hybrid")
        assert isinstance(strategy, HybridExecutionStrategy)
        assert strategy.strategy_type == "hybrid"

    def test_create_unknown_strategy_raises(self):
        """Test factory raises for unknown strategy type."""
        with pytest.raises(ValueError, match="Unknown strategy type"):
            create_execution_strategy("unknown")  # type: ignore

    def test_default_strategy_is_browser(self):
        """Test default strategy is browser."""
        strategy = create_execution_strategy()
        assert isinstance(strategy, BrowserExecutionStrategy)
