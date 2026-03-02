"""Command for running a workflow."""

from uuid import UUID

import typer
from rich.console import Console
from rich.panel import Panel

from sasiki.workflow.storage import WorkflowStorage

app = typer.Typer()
console = Console()


def _print_header() -> None:
    """Print the application header."""
    console.print(Panel.fit(
        "[bold blue]Sasiki[/bold blue] - 工作流摹刻 Agent\n"
        "[dim]观察一次，永久复用[/dim]",
        border_style="blue",
    ))


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

    _print_header()

    console.print(Panel.fit(
        f"[bold]{workflow.name}[/bold]\n"
        f"[dim]{workflow.description}[/dim]\n"
        f"\nStages: {len(workflow.stages)} | Variables: {len(workflow.variables)}",
        title="Workflow",
        border_style="blue",
    ))

    # Collect variable inputs
    inputs: dict[str, str] = {}
    if workflow.variables:
        console.print("\n[bold]Variables:[/bold]")
        for var in workflow.variables:
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

    # Validate inputs
    is_valid, errors = workflow.validate_inputs(inputs)
    if not is_valid:
        console.print("[red]Validation errors:[/red]")
        for error in errors:
            console.print(f"  • {error}")
        raise typer.Exit(1)

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
