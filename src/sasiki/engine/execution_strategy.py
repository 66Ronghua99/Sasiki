"""Execution Strategy Interface - Abstraction layer for different execution modes.

This module defines the ExecutionStrategy interface for Path B evolution
(browser/api/tool/hybrid). It provides:
- Abstract interface for pluggable execution strategies
- Default BrowserExecutionStrategy (Path A - current implementation)
- Placeholder strategies for future Path B expansion (API, Hybrid)

Design Principles:
- Strategy is chosen at StageExecutor initialization (default: browser)
- Current browser-first behavior is preserved unchanged
- Extension points are clearly marked for future implementation
- All strategies share the same AgentDecision/AgentAction models

Extension Points (Path B):
- Implement custom ExecutionStrategy for API-based execution
- Implement custom ExecutionStrategy for hybrid browser+API execution
- Strategy selection can be based on stage objective or workflow metadata
"""

from __future__ import annotations

import inspect
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

from sasiki.engine.observation_provider import (
    LegacyObservationProvider,
    ObservationProvider,
    create_observation_provider,
)
from sasiki.engine.replay_models import AgentDecision
from sasiki.utils.logger import get_logger

if TYPE_CHECKING:
    from playwright.async_api import Page


@dataclass
class ExecutionContext:
    """Context passed to execution strategies.

    This is a subset of StageContext focused on execution needs.
    Contains all information needed to execute a single step.
    """

    stage_name: str
    objective: str
    success_criteria: str
    context_hints: list[str]
    # World state from previous stages
    previous_world_state: str | None = None
    # Episode memory from current stage execution
    episode_log: list[dict[str, Any]] | None = None


@dataclass
class ExecutionResult:
    """Result of executing an action via any strategy.

    Unified result format across all execution strategies (browser/api/tool).
    This allows StageExecutor to handle results uniformly regardless of
    underlying execution mechanism.
    """

    success: bool
    action_type: str
    # Semantic description of what was accomplished
    semantic_result: str
    # Error message if success=False
    error: str | None = None
    # Strategy-specific metadata (e.g., API response, browser navigation info)
    metadata: dict[str, Any] | None = None
    # Updated world state summary after execution
    world_state_update: str | None = None


@dataclass
class ObservationResult:
    """Result of observing the current environment state.

    Browser: DOM snapshot, interactive elements
    API: Available endpoints, current resource state
    Hybrid: Combined browser + API state
    """

    # Strategy type that produced this observation
    strategy_type: Literal["browser", "api", "tool", "hybrid"]
    # Structured state representation (strategy-specific format)
    state: dict[str, Any]
    # Human-readable summary for LLM context
    summary: str
    # Hash for stagnation detection (strategy-specific implementation)
    state_hash: str | None = None
    # Available actions in current state
    available_actions: list[dict[str, Any]] | None = None


class ExecutionStrategy(ABC):
    """Abstract base class for execution strategies (Path B extension point).

    The ExecutionStrategy interface abstracts how AgentDecisions are executed
    and how the environment state is observed. This enables:
    - Browser automation (current Path A)
    - API-only execution (future Path B)
    - Tool-based execution (future Path B)
    - Hybrid execution (future Path B)

    Implementation Notes:
    - All methods are async to support network I/O
    - Strategies are stateless; state is passed via context
    - Strategies must handle their own cleanup in cleanup()
    - Browser strategies receive Page object; others may ignore it

    Example:
        strategy = BrowserExecutionStrategy()  # or ApiExecutionStrategy()
        await strategy.initialize(page)

        # In execution loop
        observation = await strategy.observe(page, context)
        decision = agent.decide(observation, context)
        result = await strategy.execute(page, decision, context)

        await strategy.cleanup()
    """

    def __init__(self) -> None:
        """Initialize the strategy."""
        self._logger = get_logger()

    @property
    @abstractmethod
    def strategy_type(self) -> Literal["browser", "api", "tool", "hybrid"]:
        """Return the strategy type identifier."""
        pass

    @abstractmethod
    async def initialize(self, page: Page | None = None, **kwargs: Any) -> None:
        """Initialize strategy resources.

        Args:
            page: Playwright page (for browser strategies, optional for others)
            **kwargs: Strategy-specific initialization parameters
        """
        pass

    @abstractmethod
    async def observe(
        self,
        page: Page | None,
        context: ExecutionContext,
    ) -> ObservationResult:
        """Observe the current environment state.

        Browser: Capture AriaSnapshot (DOM tree, interactive elements)
        API: Query current resource state, available endpoints
        Tool: Check tool availability and state

        Args:
            page: Playwright page (for browser strategies)
            context: Execution context

        Returns:
            ObservationResult containing structured state
        """
        pass

    @abstractmethod
    async def execute(
        self,
        page: Page | None,
        decision: AgentDecision,
        context: ExecutionContext,
    ) -> ExecutionResult:
        """Execute an AgentDecision.

        Browser: Use Playwright (get_by_role, click, fill, etc.)
        API: Make HTTP request to appropriate endpoint
        Tool: Invoke tool with parameters

        Args:
            page: Playwright page (for browser strategies)
            decision: The agent's decision to execute
            context: Execution context

        Returns:
            ExecutionResult indicating success/failure
        """
        pass

    @abstractmethod
    async def check_completion(
        self,
        page: Page | None,
        success_criteria: str,
        decision: AgentDecision | None,
    ) -> tuple[bool, str | None]:
        """Check if stage success criteria are met.

        Browser: Check DOM state, URL, visible elements
        API: Verify resource state, response data
        Tool: Check tool execution result

        Args:
            page: Playwright page (for browser strategies)
            success_criteria: The criteria to verify
            decision: The done decision (if action_type == "done")

        Returns:
            Tuple of (is_complete, evidence_or_reason)
        """
        pass

    @abstractmethod
    async def cleanup(self) -> None:
        """Clean up strategy resources.

        Called when stage execution ends (success, failure, or pause).
        """
        pass


class BrowserExecutionStrategy(ExecutionStrategy):
    """Default browser-based execution strategy (Path A implementation).

    This is the current production implementation using Playwright.
    It executes AgentDecisions by interacting with browser elements
    using accessibility role+name locators.

    Features:
    - AriaSnapshot observation (accessibility tree)
    - Playwright get_by_role() execution (via agent.execute_action)
    - DOM hash for stagnation detection
    - Evidence-based done verification

    Usage:
        strategy = BrowserExecutionStrategy(agent=agent)
        await strategy.initialize(page)
        result = await strategy.execute(page, decision, context)

    Note:
        The agent parameter is used to delegate actual browser execution
        to ReplayAgent.execute_action, maintaining compatibility with
        existing code and test mocks.
    """

    def __init__(
        self,
        dom_hash_attr: str = "data-sasiki-dom-hash",
        agent: Any | None = None,
        observation_provider: ObservationProvider | None = None,
        observation_mode: Literal["legacy", "browser_use"] = "browser_use",
        enable_compare_log: bool = False,
    ) -> None:
        """Initialize browser execution strategy.

        Args:
            dom_hash_attr: Attribute name for DOM hash tracking
            agent: Optional ReplayAgent for executing browser actions.
                  If provided, execute() delegates to agent.execute_action().
                  If None, execute() must be implemented by subclasses.
            observation_provider: Optional observation provider override.
            observation_mode: Provider mode used when observation_provider is not set.
            enable_compare_log: Whether to emit legacy-vs-new snapshot stats.
        """
        super().__init__()
        self._dom_hash_attr = dom_hash_attr
        self._agent = agent
        self._last_dom_hash: str | None = None
        self._observation_mode = observation_mode
        self._observation_provider = observation_provider or create_observation_provider(
            mode=observation_mode
        )
        self._enable_compare_log = enable_compare_log

    @property
    def strategy_type(self) -> Literal["browser", "api", "tool", "hybrid"]:
        """Return strategy type."""
        return "browser"

    @property
    def last_dom_hash(self) -> str | None:
        """Return the last captured DOM hash (for stagnation detection)."""
        return self._last_dom_hash

    async def initialize(self, page: Page | None = None, **kwargs: Any) -> None:
        """Initialize browser strategy (noop, page is managed externally)."""
        # Browser strategy doesn't need special initialization
        # The page is managed by PlaywrightEnvironment
        pass

    async def observe(
        self,
        page: Page | None,
        context: ExecutionContext,
    ) -> ObservationResult:
        """Observe browser state through the configured observation provider."""
        _ = context  # kept for interface compatibility
        if page is None:
            return ObservationResult(
                strategy_type="browser",
                state={},
                summary="No page available",
                state_hash=None,
                available_actions=[],
            )

        try:
            provider_observation = await self._observation_provider.observe(page)
            dom_hash = provider_observation.dom_hash
            self._last_dom_hash = dom_hash

            if self._enable_compare_log and self._observation_mode == "browser_use":
                try:
                    legacy_obs = await LegacyObservationProvider().observe(page)
                    self._logger.info(
                        "observation_compare",
                        legacy_mode=legacy_obs.snapshot_mode,
                        legacy_count=legacy_obs.debug_stats.get("interactive_count"),
                        legacy_payload_bytes=legacy_obs.debug_stats.get("payload_bytes"),
                        new_mode=provider_observation.snapshot_mode,
                        new_count=provider_observation.debug_stats.get("interactive_count"),
                        new_payload_bytes=provider_observation.debug_stats.get("payload_bytes"),
                    )
                except Exception as compare_error:
                    self._logger.warning(
                        "observation_compare_failed",
                        error=str(compare_error),
                    )

            # Build state representation
            state = {
                "url": provider_observation.url,
                "title": provider_observation.title,
                "dom_hash": dom_hash,
                "interactive": provider_observation.available_actions,
                "snapshot_mode": provider_observation.snapshot_mode,
                "llm_payload": provider_observation.llm_payload,
                "node_map": provider_observation.node_map,
                "selector_map": provider_observation.selector_map,
                "provider_observation": provider_observation,
                "debug_stats": provider_observation.debug_stats,
            }

            return ObservationResult(
                strategy_type="browser",
                state=state,
                summary=provider_observation.summary,
                state_hash=dom_hash,
                available_actions=provider_observation.available_actions,
            )

        except Exception as e:
            self._logger.error("browser_observation_failed", error=str(e))
            return ObservationResult(
                strategy_type="browser",
                state={"error": str(e)},
                summary=f"Failed to observe page: {e}",
                state_hash=None,
                available_actions=[],
            )

    async def execute(
        self,
        page: Page | None,
        decision: AgentDecision,
        context: ExecutionContext,
    ) -> ExecutionResult:
        """Execute a browser action using Playwright.

        If agent was provided at initialization, delegates to agent.execute_action()
        for actual browser interaction. This maintains compatibility with existing
        code and test mocks.

        Supports:
        - click: Click element by role+name
        - fill: Fill input by role+name
        - navigate: Navigate to URL
        - press: Press key
        - hover: Hover over element
        - extract_text: Extract text content
        - assert_visible: Assert element is visible

        Args:
            page: Playwright page
            decision: Agent decision to execute
            context: Execution context

        Returns:
            ExecutionResult indicating success/failure
        """
        if page is None:
            return ExecutionResult(
                success=False,
                action_type=decision.action_type,
                semantic_result="Page not available",
                error="No page provided for browser execution",
            )

        try:
            action_type = decision.action_type

            # Handle special actions that don't need page interaction
            if action_type == "done":
                return ExecutionResult(
                    success=True,
                    action_type="done",
                    semantic_result=decision.semantic_meaning or "Stage marked as complete",
                    metadata={"evidence": decision.evidence},
                )

            if action_type == "ask_human":
                return ExecutionResult(
                    success=True,
                    action_type="ask_human",
                    semantic_result=f"Requesting human assistance: {decision.message}",
                    metadata={"message": decision.message},
                )

            # Delegate actual browser execution to agent if available
            # This maintains compatibility with existing code and test mocks
            if self._agent is not None:
                await self._agent.execute_action(page, decision)
                result = f"Executed {action_type} via agent"
            else:
                # Direct Playwright execution (for future non-agent usage)
                result = await self._execute_direct(page, decision)

            # Get page URL safely (handles both real pages and mocks)
            url_after = getattr(page, "url", "")
            if callable(url_after):
                url_after = url_after()
            if inspect.isawaitable(url_after):
                url_after = await url_after

            return ExecutionResult(
                success=True,
                action_type=action_type,
                semantic_result=decision.semantic_meaning or result,
                metadata={"url_after": url_after},
            )

        except Exception as e:
            self._logger.warning(
                "browser_execution_failed",
                action_type=decision.action_type,
                error=str(e),
            )
            return ExecutionResult(
                success=False,
                action_type=decision.action_type,
                semantic_result=f"Failed to {decision.action_type}",
                error=str(e),
            )

    async def _execute_direct(self, page: Page, decision: AgentDecision) -> str:
        """Execute action directly via Playwright (without agent delegation).

        This is a fallback for when no agent is provided. In production,
        agent-based execution is preferred.

        Args:
            page: Playwright page
            decision: Agent decision to execute

        Returns:
            Human-readable result string
        """
        action_type = decision.action_type
        target = decision.target
        value = decision.value

        # Build Playwright locator from semantic target
        locator = self._build_locator(page, target)

        if action_type == "click":
            await locator.click()
            return f"Clicked {self._describe_target(target)}"

        elif action_type == "fill":
            await locator.fill(value or "")
            return f"Filled {self._describe_target(target)} with '{value}'"

        elif action_type == "navigate":
            await page.goto(value or "about:blank")
            return f"Navigated to {value}"

        elif action_type == "press":
            await locator.press(value or "Enter")
            return f"Pressed {value} on {self._describe_target(target)}"

        elif action_type == "hover":
            await locator.hover()
            return f"Hovered over {self._describe_target(target)}"

        elif action_type == "extract_text":
            text = await locator.text_content()
            return f"Extracted text: {text[:100] if text else 'N/A'}"

        elif action_type == "assert_visible":
            await locator.wait_for(state="visible", timeout=5000)
            return f"Confirmed {self._describe_target(target)} is visible"

        else:
            raise ValueError(f"Unsupported action type: {action_type}")

    async def check_completion(
        self,
        page: Page | None,
        success_criteria: str,
        decision: AgentDecision | None,
    ) -> tuple[bool, str | None]:
        """Check if success criteria are met (browser implementation).

        Browser strategy uses a permissive approach:
        - If no success_criteria, any done action is accepted
        - Evidence can be from decision.evidence or decision.message
        - Detailed verification is delegated to StageVerifier

        Args:
            page: Playwright page (unused in browser implementation)
            success_criteria: Criteria string to verify
            decision: The done decision with evidence

        Returns:
            (is_verified, evidence_or_reason)
        """
        # Browser strategy uses permissive completion checking
        # Detailed validation is done by StageVerifier
        if decision is None:
            return False, "No decision provided"

        if decision.action_type != "done":
            return False, "Not a done action"

        # Extract evidence (same logic as StageVerifier)
        evidence = decision.evidence or decision.message

        # If no success criteria defined, accept any done with evidence/message
        if not success_criteria or not success_criteria.strip():
            return True, evidence or "Stage completed"

        # With criteria, we need evidence to verify
        if not evidence:
            return False, "No evidence provided for success criteria"

        # Basic verification - let StageVerifier do detailed matching
        return True, evidence

    async def cleanup(self) -> None:
        """Cleanup browser strategy (noop, page managed externally)."""
        # Browser strategy doesn't own page lifecycle
        # PlaywrightEnvironment handles cleanup
        pass

    def _build_locator(self, page: Page, target: Any | None) -> Any:
        """Build Playwright locator from semantic target.

        Args:
            page: Playwright page
            target: AgentTarget or dict with role/name

        Returns:
            Playwright locator
        """
        if target is None:
            # Return page body as default locator
            return page.locator("body")

        # Handle AgentTarget model or dict
        role = getattr(target, "role", None) or target.get("role") if isinstance(target, dict) else target.role
        name = getattr(target, "name", None) or target.get("name") if isinstance(target, dict) else target.name

        if role:
            if name:
                return page.get_by_role(role, name=name)
            return page.get_by_role(role)

        # Fallback to body if no valid target
        return page.locator("body")

    def _describe_target(self, target: Any | None) -> str:
        """Build human-readable target description.

        Args:
            target: AgentTarget or dict

        Returns:
            Human-readable string
        """
        if target is None:
            return "page body"

        role = getattr(target, "role", None) or target.get("role") if isinstance(target, dict) else target.role
        name = getattr(target, "name", None) or target.get("name") if isinstance(target, dict) else target.name

        if role and name:
            return f"{role} '{name}'"
        elif role:
            return str(role)
        return "element"


class ApiExecutionStrategy(ExecutionStrategy):
    """API-based execution strategy placeholder (Path B future).

    This is a placeholder implementation for API-only execution.
    When a workflow stage can be fulfilled via API (e.g., "search XHS"
    becomes a direct API call instead of browser automation), this
    strategy would execute API requests instead of browser actions.

    Future Implementation:
    - Map stage objectives to API endpoints
    - Handle authentication (tokens, API keys)
    - Transform AgentDecision into API requests
    - Parse API responses into structured observations
    - Support pagination, rate limiting, error handling

    Extension Point:
    To implement API execution, override all abstract methods with
    actual HTTP client logic (httpx, aiohttp, etc.).
    """

    @property
    def strategy_type(self) -> Literal["browser", "api", "tool", "hybrid"]:
        """Return strategy type."""
        return "api"

    async def initialize(self, page: Page | None = None, **kwargs: Any) -> None:
        """Initialize API client."""
        # Placeholder: Initialize HTTP session, load API credentials
        self._logger.info("api_strategy_initialize_placeholder")

    async def observe(
        self,
        page: Page | None,
        context: ExecutionContext,
    ) -> ObservationResult:
        """Observe API state (placeholder)."""
        # Placeholder: Query API state, available endpoints
        return ObservationResult(
            strategy_type="api",
            state={"status": "placeholder"},
            summary="API observation not yet implemented",
            state_hash="api-placeholder",
            available_actions=[],
        )

    async def execute(
        self,
        page: Page | None,
        decision: AgentDecision,
        context: ExecutionContext,
    ) -> ExecutionResult:
        """Execute API request (placeholder)."""
        # Placeholder: Map decision to API call
        return ExecutionResult(
            success=False,
            action_type=decision.action_type,
            semantic_result="API execution not yet implemented",
            error="ApiExecutionStrategy is a placeholder",
        )

    async def check_completion(
        self,
        page: Page | None,
        success_criteria: str,
        decision: AgentDecision | None,
    ) -> tuple[bool, str | None]:
        """Check API completion (placeholder)."""
        return False, "API completion check not yet implemented"

    async def cleanup(self) -> None:
        """Cleanup API resources."""
        # Placeholder: Close HTTP session
        pass


class HybridExecutionStrategy(ExecutionStrategy):
    """Hybrid browser+API execution strategy placeholder (Path B future).

    This is a placeholder for hybrid execution that combines browser
    and API strategies. Some steps use browser (e.g., authentication,
    complex UI interactions), others use API (e.g., bulk data retrieval).

    Future Implementation:
    - Maintain both browser page and API client
    - Switch between strategies based on action type
    - Coordinate state between browser and API contexts
    - Handle authentication flow across both

    Extension Point:
    To implement hybrid execution, compose BrowserExecutionStrategy
    and ApiExecutionStrategy, delegating actions to the appropriate
    sub-strategy based on context or decision metadata.
    """

    @property
    def strategy_type(self) -> Literal["browser", "api", "tool", "hybrid"]:
        """Return strategy type."""
        return "hybrid"

    async def initialize(self, page: Page | None = None, **kwargs: Any) -> None:
        """Initialize hybrid resources."""
        # Placeholder: Initialize both browser and API strategies
        self._logger.info("hybrid_strategy_initialize_placeholder")

    async def observe(
        self,
        page: Page | None,
        context: ExecutionContext,
    ) -> ObservationResult:
        """Observe hybrid state (placeholder)."""
        # Placeholder: Combine browser and API observations
        return ObservationResult(
            strategy_type="hybrid",
            state={"browser": {}, "api": {}} ,
            summary="Hybrid observation not yet implemented",
            state_hash="hybrid-placeholder",
            available_actions=[],
        )

    async def execute(
        self,
        page: Page | None,
        decision: AgentDecision,
        context: ExecutionContext,
    ) -> ExecutionResult:
        """Execute hybrid action (placeholder)."""
        # Placeholder: Route to browser or API based on decision metadata
        return ExecutionResult(
            success=False,
            action_type=decision.action_type,
            semantic_result="Hybrid execution not yet implemented",
            error="HybridExecutionStrategy is a placeholder",
        )

    async def check_completion(
        self,
        page: Page | None,
        success_criteria: str,
        decision: AgentDecision | None,
    ) -> tuple[bool, str | None]:
        """Check hybrid completion (placeholder)."""
        return False, "Hybrid completion check not yet implemented"

    async def cleanup(self) -> None:
        """Cleanup hybrid resources."""
        # Placeholder: Cleanup both strategies
        pass


def create_execution_strategy(
    strategy_type: Literal["browser", "api", "hybrid"] = "browser",
) -> ExecutionStrategy:
    """Factory function to create execution strategies.

    Args:
        strategy_type: Type of strategy to create

    Returns:
        Configured ExecutionStrategy instance

    Raises:
        ValueError: If strategy_type is unknown

    Example:
        strategy = create_execution_strategy("browser")
        await strategy.initialize(page)
    """
    if strategy_type == "browser":
        return BrowserExecutionStrategy()
    elif strategy_type == "api":
        return ApiExecutionStrategy()
    elif strategy_type == "hybrid":
        return HybridExecutionStrategy()
    else:
        raise ValueError(f"Unknown strategy type: {strategy_type}")
