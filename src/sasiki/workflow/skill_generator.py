"""Skill generator for converting recordings to Workflows using LLM.

This module uses LLM to analyze recorded browser actions and extract
structured, reusable workflows (Skills).
"""

import json
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from sasiki.llm.client import LLMClient
from sasiki.server.websocket_protocol import RecordedAction
from sasiki.utils.logger import logger
from sasiki.workflow.models import Checkpoint, VariableType, Workflow, WorkflowStage, WorkflowVariable
from sasiki.workflow.recording_parser import RecordingParser
from sasiki.workflow.storage import WorkflowStorage


class SkillGenerator:
    """Generate workflows from browser recordings using LLM.

    This class coordinates:
    1. Parsing recording files
    2. Building LLM prompts
    3. Extracting workflow structure
    4. Validating and saving workflows
    """

    # System prompt for workflow extraction
    WORKFLOW_EXTRACTION_PROMPT = """You are a workflow extraction specialist. Analyze the browser recording and extract a reusable, structured workflow.

Your task is to:
1. Identify the high-level goal of the workflow (e.g., "Search for products", "Fill out a form")
2. Group related actions into logical stages
3. Identify values that should be parameterized as variables
4. Preserve element targeting information for replay

Guidelines:
- Stages represent distinct phases (e.g., "Navigate to site", "Search", "Review results")
- Actions within each stage should be sequential and related
- Variables are values that would change between executions (search terms, usernames, etc.)
- Keep target_hint details for element identification during replay
- URL patterns should use wildcards for dynamic parts (e.g., "*/search_result*")

Think step by step:
1. What is the user trying to accomplish?
2. What are the main phases/stages?
3. What values are specific to this execution vs. reusable?
4. What could go wrong and need verification (checkpoints)?"""

    def __init__(self, llm_client: Optional[LLMClient] = None):
        """Initialize the skill generator.

        Args:
            llm_client: LLM client to use (creates default if None)
        """
        self.llm_client = llm_client or LLMClient()

    def _build_extraction_prompt(
        self,
        narrative: str,
        metadata: dict[str, Any],
        name_hint: Optional[str] = None,
        description_hint: Optional[str] = None,
    ) -> tuple[str, str]:
        """Build the prompt for workflow extraction.

        Args:
            narrative: Compact narrative of the recording
            metadata: Recording metadata
            name_hint: Optional suggested workflow name
            description_hint: Optional suggested description

        Returns:
            Tuple of (system_prompt, user_prompt)
        """
        system_prompt = self.WORKFLOW_EXTRACTION_PROMPT

        user_parts = [
            "=== Recording Metadata ===",
            f"Session ID: {metadata['session_id']}",
            f"Duration: {metadata['duration_seconds']} seconds",
            f"Total Actions: {metadata['action_count']}",
            "",
            narrative,
            "",
            "=== Output Instructions ===",
            "Extract a workflow with the following structure:",
            "",
        ]

        if name_hint:
            user_parts.append(f"Suggested name: {name_hint}")
        if description_hint:
            user_parts.append(f"Suggested description: {description_hint}")

        user_parts.extend([
            "",
            "Return a JSON object with this exact structure:",
            "{",
            '  "workflow_name": "Short descriptive name (3-5 words)",',
            '  "description": "What this workflow accomplishes",',
            '  "stages": [',
            '    {',
            '      "name": "Stage name (verb + noun, e.g., Search for items)",',
            '      "application": "Chrome",',
            '      "url_pattern": "URL pattern with wildcards for dynamic parts",',
            '      "actions": ["action 1", "action 2"],',
            '      "inputs": ["input variable names"],',
            '      "outputs": ["output data produced"]',
            '    }',
            '  ],',
            '  "variables": [',
            '    {',
            '      "name": "variable_name_snake_case",',
            '      "description": "What this variable represents",',
            '      "type": "text|number|url",',
            '      "example": "example value from recording",',
            '      "required": true|false',
            '    }',
            '  ],',
            '  "checkpoints": [',
            '    {',
            '      "after_stage": 0,',
            '      "description": "What to verify",',
            '      "manual_confirmation": true',
            '    }',
            '  ],',
            '  "estimated_duration_minutes": 5',
            "}",
            "",
            "Important:",
            "- Use snake_case for variable names",
            "- url_pattern should match the pages where actions occur",
            "- Each stage should have 1-5 related actions",
            "- Variables should capture user-specific values (search terms, etc.)",
            "- Checkpoints mark natural breakpoints for verification",
        ])

        return system_prompt, "\n".join(user_parts)

    def _parse_llm_response(self, response: str) -> dict[str, Any]:
        """Parse and validate LLM response.

        Args:
            response: Raw LLM response string

        Returns:
            Parsed JSON dictionary

        Raises:
            ValueError: If response cannot be parsed
        """
        # Try to parse as JSON directly
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass

        # Try to extract JSON from markdown code blocks
        if "```json" in response:
            json_start = response.find("```json") + 7
            json_end = response.find("```", json_start)
            if json_end > json_start:
                try:
                    return json.loads(response[json_start:json_end].strip())
                except json.JSONDecodeError:
                    pass

        # Try to extract from generic code blocks
        if "```" in response:
            json_start = response.find("```") + 3
            json_end = response.find("```", json_start)
            if json_end > json_start:
                try:
                    return json.loads(response[json_start:json_end].strip())
                except json.JSONDecodeError:
                    pass

        raise ValueError(f"Could not parse LLM response as JSON: {response[:200]}...")

    def _extract_workflow_data(
        self,
        recording_path: Path,
        name_hint: Optional[str] = None,
        description_hint: Optional[str] = None,
    ) -> dict[str, Any]:
        """Extract workflow data from recording using LLM.

        Args:
            recording_path: Path to JSONL recording file
            name_hint: Optional suggested workflow name
            description_hint: Optional suggested description

        Returns:
            Raw workflow data from LLM
        """
        # Parse recording
        parser = RecordingParser(recording_path)
        metadata = parser.metadata.to_dict()

        # Generate compact narrative (with truncation for token limits)
        # Assuming ~1000 tokens for prompt structure, ~4000 for narrative
        # Rough estimate: 50 tokens per action
        max_actions = 80  # Conservative limit
        narrative = parser.to_compact_narrative(max_actions=max_actions)

        logger.info(
            "extracting_workflow",
            recording=str(recording_path),
            actions=metadata["action_count"],
        )

        # Build and send prompt
        system_prompt, user_prompt = self._build_extraction_prompt(
            narrative=narrative,
            metadata=metadata,
            name_hint=name_hint,
            description_hint=description_hint,
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        # Call LLM with JSON response format
        response = self.llm_client.complete(
            messages=messages,
            temperature=0.2,
            max_tokens=4000,
            response_format={"type": "json_object"},
        )

        # Parse response
        workflow_data = self._parse_llm_response(response)

        logger.info(
            "workflow_extracted",
            name=workflow_data.get("workflow_name", "unknown"),
            stages=len(workflow_data.get("stages", [])),
            variables=len(workflow_data.get("variables", [])),
        )

        return workflow_data

    def _convert_to_workflow(
        self,
        data: dict[str, Any],
        source_session_id: Optional[str] = None,
    ) -> Workflow:
        """Convert LLM-extracted data to Workflow model.

        Args:
            data: Raw workflow data from LLM
            source_session_id: Original recording session ID

        Returns:
            Workflow model instance
        """
        # Convert stages
        stages: list[WorkflowStage] = []
        for stage_data in data.get("stages", []):
            stage = WorkflowStage(
                name=stage_data["name"],
                description=stage_data.get("description", ""),
                application=stage_data.get("application", "Chrome"),
                actions=stage_data.get("actions", []),
                inputs=stage_data.get("inputs", []),
                outputs=stage_data.get("outputs", []),
            )
            stages.append(stage)

        # Convert variables
        variables: list[WorkflowVariable] = []
        for var_data in data.get("variables", []):
            var_type_str = var_data.get("type", "text").upper()
            try:
                var_type = VariableType[var_type_str]
            except KeyError:
                var_type = VariableType.TEXT

            variable = WorkflowVariable(
                name=var_data["name"],
                description=var_data.get("description", ""),
                var_type=var_type,
                default_value=var_data.get("default"),
                example=var_data.get("example"),
                required=var_data.get("required", True),
                options=var_data.get("options", []),
            )
            variables.append(variable)

        # Convert checkpoints
        checkpoints: list[Checkpoint] = []
        for cp_data in data.get("checkpoints", []):
            checkpoint = Checkpoint(
                after_stage=cp_data.get("after_stage", 0),
                description=cp_data.get("description", ""),
                manual_confirmation=cp_data.get("manual_confirmation", True),
                verify_outputs=cp_data.get("verify_outputs", []),
                expected_state=cp_data.get("expected_state"),
            )
            checkpoints.append(checkpoint)

        # Create workflow
        workflow = Workflow(
            name=data.get("workflow_name", "Unnamed Workflow"),
            description=data.get("description", ""),
            stages=stages,
            variables=variables,
            checkpoints=checkpoints,
            estimated_duration_minutes=data.get("estimated_duration_minutes"),
            tags=["auto-generated"],
        )

        # Set source session ID if provided
        if source_session_id:
            try:
                workflow.source_session_id = UUID(source_session_id)
            except ValueError:
                pass

        return workflow

    def generate_from_recording(
        self,
        recording_path: Path | str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        save: bool = True,
    ) -> Workflow:
        """Generate a workflow from a recording file.

        This is the main entry point for skill generation.

        Args:
            recording_path: Path to JSONL recording file
            name: Optional workflow name (suggested to LLM)
            description: Optional workflow description (suggested to LLM)
            save: Whether to save the workflow to storage

        Returns:
            Generated Workflow instance

        Raises:
            FileNotFoundError: If recording file doesn't exist
            ValueError: If workflow extraction fails
        """
        recording_path = Path(recording_path)

        if not recording_path.exists():
            raise FileNotFoundError(f"Recording file not found: {recording_path}")

        # Get session ID from recording
        parser = RecordingParser(recording_path)
        session_id = parser.metadata.session_id

        # Extract workflow data using LLM
        workflow_data = self._extract_workflow_data(
            recording_path=recording_path,
            name_hint=name,
            description_hint=description,
        )

        # Convert to Workflow model
        workflow = self._convert_to_workflow(workflow_data, source_session_id=session_id)

        # Override name/description if explicitly provided
        if name:
            workflow.name = name
        if description:
            workflow.description = description

        # Save if requested
        if save:
            storage = WorkflowStorage()
            storage.save(workflow)
            logger.info(
                "workflow_saved",
                workflow_id=str(workflow.id),
                name=workflow.name,
            )

        return workflow

    def preview_generation(
        self,
        recording_path: Path | str,
        max_actions: int = 20,
    ) -> dict[str, Any]:
        """Preview what would be sent to the LLM.

        Useful for debugging and understanding the input to LLM.

        Args:
            recording_path: Path to JSONL recording file
            max_actions: Maximum actions to include in preview

        Returns:
            Dictionary with metadata and narrative preview
        """
        recording_path = Path(recording_path)
        parser = RecordingParser(recording_path)

        return {
            "metadata": parser.metadata.to_dict(),
            "narrative_preview": parser.to_compact_narrative(max_actions=max_actions),
            "action_count": len(parser.parse_actions()),
            "file_path": str(recording_path),
        }
