"""Tests for workflow input helpers."""

import pytest
import typer
from rich.console import Console

from sasiki.commands.workflow_inputs import (
    collect_workflow_inputs,
    load_workflow_by_id_or_name,
    parse_cli_inputs,
    validate_and_report_errors,
)
from sasiki.workflow.models import VariableType, Workflow, WorkflowVariable
from sasiki.workflow.storage import WorkflowStorage


class TestParseCliInputs:
    """Tests for parse_cli_inputs function."""

    def test_empty_inputs(self):
        """Test with None/empty inputs."""
        console = Console()
        result = parse_cli_inputs(None, console)
        assert result == {}

        result = parse_cli_inputs([], console)
        assert result == {}

    def test_valid_key_value_pairs(self):
        """Test parsing valid key=value pairs."""
        console = Console()
        result = parse_cli_inputs(["key1=value1", "key2=value2"], console)
        assert result == {"key1": "value1", "key2": "value2"}

    def test_value_with_equals_sign(self):
        """Test that value can contain = characters."""
        console = Console()
        result = parse_cli_inputs(["query=select * from table where x=1"], console)
        assert result == {"query": "select * from table where x=1"}

    def test_invalid_format_no_equals(self):
        """Test that invalid format raises typer.Exit."""
        console = Console()
        with pytest.raises(typer.Exit) as exc_info:
            parse_cli_inputs(["invalid_input"], console)
        assert exc_info.value.exit_code == 1


class TestCollectWorkflowInputs:
    """Tests for collect_workflow_inputs function."""

    @pytest.fixture
    def workflow_with_vars(self):
        """Create a workflow with variables for testing."""
        return Workflow(
            name="Test Workflow",
            description="A test workflow",
            variables=[
                WorkflowVariable(
                    name="required_var",
                    description="A required variable",
                    var_type=VariableType.TEXT,
                    required=True,
                ),
                WorkflowVariable(
                    name="optional_var",
                    description="An optional variable",
                    var_type=VariableType.TEXT,
                    required=False,
                    default_value="default_value",
                ),
                WorkflowVariable(
                    name="var_with_example",
                    description="Variable with example",
                    var_type=VariableType.TEXT,
                    required=False,
                    example="example_value",
                ),
            ],
        )

    def test_no_variables(self, workflow_with_vars):
        """Test workflow with no variables returns empty dict."""
        console = Console()
        workflow_with_vars.variables = []

        result = collect_workflow_inputs(workflow_with_vars, console)
        assert result == {}

    def test_existing_inputs_skipped(self, workflow_with_vars, monkeypatch):
        """Test that existing inputs are not prompted again."""
        console = Console()
        existing = {"required_var": "already_provided"}

        # Mock typer.prompt to ensure it's not called for required_var
        prompt_calls = []

        def mock_prompt(text, default=None):
            prompt_calls.append(text)
            return default or ""

        monkeypatch.setattr(typer, "prompt", mock_prompt)

        result = collect_workflow_inputs(workflow_with_vars, console, existing)

        # required_var should not be prompted since it was in existing
        assert "required_var" not in "".join(prompt_calls)
        assert result["required_var"] == "already_provided"


class TestValidateAndReportErrors:
    """Tests for validate_and_report_errors function."""

    @pytest.fixture
    def workflow(self):
        """Create a simple workflow for testing."""
        return Workflow(
            name="Test Workflow",
            description="A test workflow",
            variables=[
                WorkflowVariable(
                    name="required_var",
                    description="A required variable",
                    var_type=VariableType.TEXT,
                    required=True,
                ),
            ],
        )

    def test_valid_inputs(self, workflow):
        """Test that valid inputs are returned unchanged."""
        console = Console()
        inputs = {"required_var": "value"}

        result = validate_and_report_errors(workflow, inputs, console)
        assert result == inputs

    def test_invalid_inputs_raises_exit(self, workflow):
        """Test that invalid inputs raise typer.Exit."""
        console = Console()
        inputs = {}  # Missing required_var

        with pytest.raises(typer.Exit) as exc_info:
            validate_and_report_errors(workflow, inputs, console)
        assert exc_info.value.exit_code == 1


class TestLoadWorkflowByIdOrName:
    """Tests for load_workflow_by_id_or_name function."""

    def test_load_by_uuid(self, tmp_path, monkeypatch):
        """Test loading workflow by UUID string."""
        console = Console()

        # Create a real workflow and save it
        workflow = Workflow(name="Test Workflow", description="Test")
        storage = WorkflowStorage()
        storage.save(workflow)

        # Load by UUID string
        result = load_workflow_by_id_or_name(storage, str(workflow.id), console)
        assert result.id == workflow.id
        assert result.name == "Test Workflow"

    def test_load_by_name(self, tmp_path, monkeypatch):
        """Test loading workflow by name."""
        console = Console()

        workflow = Workflow(name="UniqueTestWorkflow", description="Test")
        storage = WorkflowStorage()
        storage.save(workflow)

        # Load by name
        result = load_workflow_by_id_or_name(storage, "UniqueTestWorkflow", console)
        assert result.id == workflow.id

    def test_workflow_not_found(self, tmp_path):
        """Test that non-existent workflow raises typer.Exit."""
        console = Console()
        storage = WorkflowStorage()

        with pytest.raises(typer.Exit) as exc_info:
            load_workflow_by_id_or_name(storage, "NonExistentWorkflow", console)
        assert exc_info.value.exit_code == 1

        # Also test with invalid UUID format
        with pytest.raises(typer.Exit) as exc_info:
            load_workflow_by_id_or_name(storage, "not-a-uuid", console)
        assert exc_info.value.exit_code == 1
