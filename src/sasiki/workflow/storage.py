"""Storage for workflows."""

import json
from pathlib import Path
from typing import Optional
from uuid import UUID

from pydantic_yaml import to_yaml_file, parse_yaml_file_as

from sasiki.config import settings
from sasiki.workflow.models import Workflow
from sasiki.utils.logger import logger


class WorkflowStorage:
    """Manages persistence of workflows."""
    
    def __init__(self, base_dir: Optional[Path] = None):
        self.base_dir = base_dir or settings.workflows_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
    
    def save(self, workflow: Workflow) -> Path:
        """Save a workflow to disk."""
        workflow.updated_at = __import__('datetime').datetime.now()
        
        # Create directory for this workflow
        workflow_dir = self.base_dir / str(workflow.id)
        workflow_dir.mkdir(exist_ok=True)
        
        # Save main workflow file
        workflow_path = workflow_dir / "workflow.yaml"
        to_yaml_file(workflow_path, workflow)
        
        # Also save a JSON copy for easier inspection
        json_path = workflow_dir / "workflow.json"
        with open(json_path, 'w') as f:
            json.dump(workflow.model_dump(mode='json'), f, indent=2)
        
        logger.info(
            "workflow_saved",
            workflow_id=str(workflow.id),
            name=workflow.name,
            path=str(workflow_path),
        )
        
        return workflow_path
    
    def load(self, workflow_id: UUID) -> Optional[Workflow]:
        """Load a workflow by ID."""
        workflow_dir = self.base_dir / str(workflow_id)
        workflow_path = workflow_dir / "workflow.yaml"
        
        if not workflow_path.exists():
            # Try JSON fallback
            json_path = workflow_dir / "workflow.json"
            if json_path.exists():
                with open(json_path) as f:
                    data = json.load(f)
                return Workflow(**data)
            return None
        
        try:
            return parse_yaml_file_as(Workflow, workflow_path)
        except Exception as e:
            logger.error("failed_to_load_workflow", workflow_id=str(workflow_id), error=str(e))
            return None
    
    def list_workflows(self) -> list[Workflow]:
        """List all saved workflows."""
        workflows = []
        
        for workflow_dir in self.base_dir.iterdir():
            if not workflow_dir.is_dir():
                continue
            
            try:
                workflow_id = UUID(workflow_dir.name)
                workflow = self.load(workflow_id)
                if workflow:
                    workflows.append(workflow)
            except ValueError:
                continue
        
        return sorted(workflows, key=lambda w: w.updated_at, reverse=True)
    
    def delete(self, workflow_id: UUID) -> bool:
        """Delete a workflow."""
        import shutil
        
        workflow_dir = self.base_dir / str(workflow_id)
        if not workflow_dir.exists():
            return False
        
        shutil.rmtree(workflow_dir)
        logger.info("workflow_deleted", workflow_id=str(workflow_id))
        return True
    
    def get_by_name(self, name: str) -> Optional[Workflow]:
        """Find a workflow by name (exact match)."""
        for workflow in self.list_workflows():
            if workflow.name == name:
                return workflow
        return None
