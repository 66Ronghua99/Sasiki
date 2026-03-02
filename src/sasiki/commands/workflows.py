"""Workflow management commands."""

from uuid import UUID

import typer
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from sasiki.workflow.storage import WorkflowStorage

app = typer.Typer(help="Manage workflows")
console = Console()


def _print_header() -> None:
    """Print the application header."""
    console.print(Panel.fit(
        "[bold blue]Sasiki[/bold blue] - 工作流摹刻 Agent\n"
        "[dim]观察一次，永久复用[/dim]",
        border_style="blue",
    ))


@app.command(name="list")
def list_workflows(
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Show detailed info"),
) -> None:
    """List all saved workflows."""
    _print_header()

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

    # Try to load by ID first
    try:
        wf_id = UUID(workflow_id)
        workflow = storage.load(wf_id)
    except ValueError:
        # Try by name
        workflow = storage.get_by_name(workflow_id)

    if not workflow:
        console.print(f"[red]Workflow not found: {workflow_id}[/red]")
        raise typer.Exit(1)

    console.print(Panel.fit(
        f"[bold]{workflow.name}[/bold]\n"
        f"[dim]{workflow.description}[/dim]\n"
        f"\nID: {workflow.id}"
    ))

    console.print("\n[bold]Stages:[/bold]")
    for i, stage in enumerate(workflow.stages, 1):
        console.print(f"\n  {i}. [cyan]{stage.name}[/cyan]", end="")
        if stage.application:
            console.print(f" ([dim]{stage.application}[/dim])")
        else:
            console.print()
        if stage.description:
            console.print(f"     {stage.description}")
        if stage.actions:
            console.print("     Actions:")
            for action in stage.actions[:5]:  # Show first 5
                console.print(f"       • {action}")
            if len(stage.actions) > 5:
                console.print(f"       ... and {len(stage.actions) - 5} more")

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
