"""Command for refining (rehearsing) a workflow."""

import asyncio
from uuid import UUID
from typing import Optional

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from sasiki.workflow.storage import WorkflowStorage
from sasiki.engine.workflow_refiner import WorkflowRefiner
from sasiki.utils.logger import logger

app = typer.Typer()
console = Console()


def _print_header():
    """Print the application header."""
    console.print(Panel.fit(
        "[bold blue]Sasiki[/bold blue] - Workflow Refiner\n"
        "[dim]试运行并提纯 Workflow，产出 *_final.yaml[/dim]",
        border_style="blue",
    ))


@app.command()
def refine(
    workflow_id: str = typer.Argument(..., help="Workflow ID or name"),
    inputs: Optional[list[str]] = typer.Option(None, "--input", "-i", help="Variable inputs as key=value"),
    headless: bool = typer.Option(False, "--headless", help="Run browser in headless mode"),
    cdp_url: Optional[str] = typer.Option(None, "--cdp-url", help="Connect to existing browser via CDP"),
    user_data_dir: Optional[str] = typer.Option(None, "--user-data-dir", help="Path to Chrome user data directory"),
    start_stage: int = typer.Option(0, "--start-stage", help="Start from specific stage index (for resuming)"),
    skip_checkpoints: bool = typer.Option(False, "--skip-checkpoints", help="Skip all checkpoints"),
    max_steps: int = typer.Option(20, "--max-steps", help="Maximum steps per stage"),
    output_suffix: str = typer.Option("final", "--output-suffix", help="Suffix for output workflow file"),
):
    """试运行并提纯 Workflow，产出 *_final.yaml

    This is the Phase 3 "Rehearsal" execution engine. It runs the workflow
    stage by stage with an Agent, handles checkpoints, and produces a
    validated workflow file.

    Examples:
        sasiki refine my-workflow
        sasiki refine my-workflow -i search_query=python -i count=5
        sasiki refine my-workflow --cdp-url http://localhost:9222
        sasiki refine my-workflow --start-stage 2
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

    # Parse and collect variable inputs
    parsed_inputs: dict[str, str] = {}
    if inputs:
        for input_str in inputs:
            if "=" not in input_str:
                console.print(f"[red]Invalid input format: {input_str}. Use key=value[/red]")
                raise typer.Exit(1)
            key, value = input_str.split("=", 1)
            parsed_inputs[key] = value

    # Collect remaining variables interactively
    if workflow.variables:
        console.print("\n[bold]Variables:[/bold]")
        for var in workflow.variables:
            if var.name in parsed_inputs:
                # Already provided via --input
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
                parsed_inputs[var.name] = value

    # Validate inputs
    is_valid, errors = workflow.validate_inputs(parsed_inputs)
    if not is_valid:
        console.print("[red]Validation errors:[/red]")
        for error in errors:
            console.print(f"  • {error}")
        raise typer.Exit(1)

    # Show execution config
    console.print("\n[bold]Execution Configuration:[/bold]")
    config_table = Table(show_header=False, box=None)
    config_table.add_row("  Headless:", "Yes" if headless else "No")
    config_table.add_row("  CDP URL:", cdp_url or "None (will launch new browser)")
    config_table.add_row("  Start Stage:", str(start_stage + 1))
    config_table.add_row("  Max Steps/Stage:", str(max_steps))
    config_table.add_row("  Checkpoints:", "Skipped" if skip_checkpoints else "Enabled")
    config_table.add_row("  Output Suffix:", output_suffix)
    console.print(config_table)

    # Confirm execution
    if not headless:
        console.print("\n[dim]A browser window will open for visual feedback.[/dim]")
    console.print("\n[yellow]Press Ctrl+C at any time to stop execution.[/yellow]")

    # Run the refiner
    async def _run_refinement():
        refiner = WorkflowRefiner(
            headless=headless,
            cdp_url=cdp_url,
            user_data_dir=user_data_dir,
            max_steps_per_stage=max_steps,
            enable_checkpoints=not skip_checkpoints,
        )

        return await refiner.run(
            workflow=workflow,
            inputs=parsed_inputs,
            start_stage=start_stage,
            output_suffix=output_suffix,
        )

    try:
        result = asyncio.run(_run_refinement())
    except KeyboardInterrupt:
        console.print("\n\n[yellow]Execution interrupted by user.[/yellow]")
        raise typer.Exit(130)
    except Exception as e:
        logger.error("refinement_failed", error=str(e))
        console.print(f"\n[red]Refinement failed: {e}[/red]")
        raise typer.Exit(1)

    # Display results
    console.print("\n" + "=" * 50)
    console.print("[bold]Execution Results[/bold]")
    console.print("=" * 50)

    # Stage results table
    results_table = Table(title="Stage Results")
    results_table.add_column("#", style="cyan", justify="right")
    results_table.add_column("Stage Name", style="white")
    results_table.add_column("Status", style="bold")
    results_table.add_column("Steps", justify="right")

    status_colors = {
        "success": "green",
        "failed": "red",
        "skipped": "dim",
        "paused": "yellow",
    }

    for i, stage_result in enumerate(result.stage_results, 1):
        status_color = status_colors.get(stage_result.status, "white")
        status_text = f"[{status_color}]{stage_result.status.upper()}[/{status_color}]"
        results_table.add_row(
            str(i),
            stage_result.stage_name,
            status_text,
            str(stage_result.steps_taken),
        )

    console.print(results_table)

    # Summary
    console.print(f"\nTotal Steps: {result.total_steps}")

    # Final status
    if result.status == "completed":
        console.print(f"\n[green bold]✓ Refinement completed successfully![/green bold]")
        if result.final_workflow_path:
            console.print(f"[dim]Final workflow saved to:[/dim] {result.final_workflow_path}")
    elif result.status == "paused":
        console.print(f"\n[yellow bold]⏸️  Refinement paused at checkpoint[/yellow bold]")
        if result.final_workflow_path:
            console.print(f"[dim]Progress saved to:[/dim] {result.final_workflow_path}")
        console.print(f"[dim]Resume with: --start-stage {len([r for r in result.stage_results if r.status != 'skipped'])}[/dim]")
    else:  # failed
        console.print(f"\n[red bold]✗ Refinement failed[/red bold]")
        # Find first failed stage
        for stage_result in result.stage_results:
            if stage_result.status == "failed" and stage_result.error:
                console.print(f"[red]Error in stage '{stage_result.stage_name}': {stage_result.error}[/red]")
                break
