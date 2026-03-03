"""Workflow management commands."""

from typing import Any
from uuid import UUID

import typer
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from sasiki.commands.ui import print_header
from sasiki.commands.workflow_inputs import load_workflow_by_id_or_name
from sasiki.workflow.storage import WorkflowStorage

app = typer.Typer(help="Manage workflows")
console = Console()


def _format_target_hint(target: Any) -> str:
    """Format reference target into a concise, model-facing string."""
    if not isinstance(target, dict):
        return str(target) if target else ""

    role = target.get("role")
    name = target.get("name") or target.get("placeholder") or target.get("text")

    if role and name:
        return f"{role}:{name}"
    if role:
        return str(role)
    if name:
        return str(name)
    return ""


def _format_reference_action(reference_action: dict[str, Any]) -> str:
    """Format a reference action for high-level display."""
    action_type = str(reference_action.get("type", "action"))
    target_text = _format_target_hint(reference_action.get("target"))
    value = reference_action.get("value")

    parts = [action_type]
    if target_text:
        parts.append(f"on {target_text}")
    if value not in (None, ""):
        parts.append(f'with "{value}"')
    return " ".join(parts)


@app.command(name="list")
def list_workflows(
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Show detailed info"),
) -> None:
    """List all saved workflows."""
    print_header()

    storage = WorkflowStorage()
    workflows = storage.list_workflows()

    if not workflows:
        console.print("\n[yellow]No workflows found.[/yellow]")
        console.print("Create one from browser recorder pipeline (in progress).")
        return

    console.print(f"\nFound {len(workflows)} workflow(s):\n")

    table = Table(box=box.SIMPLE_HEAD)
    table.add_column("Name")
    table.add_column("Description", max_width=40)
    table.add_column("Stages")
    table.add_column("Vars")
    table.add_column("Success/Total")
    table.add_column("Updated")

    for wf in workflows:
        total_runs = wf.success_count + wf.failure_count
        success_rate = f"{wf.success_count}/{total_runs}" if total_runs > 0 else "-"

        table.add_row(
            wf.name,
            (wf.description or "")[:40],
            str(len(wf.stages)),
            str(len(wf.variables)),
            success_rate,
            wf.updated_at.strftime("%Y-%m-%d %H:%M"),
        )

    console.print(table)


@app.command(name="show")
def show_workflow(
    workflow_id: str = typer.Argument(..., help="Workflow ID or name"),
) -> None:
    """Show detailed information about a workflow."""
    storage = WorkflowStorage()
    workflow = load_workflow_by_id_or_name(storage, workflow_id, console)

    console.print(Panel.fit(
        f"[bold]{workflow.name}[/bold]\n"
        f"[dim]{workflow.description}[/dim]\n"
        f"\nID: {workflow.id}"
    ))

    console.print("\n[bold]Stages (High-Level):[/bold]")
    for i, stage in enumerate(workflow.stages, 1):
        stage_title = f"{i}. {stage.name}"
        if stage.application:
            stage_title += f" ({stage.application})"

        stage_lines: list[str] = []
        if stage.objective:
            stage_lines.append(f"[bold]Objective:[/bold] {stage.objective}")
        elif stage.description:
            stage_lines.append(f"[bold]Objective:[/bold] {stage.description}")

        if stage.success_criteria:
            stage_lines.append(f"[bold]Success Criteria:[/bold] {stage.success_criteria}")

        if stage.context_hints:
            stage_lines.append("[bold]Context Hints:[/bold]")
            stage_lines.extend([f"  • {hint}" for hint in stage.context_hints[:4]])
            if len(stage.context_hints) > 4:
                stage_lines.append(f"  ... and {len(stage.context_hints) - 4} more")

        if stage.reference_actions:
            stage_lines.append("[bold]Reference Actions (hints):[/bold]")
            stage_lines.extend(
                [f"  • {_format_reference_action(action)}" for action in stage.reference_actions[:4]]
            )
            if len(stage.reference_actions) > 4:
                stage_lines.append(f"  ... and {len(stage.reference_actions) - 4} more")
        elif stage.actions:
            stage_lines.append("[bold]Legacy Actions:[/bold]")
            stage_lines.extend([f"  • {action}" for action in stage.actions[:4]])
            if len(stage.actions) > 4:
                stage_lines.append(f"  ... and {len(stage.actions) - 4} more")

        if stage.inputs:
            stage_lines.append(f"[bold]Inputs:[/bold] {', '.join(stage.inputs)}")
        if stage.outputs:
            stage_lines.append(f"[bold]Outputs:[/bold] {', '.join(stage.outputs)}")

        if not stage_lines:
            stage_lines.append("[dim]No stage details available.[/dim]")

        console.print(Panel("\n".join(stage_lines), title=stage_title, border_style="cyan"))

    if workflow.variables:
        console.print("\n[bold]Variables:[/bold]")
        for var in workflow.variables:
            req = "[red]*[/red]" if var.required else ""
            console.print(f"  • {var.name}{req} ({var.var_type.value}): {var.description}")
            if var.example:
                console.print(f"    Example: {var.example}")

    if workflow.checkpoints:
        console.print("\n[bold]Checkpoints:[/bold]")
        for cp in workflow.checkpoints:
            confirm = "[manual confirm]" if cp.manual_confirmation else "[auto]"
            console.print(f"  • After stage {cp.after_stage} {confirm}")
            console.print(f"    {cp.description}")


@app.command(name="delete")
def delete_workflow(
    workflow_id: str = typer.Argument(..., help="Workflow ID"),
    force: bool = typer.Option(False, "--force", "-f", help="Skip confirmation"),
) -> None:
    """Delete a workflow."""
    try:
        wf_id = UUID(workflow_id)
    except ValueError:
        console.print("[red]Invalid workflow ID format[/red]")
        raise typer.Exit(1)

    storage = WorkflowStorage()
    workflow = storage.load(wf_id)

    if not workflow:
        console.print(f"[red]Workflow not found: {workflow_id}[/red]")
        raise typer.Exit(1)

    if not force:
        if not typer.confirm(f"Delete workflow '{workflow.name}'?"):
            console.print("Cancelled.")
            raise typer.Exit(0)

    storage.delete(wf_id)
    console.print(f"[green]✓ Deleted workflow: {workflow.name}[/green]")
