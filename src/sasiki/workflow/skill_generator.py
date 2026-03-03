"""Skill generator for converting recordings to Workflows using LLM."""

import json
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from pydantic import ValidationError

from sasiki.llm.client import LLMClient
from sasiki.utils.logger import get_logger
from sasiki.workflow.models import Checkpoint, VariableType, Workflow, WorkflowStage, WorkflowVariable
from sasiki.workflow.recording_parser import RecordingParser
from sasiki.workflow.storage import WorkflowStorage
from sasiki.workflow.skill_models import SemanticPlan, SemanticStagePlan
from sasiki.workflow.action_formatter import ActionFormatter


class SkillGenerator:
    """Generate workflows from browser recordings using a structured I/O pipeline."""

    WORKFLOW_EXTRACTION_PROMPT = """You are a workflow extraction specialist.

You receive a structured browser recording (JSON). Each action has a stable `action_id`.

## Your job
1. Identify the overall workflow goal.
2. Group actions into logical stages by page/task boundary.
3. Identify variables (values the user may want to change at runtime).
4. Add checkpoints where human verification adds value.

## Stage quality rules
- One stage = one coherent sub-task (e.g., "Log in", "Search for item", "Submit form").
- Split on page navigation boundaries or distinct goal shifts. Do NOT create a stage per action.
- `objective`: describe WHAT to achieve (not HOW). Example: "Search for a product by keyword".
- `success_criteria`: must be observable and verifiable. Use page-visible evidence.
  Good: "Search results page shows at least one result for the query."
  Bad: "User searched successfully."
- `context_hints`: add hints only when the recording context reveals non-obvious constraints
  (e.g., site-specific UI quirks, required login state, modal handling).

## Variable rules
- Extract values the user would realistically want to change across runs (search queries, form values, dates).
- Use snake_case names. Provide an `example` from the recording.
- Do NOT extract structural constants (URLs, button labels) as variables.

## Constraints
- Do NOT rewrite raw action fields.
- Do NOT invent action_ids. Only reference existing ids from packet.actions.
- Raw data assembly is handled by code; keep output semantic.
"""

    def __init__(self, llm_client: Optional[LLMClient] = None):
        self.llm_client = llm_client or LLMClient()
        self.formatter = ActionFormatter()

    def _build_extraction_prompt(
        self,
        narrative: str,
        metadata: dict[str, Any],
        name_hint: Optional[str] = None,
        description_hint: Optional[str] = None,
    ) -> tuple[str, str]:
        """Build extraction prompt.

        `narrative` now carries structured packet JSON content.
        """
        system_prompt = self.WORKFLOW_EXTRACTION_PROMPT

        user_parts = [
            "=== Recording Metadata ===",
            f"Session ID: {metadata['session_id']}",
            f"Duration: {metadata['duration_seconds']} seconds",
            f"Total Actions: {metadata['action_count']}",
            "",
            "=== Structured Packet JSON ===",
            narrative,
            "",
            "=== Output Instructions ===",
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
            '      "name": "Stage name",',
            '      "description": "Optional stage summary",',
            '      "application": "Chrome",',
            '      "objective": "High-level stage objective",',
            '      "success_criteria": "How to verify stage completion",',
            '      "context_hints": ["Optional hints from recording context"],',
            '      "action_ids": [1, 2, 3],',
            '      "inputs": ["input variable names"],',
            '      "outputs": ["output data produced"]',
            '    }',
            "  ],",
            '  "variables": [',
            '    {',
            '      "name": "variable_name_snake_case",',
            '      "description": "What this variable represents",',
            '      "type": "text|number|url|choice|date|file",',
            '      "example": "example value from recording",',
            '      "required": true|false',
            '    }',
            "  ],",
            '  "checkpoints": [',
            '    {',
            '      "after_stage": 0,',
            '      "description": "What to verify",',
            '      "manual_confirmation": true',
            '    }',
            "  ],",
            '  "estimated_duration_minutes": 5',
            "}",
            "",
            "Important:",
            "- Stages must only reference valid action_ids from packet",
            "- Use snake_case for variable names",
            "- Keep each stage semantically coherent",
        ])

        return system_prompt, "\n".join(user_parts)

    def _parse_llm_response(self, response: str) -> dict[str, Any]:
        """Parse and validate LLM response."""
        try:
            result = json.loads(response)
            if isinstance(result, dict):
                return result
        except json.JSONDecodeError:
            pass

        if "```json" in response:
            json_start = response.find("```json") + 7
            json_end = response.find("```", json_start)
            if json_end > json_start:
                try:
                    result = json.loads(response[json_start:json_end].strip())
                    if isinstance(result, dict):
                        return result
                except json.JSONDecodeError:
                    pass

        if "```" in response:
            json_start = response.find("```") + 3
            json_end = response.find("```", json_start)
            if json_end > json_start:
                try:
                    result = json.loads(response[json_start:json_end].strip())
                    if isinstance(result, dict):
                        return result
                except json.JSONDecodeError:
                    pass

        raise ValueError(f"Could not parse LLM response as JSON: {response[:200]}...")

    def _build_stage_from_action_ids(
        self,
        stage_plan: SemanticStagePlan,
        action_map: dict[int, dict[str, Any]],
    ) -> dict[str, Any]:
        """Build stage payload deterministically from action_ids."""
        action_details: list[dict[str, Any]] = []
        action_summaries: list[str] = []
        reference_actions: list[dict[str, Any]] = []

        for action_id in stage_plan.action_ids:
            action = action_map.get(action_id)
            if not action:
                continue

            raw = action.get("raw", {})
            detail = {
                "action_id": action_id,
                "action_type": raw.get("type"),
                "timestamp": raw.get("timestamp"),
                "page_context": action.get("page_context"),
                "target_hint": action.get("normalized_target_hint_raw") or action.get("target_hint_raw"),
                "raw_target_hint": action.get("raw_target_hint_raw"),
                "normalized_target_hint": action.get("normalized_target_hint_raw"),
                "value": raw.get("value"),
                "url": raw.get("url"),
                "triggers_navigation": raw.get("triggers_navigation"),
                "triggered_by": raw.get("triggered_by"),
            }
            # Clean null values from detail before adding
            cleaned_detail = self.formatter.remove_null_values(detail)
            action_details.append(cleaned_detail)
            action_summaries.append(self.formatter.format_action_text(detail))

            reference_action = {
                "type": detail.get("action_type"),
                "target": detail.get("target_hint"),
                "value": detail.get("value"),
            }
            cleaned_reference_action = self.formatter.remove_null_values(reference_action)
            reference_actions.append(cleaned_reference_action)

        return {
            "name": stage_plan.name,
            "description": stage_plan.description,
            "application": stage_plan.application,
            "objective": stage_plan.objective,
            "success_criteria": stage_plan.success_criteria,
            "context_hints": stage_plan.context_hints,
            "reference_actions": reference_actions,
            "actions": action_summaries,
            "action_details": action_details,
            "inputs": stage_plan.inputs,
            "outputs": stage_plan.outputs,
        }

    def _assemble_workflow_data(
        self,
        semantic_plan: SemanticPlan,
        structured_packet: dict[str, Any],
    ) -> dict[str, Any]:
        """Combine semantic plan + structured packet into final workflow payload."""
        action_map = {
            int(action["action_id"]): action
            for action in structured_packet.get("actions", [])
            if "action_id" in action
        }

        stages = [
            self._build_stage_from_action_ids(stage_plan, action_map)
            for stage_plan in semantic_plan.stages
        ]

        variables = [var.model_dump() for var in semantic_plan.variables]
        checkpoints = [cp.model_dump() for cp in semantic_plan.checkpoints]

        return {
            "workflow_name": semantic_plan.workflow_name,
            "description": semantic_plan.description,
            "stages": stages,
            "variables": variables,
            "checkpoints": checkpoints,
            "estimated_duration_minutes": semantic_plan.estimated_duration_minutes,
        }

    def _extract_workflow_data(
        self,
        recording_path: Path,
        name_hint: Optional[str] = None,
        description_hint: Optional[str] = None,
    ) -> dict[str, Any]:
        """Extract workflow data from recording using structured I/O + LLM."""
        parser = RecordingParser(recording_path)
        metadata = parser.metadata.to_dict()

        max_actions = 80
        structured_packet = parser.to_structured_packet(max_actions=max_actions)
        packet_json = json.dumps(structured_packet, ensure_ascii=False)

        get_logger().info(
            "extracting_workflow",
            recording=str(recording_path),
            actions=metadata["action_count"],
            selected_actions=structured_packet["metadata"]["selected_action_count"],
            truncated=structured_packet["metadata"]["truncated"],
        )

        system_prompt, user_prompt = self._build_extraction_prompt(
            narrative=packet_json,
            metadata=metadata,
            name_hint=name_hint,
            description_hint=description_hint,
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        response = self.llm_client.complete(
            messages=messages,
            temperature=0.2,
            max_tokens=4000,
            response_format={"type": "json_object"},
        )
        semantic_raw = self._parse_llm_response(response)

        try:
            semantic_plan = SemanticPlan.model_validate(semantic_raw)
        except ValidationError as e:
            raise ValueError(f"Invalid semantic plan schema: {e}") from e

        workflow_data = self._assemble_workflow_data(
            semantic_plan=semantic_plan,
            structured_packet=structured_packet,
        )

        get_logger().info(
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
        """Convert assembled workflow data to Workflow model."""
        stages: list[WorkflowStage] = []
        for stage_data in data.get("stages", []):
            stage = WorkflowStage(
                name=stage_data["name"],
                description=stage_data.get("description", ""),
                application=stage_data.get("application", "Chrome"),
                objective=stage_data.get("objective", ""),
                success_criteria=stage_data.get("success_criteria", ""),
                context_hints=stage_data.get("context_hints", []),
                reference_actions=stage_data.get("reference_actions", []),
                actions=stage_data.get("actions", []),
                action_details=stage_data.get("action_details", []),
                inputs=stage_data.get("inputs", []),
                outputs=stage_data.get("outputs", []),
            )
            stages.append(stage)

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

        workflow = Workflow(
            name=data.get("workflow_name", "Unnamed Workflow"),
            description=data.get("description", ""),
            stages=stages,
            variables=variables,
            checkpoints=checkpoints,
            estimated_duration_minutes=data.get("estimated_duration_minutes"),
            tags=["auto-generated"],
        )

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
        """Generate a workflow from a recording file."""
        recording_path = Path(recording_path)
        if not recording_path.exists():
            raise FileNotFoundError(f"Recording file not found: {recording_path}")

        parser = RecordingParser(recording_path)
        session_id = parser.metadata.session_id

        workflow_data = self._extract_workflow_data(
            recording_path=recording_path,
            name_hint=name,
            description_hint=description,
        )
        workflow = self._convert_to_workflow(workflow_data, source_session_id=session_id)

        if name:
            workflow.name = name
        if description:
            workflow.description = description

        if save:
            storage = WorkflowStorage()
            storage.save(workflow)
            get_logger().info(
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
        """Preview what would be sent to the LLM."""
        recording_path = Path(recording_path)
        parser = RecordingParser(recording_path)
        structured_packet = parser.to_structured_packet(max_actions=max_actions)
        actions = structured_packet.get("actions", [])

        return {
            "metadata": parser.metadata.to_dict(),
            "narrative_preview": parser.to_compact_narrative(max_actions=max_actions),
            "structured_preview": {
                "metadata": structured_packet.get("metadata", {}),
                "actions": actions[: min(5, len(actions))],
                "page_groups": structured_packet.get("page_groups", {}),
            },
            "preserved_field_stats": {
                "actions_with_page_context": sum(
                    1 for a in actions if (a.get("page_context") or {}).get("url")
                ),
                "actions_with_target_hint_raw": sum(
                    1 for a in actions if a.get("target_hint_raw")
                ),
                "actions_with_normalized_target_hint_raw": sum(
                    1 for a in actions if a.get("normalized_target_hint_raw")
                ),
                "actions_with_dom_context": sum(
                    1
                    for a in actions
                    if (a.get("target_hint_raw") or {}).get("class_name")
                    or (a.get("target_hint_raw") or {}).get("class_names")
                    or (a.get("target_hint_raw") or {}).get("element_id")
                    or (a.get("target_hint_raw") or {}).get("test_id")
                    or (a.get("target_hint_raw") or {}).get("sibling_texts")
                ),
            },
            "action_count": len(parser.parse_actions()),
            "file_path": str(recording_path),
        }
