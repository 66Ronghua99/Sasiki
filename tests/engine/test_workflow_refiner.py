"""Unit tests for WorkflowRefiner.

These tests fully mock external dependencies (browser, LLM) to ensure
fast, deterministic testing without network or UI dependencies.
"""

import json
import pytest
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, mock_open
from uuid import uuid4

from sasiki.engine.workflow_refiner import WorkflowRefiner
from sasiki.engine.refiner_state import StageResult, RefineResult
from sasiki.engine.replay_models import AgentAction
from sasiki.engine.handlers.auto import NonInteractiveHandler
from sasiki.workflow.models import Workflow, WorkflowStage, WorkflowVariable, VariableType


@pytest.fixture
def mock_playwright_env():
    """Create a mocked PlaywrightEnvironment."""
    with patch("sasiki.engine.workflow_refiner.PlaywrightEnvironment") as MockEnv:
        mock_env = MagicMock()
        mock_page = AsyncMock()
        mock_env.start = AsyncMock(return_value=mock_page)
        mock_env.stop = AsyncMock()
        MockEnv.return_value = mock_env
        yield mock_env, mock_page


@pytest.fixture
def mock_replay_agent():
    """Create a mocked ReplayAgent."""
    with patch("sasiki.engine.workflow_refiner.ReplayAgent") as MockAgent:
        mock_agent = MagicMock()
        mock_agent.step = AsyncMock()
        mock_agent.step_with_context = AsyncMock()
        mock_agent.execute_action = AsyncMock()
        MockAgent.return_value = mock_agent
        yield mock_agent


@pytest.fixture
def mock_storage(tmp_path):
    """Create a mocked WorkflowStorage."""
    with patch("sasiki.workflow.final_workflow_writer.WorkflowStorage") as MockStorage:
        mock_storage = MagicMock()
        mock_storage.base_dir = tmp_path / ".sasiki" / "workflows"
        mock_storage.base_dir.mkdir(parents=True, exist_ok=True)
        MockStorage.return_value = mock_storage
        yield mock_storage


@pytest.fixture
def non_interactive_handler():
    """Create a NonInteractiveHandler for testing."""
    return NonInteractiveHandler()


@pytest.fixture
def sample_workflow():
    """Create a sample workflow for testing."""
    return Workflow(
        id=uuid4(),
        name="Test Workflow",
        description="A test workflow",
        stages=[
            WorkflowStage(
                name="Search",
                description="Search for something",
                application="Chrome",
                actions=["Click search box", "Type {{query}}", "Press Enter"],
            ),
            WorkflowStage(
                name="Review",
                description="Review results",
                application="Chrome",
                actions=["Scroll down", "Click first result"],
            ),
        ],
        variables=[
            WorkflowVariable(
                name="query",
                description="Search query",
                var_type=VariableType.TEXT,
                required=True,
            )
        ],
    )


@pytest.fixture
def sample_workflow_with_checkpoint():
    """Create a sample workflow with checkpoints."""
    from sasiki.workflow.models import Checkpoint

    return Workflow(
        id=uuid4(),
        name="Workflow with Checkpoint",
        description="Has a checkpoint after stage 1",
        stages=[
            WorkflowStage(
                name="Stage1",
                actions=["Action 1"],
            ),
            WorkflowStage(
                name="Stage2",
                actions=["Action 2"],
            ),
        ],
        checkpoints=[
            Checkpoint(
                after_stage=0,
                description="Verify first stage completed",
                manual_confirmation=True,
            )
        ],
    )


class TestStageResult:
    """Tests for StageResult model."""

    def test_stage_result_creation(self):
        """Test creating a StageResult."""
        result = StageResult(
            stage_name="Test Stage",
            status="success",
            steps_taken=3,
            actions=[],
        )
        assert result.stage_name == "Test Stage"
        assert result.status == "success"
        assert result.steps_taken == 3
        assert result.episode_log == []
        assert result.verified is False
        assert result.verification_evidence is None
        assert result.error is None

    def test_stage_result_with_error(self):
        """Test creating a StageResult with an error."""
        result = StageResult(
            stage_name="Failed Stage",
            status="failed",
            steps_taken=1,
            actions=[],
            error="Something went wrong",
        )
        assert result.status == "failed"
        assert result.episode_log == []
        assert result.verified is False
        assert result.verification_evidence is None
        assert result.error == "Something went wrong"


class TestRefineResult:
    """Tests for RefineResult model."""

    def test_refine_result_creation(self):
        """Test creating a RefineResult."""
        result = RefineResult(
            workflow_id="test-id",
            workflow_name="Test",
            status="completed",
            stage_results=[],
            total_steps=0,
        )
        assert result.workflow_id == "test-id"
        assert result.status == "completed"
        assert result.final_workflow_path is None


class TestWorkflowRefinerInit:
    """Tests for WorkflowRefiner initialization."""

    def test_default_initialization(self):
        """Test default initialization."""
        with patch("sasiki.engine.workflow_refiner.PlaywrightEnvironment") as MockEnv:
            refiner = WorkflowRefiner()
            assert refiner.max_steps_per_stage == 20
            assert refiner.enable_checkpoints is True
            MockEnv.assert_called_once_with(
                cdp_url=None,
                user_data_dir=None,
                headless=False,
                auto_load_cookies=True,
                cookies_dir=None,
            )

    def test_custom_initialization(self):
        """Test initialization with custom parameters."""
        with patch("sasiki.engine.workflow_refiner.PlaywrightEnvironment") as MockEnv:
            refiner = WorkflowRefiner(
                headless=True,
                cdp_url="http://localhost:9222",
                user_data_dir="/tmp/chrome",
                max_steps_per_stage=50,
                enable_checkpoints=False,
            )
            assert refiner.max_steps_per_stage == 50
            assert refiner.enable_checkpoints is False
            MockEnv.assert_called_once_with(
                cdp_url="http://localhost:9222",
                user_data_dir="/tmp/chrome",
                headless=True,
                auto_load_cookies=True,
                cookies_dir=None,
            )


class TestSingleStageExecution:
    """Tests for single stage execution scenarios."""

    @pytest.mark.asyncio
    @patch("builtins.open", mock_open())
    @patch("sasiki.workflow.final_workflow_writer.to_yaml_file")
    async def test_single_stage_single_step_done(
        self, mock_to_yaml, mock_playwright_env, mock_replay_agent, sample_workflow, mock_storage
    ):
        """Test a single stage that completes in one step with 'done' action."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        # Mock agent to return done immediately
        mock_agent.step.return_value = AgentAction(
            thought="Task complete",
            action_type="done",
            message="Finished search",
        )

        refiner = WorkflowRefiner()
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "python"},
        )

        assert result.status == "completed"
        assert len(result.stage_results) == 2  # Both stages
        assert result.stage_results[0].status == "success"
        assert result.stage_results[0].steps_taken == 1
        assert result.total_steps == 2  # One step per stage

    @pytest.mark.asyncio
    @patch("builtins.open", mock_open())
    @patch("sasiki.workflow.final_workflow_writer.to_yaml_file")
    async def test_single_stage_multiple_steps_then_done(
        self, mock_to_yaml, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test a stage that takes multiple steps before completing."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        # Mock agent to return a sequence of actions
        mock_agent.step.side_effect = [
            AgentAction(
                thought="Clicking search box",
                action_type="click",
                target_id=1,
            ),
            AgentAction(
                thought="Typing query",
                action_type="fill",
                target_id=1,
                value="python",
            ),
            AgentAction(
                thought="Pressing enter",
                action_type="press",
                value="Enter",
            ),
            AgentAction(
                thought="Done with stage",
                action_type="done",
            ),
            # Second stage
            AgentAction(
                thought="Done with stage 2",
                action_type="done",
            ),
        ]

        refiner = WorkflowRefiner()
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "python"},
        )

        assert result.status == "completed"
        assert result.stage_results[0].steps_taken == 4
        assert result.stage_results[0].status == "success"
        assert len(result.stage_results[0].actions) == 4
        assert len(result.stage_results[0].episode_log) == 4
        assert result.stage_results[0].episode_log[0].action_type == "click"
        assert result.stage_results[0].episode_log[0].semantic_meaning == "click on node_id:1"
        assert result.stage_results[0].episode_log[0].progress_assessment == "Step 1: success"
        assert result.stage_results[0].episode_log[-1].action_type == "done"
        assert result.stage_results[0].episode_log[-1].progress_assessment == "Stage objective achieved"

    @pytest.mark.asyncio
    @patch("builtins.open", mock_open())
    @patch("sasiki.workflow.final_workflow_writer.to_yaml_file")
    async def test_episode_memory_keeps_semantic_fields(
        self, mock_to_yaml, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test episode memory captures semantic narrative fields."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        mock_agent.step.side_effect = [
            AgentAction(
                thought="Focusing search",
                action_type="click",
                target_id=1,
                semantic_meaning="Focus the search input",
                progress_assessment="Stage started",
            ),
            AgentAction(
                thought="Done",
                action_type="done",
                semantic_meaning="Search flow completed",
                progress_assessment="Stage objective achieved",
            ),
            AgentAction(
                thought="Done stage 2",
                action_type="done",
            ),
        ]

        refiner = WorkflowRefiner()
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "python"},
        )

        log = result.stage_results[0].episode_log
        assert len(log) == 2
        assert log[0].semantic_meaning == "Focus the search input"
        assert log[0].progress_assessment == "Stage started"
        assert log[1].progress_assessment == "Stage objective achieved"


class TestStageVerifier:
    """Tests for evidence-based done verification."""

    @pytest.mark.asyncio
    @patch("builtins.open", mock_open())
    @patch("sasiki.workflow.final_workflow_writer.to_yaml_file")
    async def test_done_with_matching_evidence_is_verified(
        self, mock_to_yaml, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test done action succeeds when evidence matches success criteria."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent
        workflow = sample_workflow.model_copy(deep=True)
        workflow.stages[0].success_criteria = "Results list is visible"

        mock_agent.step.side_effect = [
            AgentAction(
                thought="Search completed",
                action_type="done",
                evidence="Results list is visible with 10 cards",
            ),
            AgentAction(thought="Stage 2 done", action_type="done"),
        ]

        refiner = WorkflowRefiner()
        result = await refiner.run(
            workflow=workflow,
            inputs={"query": "python"},
        )

        assert result.stage_results[0].status == "success"
        assert result.stage_results[0].verified is True
        assert result.stage_results[0].verification_evidence == "Results list is visible with 10 cards"

    @pytest.mark.asyncio
    @patch("builtins.open", mock_open())
    @patch("sasiki.workflow.final_workflow_writer.to_yaml_file")
    async def test_done_with_mismatched_evidence_fails_stage(
        self, mock_to_yaml, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test done action fails when evidence does not satisfy success criteria."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent
        workflow = sample_workflow.model_copy(deep=True)
        workflow.stages[0].success_criteria = "Results list is visible"

        mock_agent.step.side_effect = [
            AgentAction(
                thought="I think done",
                action_type="done",
                evidence="Clicked search button only",
            ),
        ]

        refiner = WorkflowRefiner()
        result = await refiner.run(
            workflow=workflow,
            inputs={"query": "python"},
        )

        assert result.status == "failed"
        assert result.stage_results[0].status == "failed"
        assert result.stage_results[0].verified is False
        assert result.stage_results[0].verification_evidence == "Clicked search button only"
        assert "StageVerifier" in (result.stage_results[0].error or "")
        assert result.stage_results[1].status == "skipped"


class TestMultipleStages:
    """Tests for multi-stage execution."""

    @pytest.mark.asyncio
    @patch("builtins.open", mock_open())
    @patch("sasiki.workflow.final_workflow_writer.to_yaml_file")
    async def test_multiple_stages_sequential(
        self, mock_to_yaml, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test that stages execute sequentially."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        # Each stage takes one step
        mock_agent.step.side_effect = [
            AgentAction(thought="Stage 1 done", action_type="done"),
            AgentAction(thought="Stage 2 done", action_type="done"),
        ]

        refiner = WorkflowRefiner()
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "python"},
        )

        assert result.status == "completed"
        assert len(result.stage_results) == 2
        assert result.stage_results[0].stage_name == "Search"
        assert result.stage_results[0].status == "success"
        assert result.stage_results[1].stage_name == "Review"
        assert result.stage_results[1].status == "success"
        assert result.total_steps == 2

    @pytest.mark.asyncio
    async def test_stage_failure_stops_execution(
        self, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test that stage failure stops subsequent stages."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        # First stage fails (max steps), second stage never runs
        # Use different target_ids to avoid repetition detection
        actions = []
        for i in range(20):
            actions.append(
                AgentAction(
                    thought=f"Step {i}",
                    action_type="click",
                    target_id=i,  # Different target each time to avoid repetition detection
                )
            )

        mock_agent.step.side_effect = actions

        refiner = WorkflowRefiner(max_steps_per_stage=5)
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "python"},
        )

        assert result.status == "failed"
        assert result.stage_results[0].status == "failed"
        assert result.stage_results[0].error is not None
        assert "Maximum steps" in result.stage_results[0].error
        # Second stage should be skipped
        assert len(result.stage_results) == 2
        assert result.stage_results[1].status == "skipped"


class TestMaxStepsProtection:
    """Tests for max steps protection."""

    @pytest.mark.asyncio
    async def test_max_steps_protection(
        self, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test that max_steps_per_stage is enforced."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        # Agent keeps returning click actions without done
        mock_agent.step.return_value = AgentAction(
            thought="Still clicking",
            action_type="click",
            target_id=1,
        )

        refiner = WorkflowRefiner(max_steps_per_stage=3)
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "test"},
        )

        assert result.status == "failed"
        assert result.stage_results[0].steps_taken == 3
        assert result.stage_results[0].status == "failed"
        assert "Maximum steps" in result.stage_results[0].error


class TestCheckpointHandling:
    """Tests for checkpoint handling."""

    @pytest.mark.asyncio
    @patch("builtins.open", mock_open())
    @patch("sasiki.workflow.final_workflow_writer.to_yaml_file")
    @patch("sasiki.engine.checkpoint_coordinator.CheckpointCoordinator.handle_checkpoint")
    async def test_checkpoint_pause(
        self, mock_handle_cp, mock_to_yaml, mock_playwright_env, mock_replay_agent, sample_workflow_with_checkpoint
    ):
        """Test that checkpoint pauses execution."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        # Both stages would succeed but checkpoint after stage 1 pauses
        mock_agent.step.side_effect = [
            AgentAction(thought="Stage 1 done", action_type="done"),
            AgentAction(thought="Stage 2 done", action_type="done"),
        ]

        # Mock handle_checkpoint to return (should_continue=False, should_repeat=False)
        mock_handle_cp.return_value = (False, False)

        refiner = WorkflowRefiner(enable_checkpoints=True)
        result = await refiner.run(
            workflow=sample_workflow_with_checkpoint,
            inputs={},
        )

        assert result.status == "paused"
        assert result.stage_results[0].status == "success"
        assert result.stage_results[1].status == "skipped"
        mock_handle_cp.assert_called_once()

    @pytest.mark.asyncio
    @patch("builtins.open", mock_open())
    @patch("sasiki.workflow.final_workflow_writer.to_yaml_file")
    @patch("sasiki.engine.checkpoint_coordinator.CheckpointCoordinator.handle_checkpoint")
    async def test_checkpoint_skip_when_disabled(
        self, mock_handle_cp, mock_to_yaml, mock_playwright_env, mock_replay_agent, sample_workflow_with_checkpoint
    ):
        """Test that checkpoints are skipped when disabled."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        mock_agent.step.side_effect = [
            AgentAction(thought="Stage 1 done", action_type="done"),
            AgentAction(thought="Stage 2 done", action_type="done"),
        ]

        refiner = WorkflowRefiner(enable_checkpoints=False)
        mock_handle_cp.return_value = (True, False)

        result = await refiner.run(
            workflow=sample_workflow_with_checkpoint,
            inputs={},
        )

        assert result.status == "completed"
        # Checkpoint handler should not be called when disabled
        mock_handle_cp.assert_not_called()


class TestRetryLogic:
    """Tests for step retry logic."""

    @pytest.mark.asyncio
    @patch("builtins.open", mock_open())
    @patch("sasiki.workflow.final_workflow_writer.to_yaml_file")
    async def test_step_exception_retry(
        self, mock_to_yaml, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test that a failed step is retried with context."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        # First call fails (step), retry succeeds (step_with_context)
        mock_agent.step.side_effect = Exception("Network error")
        mock_agent.step_with_context.return_value = AgentAction(
            thought="Success after retry", action_type="done"
        )

        refiner = WorkflowRefiner()
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "test"},
        )

        assert result.status == "completed"
        # step_with_context should have been called for retry
        assert mock_agent.step_with_context.call_count >= 1

    @pytest.mark.asyncio
    async def test_step_exception_second_retry_succeeds(
        self, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test multi-level retry succeeds on second retry attempt."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        mock_agent.step.side_effect = [
            Exception("Initial failure"),
            AgentAction(thought="Stage 2 done", action_type="done"),
        ]
        mock_agent.step_with_context.side_effect = [
            Exception("Retry level 1 failed"),
            AgentAction(thought="Recovered on L2", action_type="done"),
        ]

        refiner = WorkflowRefiner()
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "test"},
        )

        assert result.status == "completed"
        assert mock_agent.step_with_context.call_count == 2
        first_ctx = mock_agent.step_with_context.call_args_list[0].kwargs["retry_context"]
        second_ctx = mock_agent.step_with_context.call_args_list[1].kwargs["retry_context"]
        assert first_ctx.attempt_number == 2
        assert second_ctx.attempt_number == 3
        assert second_ctx.max_attempts == 3

    @pytest.mark.asyncio
    async def test_step_exception_double_failure(
        self, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test that double failure (initial + retry) marks stage as failed."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        # Both initial call (step) and retry (step_with_context) fail
        mock_agent.step.side_effect = Exception("Persistent error")
        mock_agent.step_with_context.side_effect = Exception("Retry also failed")

        refiner = WorkflowRefiner()
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "test"},
        )

        assert result.status == "failed"
        assert result.stage_results[0].status == "failed"
        assert "retry" in result.stage_results[0].error.lower()


class TestVariableSubstitution:
    """Tests for variable substitution in stage goals."""

    @pytest.mark.asyncio
    @patch("builtins.open", mock_open())
    @patch("sasiki.workflow.final_workflow_writer.to_yaml_file")
    async def test_variable_substitution_passed_to_goal(
        self, mock_to_yaml, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test that variables are substituted in execution plan."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        mock_agent.step.return_value = AgentAction(
            thought="Done",
            action_type="done",
        )

        refiner = WorkflowRefiner()
        await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "python programming"},
        )

        # Check that the agent was called with a goal containing the substituted value
        calls = mock_agent.step.call_args_list
        found_substitution = False
        for call in calls:
            goal = call[0][1]  # Second positional argument is goal
            # The goal should not contain the placeholder
            assert "{{query}}" not in goal
            # The goal should contain the resolved value (in the action list of the first stage)
            if "python programming" in goal:
                found_substitution = True
        assert found_substitution, "Variable substitution not found in any goal"


class TestSaveFinalWorkflow:
    """Tests for saving final workflow."""

    @pytest.mark.asyncio
    @patch("builtins.open", mock_open())
    @patch("sasiki.workflow.final_workflow_writer.to_yaml_file")
    async def test_save_final_workflow(
        self, mock_to_yaml, mock_playwright_env, mock_replay_agent, sample_workflow, tmp_path
    ):
        """Test that final workflow is saved with correct suffix."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        mock_agent.step.return_value = AgentAction(
            thought="Done",
            action_type="done",
        )

        with patch("sasiki.workflow.final_workflow_writer.WorkflowStorage") as MockStorage:
            mock_storage = MagicMock()
            mock_storage.base_dir = tmp_path / ".sasiki" / "workflows"
            mock_storage.base_dir.mkdir(parents=True, exist_ok=True)
            MockStorage.return_value = mock_storage

            refiner = WorkflowRefiner()
            result = await refiner.run(
                workflow=sample_workflow,
                inputs={"query": "test"},
                output_suffix="validated",
            )

            assert result.final_workflow_path is not None
            mock_to_yaml.assert_called_once()
            # Check that the path contains the suffix
            call_args = mock_to_yaml.call_args
            assert "validated" in str(call_args[0][0])

    @pytest.mark.asyncio
    async def test_no_save_on_failure(
        self, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test that final workflow is not saved on failure."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        # Cause a failure
        mock_agent.step.side_effect = Exception("Fatal error")

        with patch("sasiki.workflow.final_workflow_writer.WorkflowStorage") as MockStorage:
            mock_storage = MagicMock()
            MockStorage.return_value = mock_storage

            refiner = WorkflowRefiner()
            result = await refiner.run(
                workflow=sample_workflow,
                inputs={"query": "test"},
            )

            assert result.status == "failed"
            assert result.final_workflow_path is None


class TestStartStage:
    """Tests for starting from a specific stage."""

    @pytest.mark.asyncio
    @patch("builtins.open", mock_open())
    @patch("sasiki.workflow.final_workflow_writer.to_yaml_file")
    async def test_start_from_specific_stage(
        self, mock_to_yaml, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test that start_stage parameter skips earlier stages."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        mock_agent.step.return_value = AgentAction(
            thought="Done",
            action_type="done",
        )

        refiner = WorkflowRefiner()
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "test"},
            start_stage=1,  # Start from second stage
        )

        assert result.status == "completed"
        assert result.stage_results[0].status == "skipped"
        assert result.stage_results[1].status == "success"


class TestActionRepetitionDetection:
    """Tests for detecting repetitive action patterns."""

    @pytest.mark.asyncio
    async def test_repeated_action_detection(
        self, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test that repeating the same action 3+ times fails the stage."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        # Agent keeps clicking the same element
        mock_agent.step.return_value = AgentAction(
            thought="Clicking same element",
            action_type="click",
            target_id=42,
        )

        refiner = WorkflowRefiner(max_steps_per_stage=10)
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "test"},
        )

        assert result.status == "failed"
        assert result.stage_results[0].status == "failed"
        assert "repetition" in result.stage_results[0].error.lower()

    @pytest.mark.asyncio
    async def test_different_actions_not_detected_as_repetition(
        self, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test that different actions don't trigger repetition detection."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        # Agent clicks different elements
        click_count = [0]
        async def different_clicks(*args, **kwargs):
            click_count[0] += 1
            return AgentAction(
                thought=f"Click {click_count[0]}",
                action_type="click",
                target_id=click_count[0],  # Different target each time
            )

        mock_agent.step.side_effect = different_clicks

        refiner = WorkflowRefiner(max_steps_per_stage=5)
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "test"},
        )

        # Should fail due to max steps, not repetition
        assert result.status == "failed"
        assert "repetition" not in result.stage_results[0].error.lower()
        assert "Maximum steps" in result.stage_results[0].error

    @pytest.mark.asyncio
    async def test_dom_hash_stagnation_detection(
        self, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test unchanged dom_hash triggers stagnation failure."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        click_count = [0]

        async def stagnant_dom(*args, **kwargs):
            click_count[0] += 1
            mock_agent.last_dom_hash = "samehash"
            return AgentAction(
                thought=f"Click {click_count[0]}",
                action_type="click",
                target_id=click_count[0],  # avoid repetition detection
            )

        mock_agent.step.side_effect = stagnant_dom

        refiner = WorkflowRefiner(max_steps_per_stage=10)
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "test"},
        )

        assert result.status == "failed"
        assert "stagnation" in result.stage_results[0].error.lower()


class TestAskHumanPause:
    """Tests for ask_human action type."""

    @pytest.mark.asyncio
    @patch("builtins.open", mock_open())
    @patch("sasiki.workflow.final_workflow_writer.to_yaml_file")
    async def test_ask_human_pauses_stage(
        self, mock_to_yaml, mock_playwright_env, mock_replay_agent, sample_workflow
    ):
        """Test that ask_human action pauses the stage."""
        mock_env, mock_page = mock_playwright_env
        mock_agent = mock_replay_agent

        # First stage returns ask_human, second stage would return done
        mock_agent.step.side_effect = [
            AgentAction(
                thought="Need human help",
                action_type="ask_human",
                message="Please solve the captcha",
            ),
            # This second one should never be called since first stage pauses
            AgentAction(thought="Stage 2 done", action_type="done"),
        ]

        refiner = WorkflowRefiner()
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={"query": "test"},
        )

        # The entire workflow is paused, second stage is skipped
        assert result.status == "paused"
        assert result.stage_results[0].status == "paused"
        assert result.stage_results[1].status == "skipped"


class TestExecutionPlanErrors:
    """Tests for execution plan creation errors."""

    @pytest.mark.asyncio
    async def test_invalid_inputs_returns_failed_result(
        self, mock_playwright_env, sample_workflow
    ):
        """Test that invalid inputs return a failed RefineResult."""
        mock_env, mock_page = mock_playwright_env

        refiner = WorkflowRefiner()
        # Missing required "query" variable
        result = await refiner.run(
            workflow=sample_workflow,
            inputs={},
        )

        assert result.status == "failed"
        assert result.error is not None
        assert "Invalid inputs" in result.error


class TestBuildStageGoal:
    """Tests for _build_stage_goal method."""

    def test_build_stage_goal_basic(self):
        """Test basic goal building."""
        from sasiki.engine.stage_executor import StageExecutor

        executor = StageExecutor(agent=None)  # type: ignore
        stage = {
            "name": "Test Stage",
            "application": "Chrome",
            "actions": ["Click button", "Type text"],
        }
        history: list[str] = []

        goal = executor._build_stage_goal(stage, history)

        assert "Test Stage" in goal
        assert "Chrome" in goal
        assert "Click button" in goal
        assert "Type text" in goal

    def test_build_stage_goal_with_history(self):
        """Test goal building with history."""
        from sasiki.engine.stage_executor import StageExecutor

        executor = StageExecutor(agent=None)  # type: ignore
        history = ["Step 1 thought", "Step 2 thought"]

        stage = {
            "name": "Test Stage",
            "actions": ["Action 1"],
        }

        goal = executor._build_stage_goal(stage, history)

        assert "Recent progress" in goal
        assert "Step 1 thought" in goal
        assert "Step 2 thought" in goal

    def test_build_stage_goal_with_action_details(self):
        """Test goal building prefers action_details over actions."""
        from sasiki.engine.stage_executor import StageExecutor

        executor = StageExecutor(agent=None)  # type: ignore
        stage = {
            "name": "Test Stage",
            "application": "Chrome",
            "actions": ["Click button", "Type text"],
            "action_details": [
                {
                    "action_type": "click",
                    "target_hint": "submit-button",
                    "page_context": {"url": "https://example.com"},
                },
                {
                    "action_type": "fill",
                    "target_hint": "search-input",
                    "value": "test query",
                },
            ],
        }
        history: list[str] = []

        goal = executor._build_stage_goal(stage, history)

        assert "Test Stage" in goal
        assert "Chrome" in goal
        # Should use structured action details
        assert "Structured actions" in goal
        assert "click on submit-button" in goal
        assert "fill on search-input" in goal
        assert "Page: https://example.com" in goal

    def test_build_stage_goal_prefers_action_details(self):
        """Test that action_details are preferred over text actions."""
        from sasiki.engine.stage_executor import StageExecutor

        executor = StageExecutor(agent=None)  # type: ignore
        stage = {
            "name": "Test Stage",
            "actions": ["Old text action"],
            "action_details": [
                {"action_type": "click", "target_hint": "new-button"},
            ],
        }
        history: list[str] = []

        goal = executor._build_stage_goal(stage, history)

        # Should use action_details, not fall back to actions
        assert "Structured actions" in goal
        assert "click on new-button" in goal
        assert "Old text action" not in goal

    def test_build_stage_goal_includes_stage_context_fields(self):
        """Test goal includes objective/success criteria/context hints/reference actions."""
        from sasiki.engine.stage_executor import StageExecutor

        executor = StageExecutor(agent=None)  # type: ignore
        stage = {
            "name": "Search Stage",
            "objective": "Find {{query}} and open results",
            "success_criteria": "Results list is visible",
            "context_hints": ["Search box is near top", "Press Enter to submit"],
            "reference_actions": [
                {"type": "fill", "target": {"role": "searchbox", "name": "Search"}, "value": "python"},
                {"type": "press", "value": "Enter"},
            ],
        }
        goal = executor._build_stage_goal(stage, [])

        assert "Objective: Find {{query}} and open results" in goal
        assert "Success criteria: Results list is visible" in goal
        assert "Context hints:" in goal
        assert "Search box is near top" in goal
        assert "Reference actions (hints, not strict script):" in goal
        assert "fill on {'role': 'searchbox', 'name': 'Search'} with \"python\"" in goal
