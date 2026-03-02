"""Workflow input handling helpers.

Provides common utilities for loading workflows and collecting variable inputs
to avoid duplication across command modules.
"""

from typing import TYPE_CHECKING
from uuid import UUID

import typer
from rich.console import Console

if TYPE_CHECKING:
    from sasiki.workflow.models import Workflow
    from sasiki.workflow.storage import WorkflowStorage


def load_workflow_by_id_or_name(
    storage: "WorkflowStorage",
    workflow_id: str,
    console: Console,
) -> "Workflow":
    """Load a workflow by ID (UUID) or name.

    Tries to parse as UUID first, then falls back to name lookup.
    Exits with error message if workflow not found.

    Args:
        storage: The workflow storage instance
        workflow_id: Workflow ID (UUID) or name
        console: Console for error output

    Returns:
        The loaded workflow object

    Raises:
        typer.Exit: If workflow not found (exit code 1)
    """
    try:
        wf_id = UUID(workflow_id)
        workflow = storage.load(wf_id)
    except ValueError:
        # Try by name
        workflow = storage.get_by_name(workflow_id)

    if not workflow:
        console.print(f"[red]Workflow not found: {workflow_id}[/red]")
        raise typer.Exit(1)

    return workflow


def parse_cli_inputs(
    inputs: list[str] | None,
    console: Console,
) -> dict[str, str]:
    """Parse CLI --input key=value arguments.

    Args:
        inputs: List of "key=value" strings from CLI
        console: Console for error output

    Returns:
        Dictionary of parsed inputs

    Raises:
        typer.Exit: If any input has invalid format (exit code 1)
    """
    parsed: dict[str, str] = {}
    if not inputs:
        return parsed

    for input_str in inputs:
        if "=" not in input_str:
            console.print(f"[red]Invalid input format: {input_str}. Use key=value[/red]")
            raise typer.Exit(1)
        key, value = input_str.split("=", 1)
        parsed[key] = value

    return parsed


def collect_workflow_inputs(
    workflow: "Workflow",
    console: Console,
    existing_inputs: dict[str, str] | None = None,
) -> dict[str, str]:
    """Collect workflow variable inputs interactively.

    Prompts the user for each variable defined in the workflow.
    Skips variables already present in existing_inputs.
    Validates required fields.

    Args:
        workflow: The workflow to collect inputs for
        console: Console for output and prompts
        existing_inputs: Already-provided inputs (e.g., from CLI --input)

    Returns:
        Dictionary of all collected inputs (merged with existing_inputs)

    Raises:
        typer.Exit: If a required variable is not provided (exit code 1)
    """
    inputs = dict(existing_inputs) if existing_inputs else {}

    if not workflow.variables:
        return inputs

    console.print("\n[bold]Variables:[/bold]")
    for var in workflow.variables:
        if var.name in inputs:
            # Already provided via --input or existing_inputs
            continue

        req = " [red](required)[/red]" if var.required else " [dim](optional)[/dim]"
        default = f" [{var.default_value}]" if var.default_value else ""
        example = f" e.g. {var.example}" if var.example else ""

        prompt_text = f"  {var.name}{req}{default}{example}: "
        value = typer.prompt(prompt_text, default=var.default_value or "")

        if var.required and not value:
            console.print(f"[red]Error: {var.name} is required[/red]")
            raise typer.Exit(1)

        if value:
            inputs[var.name] = value

    return inputs


def validate_and_report_errors(
    workflow: "Workflow",
    inputs: dict[str, str],
    console: Console,
) -> dict[str, str]:
    """Validate workflow inputs and report errors.

    Args:
        workflow: The workflow to validate inputs against
        inputs: The collected inputs
        console: Console for error output

    Returns:
        The validated inputs (unchanged if valid)

    Raises:
        typer.Exit: If validation fails (exit code 1)
    """
    is_valid, errors = workflow.validate_inputs(inputs)
    if not is_valid:
        console.print("[red]Validation errors:[/red]")
        for error in errors:
            console.print(f"  • {error}")
        raise typer.Exit(1)

    return inputs
