"""Command for running a workflow."""

import typer
from rich.console import Console

from sasiki.commands.ui import print_header, print_workflow_panel
from sasiki.commands.workflow_inputs import (
    collect_workflow_inputs,
    load_workflow_by_id_or_name,
    validate_and_report_errors,
)
from sasiki.workflow.storage import WorkflowStorage

app = typer.Typer()
console = Console()


@app.command()
def run(
    workflow_id: str = typer.Argument(..., help="Workflow ID or name"),
    dry_run: bool = typer.Option(True, "--dry-run/--execute", help="Preview execution plan without running"),
) -> None:
    """Run a workflow.

    Phase 2 (Skill generation) is complete. Use --execute to attempt actual execution
    (requires Phase 3 WorkflowReplayer, currently in development), or use --dry-run (default) to preview.
    """
    storage = WorkflowStorage()
    workflow = load_workflow_by_id_or_name(storage, workflow_id, console)

    print_header()
    print_workflow_panel(workflow, console)

    # Collect variable inputs
    inputs = collect_workflow_inputs(workflow, console)
    validate_and_report_errors(workflow, inputs, console)

    # Generate execution plan
    try:
        plan = workflow.to_execution_plan(inputs)
    except ValueError as e:
        console.print(f"[red]Error creating execution plan: {e}[/red]")
        raise typer.Exit(1)

    if dry_run:
        console.print("\n[bold yellow]📋 Execution Plan (Dry Run)[/bold yellow]")
        console.print("\n[dim]Use --execute to run the workflow[/dim]\n")

        for i, stage in enumerate(plan["stages"], 1):
            console.print(f"[cyan][{i}/{len(plan['stages'])}] {stage['name']}[/cyan]", end="")
            if stage.get("application"):
                console.print(f" ([dim]{stage['application']}[/dim])")
            else:
                console.print()

            for action in stage.get("actions", []):
                console.print(f"    • {action}")

            # Check for checkpoint after this stage
            for cp in plan.get("checkpoints", []):
                if cp["after_stage"] == i - 1:
                    confirm_text = "⏸️  [yellow]Checkpoint[/yellow]: " + cp["description"]
                    if cp.get("manual_confirmation"):
                        confirm_text += " [dim](requires confirmation)[/dim]"
                    console.print(confirm_text)

        console.print("\n[green]✓ Dry run complete. No actions were executed.[/green]")
    else:
        console.print("\n[bold red]⚠️  Live execution not yet implemented[/bold red]")
        console.print("\n[dim]Phase 3 WorkflowReplayer (execution engine) is in development.[/dim]")
        console.print("The execution plan has been prepared but not executed.")
