"""Tests for workflow models."""

import pytest
from pathlib import Path

from sasiki.workflow.models import (
    Workflow,
    WorkflowStage,
    WorkflowVariable,
    Checkpoint,
    VariableType,
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

    def test_create_stage_ai_native_fields_default(self):
        """Test AI-native stage fields have backward-compatible defaults."""
        stage = WorkflowStage(name="兼容阶段")
        assert stage.objective == ""
        assert stage.success_criteria == ""
        assert stage.context_hints == []
        assert stage.reference_actions == []


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

    def test_to_execution_plan_includes_action_details(self):
        """Test execution plan includes structured action_details."""
        stage = WorkflowStage(
            name="登录",
            actions=["点击登录按钮", "输入用户名"],
            action_details=[
                {
                    "action_type": "click",
                    "target_hint": "登录按钮",
                    "page_context": {"url": "https://example.com/login"},
                },
                {
                    "action_type": "fill",
                    "target_hint": "用户名输入框",
                    "value": "test_user",
                },
            ],
        )
        workflow = Workflow(name="测试", stages=[stage])
        plan = workflow.to_execution_plan({})

        assert "action_details" in plan["stages"][0]
        assert len(plan["stages"][0]["action_details"]) == 2
        assert plan["stages"][0]["action_details"][0]["action_type"] == "click"
        assert plan["stages"][0]["action_details"][0]["target_hint"] == "登录按钮"

    def test_to_execution_plan_substitutes_variables_in_action_details(self):
        """Test variable substitution works in action_details."""
        var = WorkflowVariable(name="username", required=True)
        stage = WorkflowStage(
            name="登录",
            actions=["输入 {{username}}"],
            action_details=[
                {
                    "action_type": "fill",
                    "target_hint": "用户名输入框",
                    "value": "{{username}}",
                    "description": "填写 {{username}} 到输入框",
                },
            ],
        )
        workflow = Workflow(name="测试", variables=[var], stages=[stage])
        plan = workflow.to_execution_plan({"username": "john_doe"})

        detail = plan["stages"][0]["action_details"][0]
        assert detail["value"] == "john_doe"
        assert detail["description"] == "填写 john_doe 到输入框"
        # Non-string fields should be preserved
        assert detail["action_type"] == "fill"

    def test_to_execution_plan_empty_action_details(self):
        """Test execution plan handles empty action_details gracefully."""
        stage = WorkflowStage(
            name="简单阶段",
            actions=["简单操作"],
            action_details=[],
        )
        workflow = Workflow(name="测试", stages=[stage])
        plan = workflow.to_execution_plan({})

        assert "action_details" in plan["stages"][0]
        assert len(plan["stages"][0]["action_details"]) == 0

    def test_to_execution_plan_includes_ai_native_fields(self):
        """Test execution plan includes AI-native fields with variable substitution."""
        var = WorkflowVariable(name="query", required=True)
        stage = WorkflowStage(
            name="搜索",
            objective="搜索 {{query}} 并打开结果页",
            success_criteria="页面出现 {{query}} 的结果列表",
            context_hints=["搜索框通常包含 {{query}} 相关提示"],
            reference_actions=[
                {"type": "fill", "value": "{{query}}"},
                {"type": "press", "value": "Enter"},
            ],
        )
        workflow = Workflow(name="测试", variables=[var], stages=[stage])
        plan = workflow.to_execution_plan({"query": "AI Agent"})

        stage_plan = plan["stages"][0]
        assert stage_plan["objective"] == "搜索 AI Agent 并打开结果页"
        assert stage_plan["success_criteria"] == "页面出现 AI Agent 的结果列表"
        assert stage_plan["context_hints"] == ["搜索框通常包含 AI Agent 相关提示"]
        assert stage_plan["reference_actions"][0]["value"] == "AI Agent"
