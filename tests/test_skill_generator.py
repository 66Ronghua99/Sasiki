"""Tests for skill generator module."""

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from sasiki.workflow.skill_generator import SkillGenerator
from sasiki.workflow.models import Workflow, VariableType


class TestSkillGenerator:
    """Tests for SkillGenerator."""

    @pytest.fixture
    def sample_recording(self):
        """Create a sample recording file."""
        metadata = {
            "_meta": True,
            "session_id": "test_search_session",
            "started_at": "2024-01-01T12:00:00.000000",
            "stopped_at": "2024-01-01T12:02:00.000000",
            "action_count": 3,
            "duration_ms": 120000,
        }

        action1 = {
            "timestamp": 1704110400000,
            "type": "navigate",
            "session_id": "test_search_session",
            "page_context": {
                "url": "https://example.com",
                "title": "Example Site",
                "tab_id": 123,
            },
            "url": "https://example.com",
            "triggered_by": "url_change",
        }

        action2 = {
            "timestamp": 1704110401000,
            "type": "click",
            "session_id": "test_search_session",
            "page_context": {
                "url": "https://example.com",
                "title": "Example Site",
                "tab_id": 123,
            },
            "target_hint": {
                "role": "textbox",
                "name": "Search",
                "tag_name": "input",
            },
        }

        action3 = {
            "timestamp": 1704110402000,
            "type": "type",
            "session_id": "test_search_session",
            "page_context": {
                "url": "https://example.com",
                "title": "Example Site",
                "tab_id": 123,
            },
            "target_hint": {
                "role": "textbox",
                "name": "Search",
                "tag_name": "input",
            },
            "value": "test query",
        }

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".jsonl", delete=False
        ) as f:
            f.write(json.dumps(metadata) + "\n")
            f.write(json.dumps(action1) + "\n")
            f.write(json.dumps(action2) + "\n")
            f.write(json.dumps(action3) + "\n")
            return Path(f.name)

    @pytest.fixture
    def mock_llm_response(self):
        """Sample LLM response for testing."""
        return {
            "workflow_name": "Example Site Search",
            "description": "Search for content on example.com",
            "stages": [
                {
                    "name": "Navigate to site",
                    "description": "Open target website",
                    "application": "Chrome",
                    "action_ids": [1],
                    "inputs": [],
                    "outputs": [],
                },
                {
                    "name": "Perform search",
                    "description": "Use search box",
                    "application": "Chrome",
                    "action_ids": [2, 3],
                    "inputs": ["search_query"],
                    "outputs": ["search_results"],
                },
            ],
            "variables": [
                {
                    "name": "search_query",
                    "description": "The search term to look for",
                    "type": "text",
                    "example": "test query",
                    "required": True,
                }
            ],
            "checkpoints": [
                {
                    "after_stage": 0,
                    "description": "Verify page loaded",
                    "manual_confirmation": False,
                }
            ],
            "estimated_duration_minutes": 2,
        }

    def test_init_creates_default_llm_client(self):
        """Test that default LLM client is created."""
        with patch("sasiki.workflow.skill_generator.LLMClient") as mock_client:
            mock_client.return_value = MagicMock()
            generator = SkillGenerator()
            assert generator.llm_client is not None

    def test_parse_llm_response_valid_json(self):
        """Test parsing valid JSON response."""
        generator = SkillGenerator(llm_client=MagicMock())
        response = '{"workflow_name": "Test", "stages": []}'

        result = generator._parse_llm_response(response)
        assert result["workflow_name"] == "Test"

    def test_parse_llm_response_markdown_code_block(self):
        """Test parsing JSON from markdown code block."""
        generator = SkillGenerator(llm_client=MagicMock())
        response = '''```json
{"workflow_name": "Test", "stages": []}
```'''

        result = generator._parse_llm_response(response)
        assert result["workflow_name"] == "Test"

    def test_parse_llm_response_invalid(self):
        """Test parsing invalid response raises error."""
        generator = SkillGenerator(llm_client=MagicMock())
        response = "Not valid JSON"

        with pytest.raises(ValueError, match="Could not parse"):
            generator._parse_llm_response(response)

    def test_format_action_text_prefers_normalized_target(self):
        """Click summaries should prefer normalized target over raw node."""
        generator = SkillGenerator(llm_client=MagicMock())
        action_detail = {
            "action_type": "click",
            "target_hint": {"role": "generic", "tag_name": "svg", "name": ""},
            "normalized_target_hint": {"role": "button", "tag_name": "button", "name": "收藏"},
            "page_context": {"url": "https://example.com"},
        }
        assert generator._format_action_text(action_detail) == 'Click "收藏"'

    def test_convert_to_workflow(self, mock_llm_response):
        """Test converting LLM data to Workflow model."""
        generator = SkillGenerator(llm_client=MagicMock())
        assembled_data = {
            "workflow_name": "Example Site Search",
            "description": "Search for content on example.com",
            "stages": [
                {
                    "name": "Navigate to site",
                    "description": "Open target website",
                    "application": "Chrome",
                    "actions": ['Navigate to "https://example.com"'],
                    "action_details": [
                        {
                            "action_id": 1,
                            "action_type": "navigate",
                            "page_context": {"url": "https://example.com", "title": "Example Site", "tab_id": 123},
                        }
                    ],
                    "inputs": [],
                    "outputs": [],
                },
                {
                    "name": "Perform search",
                    "description": "Use search box",
                    "application": "Chrome",
                    "actions": ['Click "Search"', 'Type "test query" into "Search"'],
                    "action_details": [
                        {
                            "action_id": 2,
                            "action_type": "click",
                            "page_context": {"url": "https://example.com", "title": "Example Site", "tab_id": 123},
                        },
                        {
                            "action_id": 3,
                            "action_type": "type",
                            "value": "test query",
                            "page_context": {"url": "https://example.com", "title": "Example Site", "tab_id": 123},
                        },
                    ],
                    "inputs": ["search_query"],
                    "outputs": ["search_results"],
                },
            ],
            "variables": mock_llm_response["variables"],
            "checkpoints": mock_llm_response["checkpoints"],
            "estimated_duration_minutes": 2,
        }
        workflow = generator._convert_to_workflow(assembled_data)

        assert isinstance(workflow, Workflow)
        assert workflow.name == "Example Site Search"
        assert workflow.description == "Search for content on example.com"
        assert len(workflow.stages) == 2
        assert len(workflow.variables) == 1
        assert len(workflow.checkpoints) == 1

        # Check stage details
        assert workflow.stages[0].name == "Navigate to site"
        assert workflow.stages[1].name == "Perform search"
        assert workflow.stages[1].inputs == ["search_query"]
        assert len(workflow.stages[1].action_details) == 2

        # Check variable details
        var = workflow.variables[0]
        assert var.name == "search_query"
        assert var.var_type == VariableType.TEXT
        assert var.required is True
        assert var.example == "test query"

    def test_convert_to_workflow_with_session_id(self, mock_llm_response):
        """Test that source session ID is set."""
        from uuid import UUID
        generator = SkillGenerator(llm_client=MagicMock())
        workflow = generator._convert_to_workflow(
            mock_llm_response,
            source_session_id="12345678-1234-5678-1234-567812345678"
        )

        assert workflow.source_session_id == UUID("12345678-1234-5678-1234-567812345678")

    def test_preview_generation(self, sample_recording):
        """Test preview mode."""
        generator = SkillGenerator(llm_client=MagicMock())
        preview = generator.preview_generation(sample_recording)

        assert preview["metadata"]["session_id"] == "test_search_session"
        assert preview["action_count"] == 3
        assert "narrative_preview" in preview
        assert "structured_preview" in preview
        assert "preserved_field_stats" in preview
        assert "=== Recording Summary ===" in preview["narrative_preview"]

    def test_preview_generation_max_actions(self, sample_recording):
        """Test preview with action limit."""
        generator = SkillGenerator(llm_client=MagicMock())
        preview = generator.preview_generation(sample_recording, max_actions=2)

        # Count action markers in narrative
        action_count = preview["narrative_preview"].count("type = ")
        assert action_count <= 2

    @patch("sasiki.workflow.skill_generator.WorkflowStorage")
    def test_generate_from_recording(self, mock_storage_class, sample_recording, mock_llm_response):
        """Test full workflow generation."""
        # Setup mocks
        mock_storage = MagicMock()
        mock_storage_class.return_value = mock_storage

        mock_llm = MagicMock()
        mock_llm.complete.return_value = json.dumps(mock_llm_response)

        generator = SkillGenerator(llm_client=mock_llm)

        workflow = generator.generate_from_recording(
            sample_recording,
            name="Custom Name",
            description="Custom Description",
            save=True,
        )

        assert isinstance(workflow, Workflow)
        assert workflow.name == "Custom Name"  # Explicit name overrides
        assert workflow.description == "Custom Description"
        mock_storage.save.assert_called_once_with(workflow)

    @patch("sasiki.workflow.skill_generator.WorkflowStorage")
    def test_generate_from_recording_dry_run(self, mock_storage_class, sample_recording, mock_llm_response):
        """Test generation without saving."""
        mock_storage = MagicMock()
        mock_storage_class.return_value = mock_storage

        mock_llm = MagicMock()
        mock_llm.complete.return_value = json.dumps(mock_llm_response)

        generator = SkillGenerator(llm_client=mock_llm)

        workflow = generator.generate_from_recording(
            sample_recording,
            save=False,
        )

        assert isinstance(workflow, Workflow)
        mock_storage.save.assert_not_called()

    def test_generate_from_recording_file_not_found(self):
        """Test error for non-existent file."""
        generator = SkillGenerator(llm_client=MagicMock())

        with pytest.raises(FileNotFoundError):
            generator.generate_from_recording("/nonexistent/file.jsonl")

    def test_build_extraction_prompt(self, sample_recording):
        """Test prompt building."""
        generator = SkillGenerator(llm_client=MagicMock())

        from sasiki.workflow.recording_parser import RecordingParser
        parser = RecordingParser(sample_recording)
        metadata = parser.metadata.to_dict()
        narrative = parser.to_compact_narrative(max_actions=5)

        system_prompt, user_prompt = generator._build_extraction_prompt(
            narrative=narrative,
            metadata=metadata,
            name_hint="Search Workflow",
            description_hint="A workflow for searching",
        )

        assert "workflow extraction" in system_prompt.lower()
        assert "test_search_session" in user_prompt
        assert "Search Workflow" in user_prompt
        assert "A workflow for searching" in user_prompt
        assert "JSON" in user_prompt

    def test_format_action_text_with_hex_id_uses_sibling_text(self):
        """When target_name is a hex ID, should use sibling_texts instead."""
        generator = SkillGenerator(llm_client=MagicMock())
        action_detail = {
            "action_type": "click",
            "target_hint": {
                "name": "67c42e99000000000e005734",  # hex ID
                "role": "link",
                "tag_name": "a",
                "sibling_texts": ["男生必看‼️衣品差的男生进来照着抄"],
            },
        }
        result = generator._format_action_text(action_detail)
        assert "男生必看" in result
        assert "67c42e99000000000e005734" not in result

    def test_format_action_text_like_button_with_count(self):
        """Should identify like button and include count."""
        generator = SkillGenerator(llm_client=MagicMock())
        action_detail = {
            "action_type": "click",
            "target_hint": {
                "name": "",  # empty name
                "role": "generic",
                "tag_name": "svg",
                "class_name": "like-wrapper",
                "sibling_texts": ["83"],  # like count
            },
        }
        result = generator._format_action_text(action_detail)
        assert "like button" in result.lower()
        assert "83" in result

    def test_format_action_text_collect_button(self):
        """Should identify collect button with count."""
        generator = SkillGenerator(llm_client=MagicMock())
        action_detail = {
            "action_type": "click",
            "target_hint": {
                "name": "1万",  # numeric-like name
                "role": "generic",
                "tag_name": "span",
                "class_name": "collect-wrapper",
                "sibling_texts": ["1万"],
            },
        }
        result = generator._format_action_text(action_detail)
        assert "collect button" in result.lower()
        assert "1万" in result

    def test_format_action_text_share_button(self):
        """Should identify share button."""
        generator = SkillGenerator(llm_client=MagicMock())
        action_detail = {
            "action_type": "click",
            "target_hint": {
                "name": "",
                "role": "generic",
                "tag_name": "svg",
                "class_name": "share-wrapper",
                "sibling_texts": ["分享"],
            },
        }
        result = generator._format_action_text(action_detail)
        assert "share button" in result.lower()

    def test_format_action_text_generic_link(self):
        """Should format regular link with target name."""
        generator = SkillGenerator(llm_client=MagicMock())
        action_detail = {
            "action_type": "click",
            "target_hint": {
                "name": "Home",
                "role": "link",
                "tag_name": "a",
            },
        }
        result = generator._format_action_text(action_detail)
        assert result == 'Click link "Home"'

    def test_looks_like_id_detects_hex(self):
        """Should detect hex IDs (24+ characters)."""
        generator = SkillGenerator(llm_client=MagicMock())
        assert generator._looks_like_id("67c42e99000000000e005734") is True
        assert generator._looks_like_id("abc123def4567890abcdef12") is True

    def test_looks_like_id_detects_numbers(self):
        """Should detect short numbers as IDs."""
        generator = SkillGenerator(llm_client=MagicMock())
        assert generator._looks_like_id("83") is True
        assert generator._looks_like_id("1234") is True

    def test_looks_like_id_allows_meaningful_text(self):
        """Should allow meaningful text through."""
        generator = SkillGenerator(llm_client=MagicMock())
        assert generator._looks_like_id("Search") is False
        assert generator._looks_like_id("Submit button") is False
        assert generator._looks_like_id("男生必看") is False

    def test_extract_meaningful_text_filters_ids(self):
        """Should filter out IDs from sibling texts."""
        generator = SkillGenerator(llm_client=MagicMock())
        siblings = ["83", "男生必看‼️衣品差的男生进来照着抄"]
        result = generator._extract_meaningful_text(siblings)
        assert result == "男生必看‼️衣品差的男生进来照着抄"

    def test_extract_meaningful_text_returns_none_for_only_ids(self):
        """Should return None if only IDs in siblings."""
        generator = SkillGenerator(llm_client=MagicMock())
        siblings = ["83", "67c42e99000000000e005734"]
        result = generator._extract_meaningful_text(siblings)
        assert result is None

    def test_infer_element_type_from_class(self):
        """Should infer type from class_name."""
        generator = SkillGenerator(llm_client=MagicMock())
        assert generator._infer_element_type({"class_name": "like-wrapper"}) == "like button"
        assert generator._infer_element_type({"class_name": "collect-btn"}) == "collect button"
        assert generator._infer_element_type({"class_name": "share-wrapper"}) == "share button"

    def test_infer_element_type_from_role(self):
        """Should infer type from role."""
        generator = SkillGenerator(llm_client=MagicMock())
        assert generator._infer_element_type({"role": "link"}) == "link"
        assert generator._infer_element_type({"role": "button"}) == "button"
        assert generator._infer_element_type({"role": "textbox"}) == "text input"

    def test_infer_element_type_from_tag(self):
        """Should infer type from tag_name."""
        generator = SkillGenerator(llm_client=MagicMock())
        assert generator._infer_element_type({"tag_name": "a"}) == "link"
        assert generator._infer_element_type({"tag_name": "svg"}) == "icon"
        assert generator._infer_element_type({"tag_name": "img"}) == "image"

    def test_format_count_suffix_extracts_numbers(self):
        """Should format count suffix from siblings."""
        generator = SkillGenerator(llm_client=MagicMock())
        assert generator._format_count_suffix(["83"]) == " (83)"
        assert generator._format_count_suffix(["1万"]) == " (1万)"
        assert generator._format_count_suffix(["2,345"]) == " (2,345)"
        assert generator._format_count_suffix(["text"]) == ""

    def test_format_action_text_fallback_when_no_context(self):
        """Should fallback gracefully when no context available."""
        generator = SkillGenerator(llm_client=MagicMock())
        action_detail = {
            "action_type": "click",
            "target_hint": {"name": "67c42e99000000000e005734"},
        }
        result = generator._format_action_text(action_detail)
        # Should fallback to generic description since name is ID and no siblings
        assert "Click" in result
