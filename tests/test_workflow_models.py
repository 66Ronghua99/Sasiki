"""Tests for workflow models."""


import pytest

from sasiki.workflow.models import (
    VariableType,
    Workflow,
    WorkflowStage,
    WorkflowVariable,
)


class TestWorkflowVariable:
    """Tests for WorkflowVariable."""

    def test_create_text_variable(self):
        """Test creating a text variable."""
        var = WorkflowVariable(
            name="search_query",
            description="Search keywords",
            var_type=VariableType.TEXT,
            example="劳动合同法",
        )
        assert var.name == "search_query"
        assert var.var_type == VariableType.TEXT
        assert var.required is True

    def test_create_choice_variable(self):
        """Test creating a choice variable."""
        var = WorkflowVariable(
            name="contract_type",
            description="Type of contract",
            var_type=VariableType.CHOICE,
            options=["劳动合同", "租赁合同", "买卖合同"],
        )
        assert var.var_type == VariableType.CHOICE
        assert len(var.options) == 3


class TestWorkflowStage:
    """Tests for WorkflowStage."""

    def test_create_stage(self):
        """Test creating a workflow stage."""
        stage = WorkflowStage(
            name="法条检索",
            description="搜索法律条文",
            application="Chrome",
            actions=["打开浏览器", "访问法律网站"],
            inputs=["search_query"],
            outputs=["法条文本"],
        )
        assert stage.name == "法条检索"
        assert stage.application == "Chrome"
        assert len(stage.actions) == 2


class TestWorkflow:
    """Tests for Workflow."""

    def test_create_workflow(self):
        """Test creating a basic workflow."""
        workflow = Workflow(
            name="测试工作流",
            description="用于测试的工作流",
        )
        assert workflow.name == "测试工作流"
        assert workflow.version == 1
        assert workflow.is_active is True

    def test_get_variable(self):
        """Test getting a variable by name."""
        var = WorkflowVariable(name="query", description="Search query")
        workflow = Workflow(
            name="测试",
            variables=[var],
        )
        found = workflow.get_variable("query")
        assert found is not None
        assert found.name == "query"

    def test_get_variable_not_found(self):
        """Test getting a non-existent variable."""
        workflow = Workflow(name="测试")
        found = workflow.get_variable("nonexistent")
        assert found is None

    def test_validate_inputs_required_missing(self):
        """Test validation with missing required variable."""
        var = WorkflowVariable(name="required_var", required=True)
        workflow = Workflow(name="测试", variables=[var])
        is_valid, errors = workflow.validate_inputs({})
        assert is_valid is False
        assert len(errors) == 1
        assert "Missing required variable" in errors[0]

    def test_validate_inputs_valid(self):
        """Test validation with valid inputs."""
        var = WorkflowVariable(name="query", required=True)
        workflow = Workflow(name="测试", variables=[var])
        is_valid, errors = workflow.validate_inputs({"query": "test"})
        assert is_valid is True
        assert len(errors) == 0

    def test_to_execution_plan(self):
        """Test converting to execution plan."""
        var = WorkflowVariable(name="name", required=True)
        stage = WorkflowStage(
            name="问候",
            actions=["Hello {{name}}!"],
        )
        workflow = Workflow(
            name="测试",
            variables=[var],
            stages=[stage],
        )
        plan = workflow.to_execution_plan({"name": "World"})
        assert plan["workflow_name"] == "测试"
        assert plan["stages"][0]["actions"][0] == "Hello World!"

    def test_to_execution_plan_invalid_inputs(self):
        """Test execution plan with invalid inputs raises error."""
        var = WorkflowVariable(name="required", required=True)
        workflow = Workflow(name="测试", variables=[var])
        with pytest.raises(ValueError, match="Invalid inputs"):
            workflow.to_execution_plan({})
