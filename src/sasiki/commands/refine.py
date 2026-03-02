"""Command for refining (rehearsing) a workflow."""

import asyncio
from typing import Optional, Any

import typer
from rich.console import Console
from rich.table import Table

from sasiki.commands.handlers import CLIInteractiveHandler
from sasiki.commands.ui import print_header, print_workflow_panel
from sasiki.commands.workflow_inputs import (
    collect_workflow_inputs,
    load_workflow_by_id_or_name,
    parse_cli_inputs,
    validate_and_report_errors,
)
from sasiki.engine.handlers.auto import NonInteractiveHandler
from sasiki.engine.human_interface import HumanDecision, HumanInteractionHandler
from sasiki.engine.workflow_refiner import WorkflowRefiner
from sasiki.utils.logger import get_logger
from sasiki.workflow.storage import WorkflowStorage

app = typer.Typer()
console = Console()


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
    no_interactive: bool = typer.Option(False, "--no-interactive", help="Disable interactive mode (for automation)"),
    on_hitl: str = typer.Option("abort", "--on-hitl", help="Default action when HITL is triggered in non-interactive mode: abort, continue, skip"),
) -> None:
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
    workflow = load_workflow_by_id_or_name(storage, workflow_id, console)

    print_header(
        subtitle="Workflow Refiner",
        tagline="试运行并提纯 Workflow，产出 *_final.yaml",
        console=console,
    )
    print_workflow_panel(workflow, console)

    # Parse CLI inputs and collect remaining variables interactively
    parsed_inputs = parse_cli_inputs(inputs, console)
    parsed_inputs = collect_workflow_inputs(workflow, console, parsed_inputs)
    validate_and_report_errors(workflow, parsed_inputs, console)

    # Show execution config
    console.print("\n[bold]Execution Configuration:[/bold]")
    config_table = Table(show_header=False, box=None)
    config_table.add_row("  Headless:", "Yes" if headless else "No")
    config_table.add_row("  CDP URL:", cdp_url or "None (will launch new browser)")
    config_table.add_row("  Start Stage:", str(start_stage + 1))
    config_table.add_row("  Max Steps/Stage:", str(max_steps))
    config_table.add_row("  Checkpoints:", "Skipped" if skip_checkpoints else "Enabled")
    config_table.add_row("  Output Suffix:", output_suffix)
    config_table.add_row("  Interactive:", "No" if no_interactive else "Yes")
    if no_interactive:
        config_table.add_row("  On HITL:", on_hitl)
    console.print(config_table)

    # Confirm execution
    if not headless:
        console.print("\n[dim]A browser window will open for visual feedback.[/dim]")
    console.print("\n[yellow]Press Ctrl+C at any time to stop execution.[/yellow]")

    # Create the appropriate handler based on options
    handler: HumanInteractionHandler
    if no_interactive:
        try:
            hitl_default = HumanDecision(on_hitl)
        except ValueError:
            console.print(f"[red]Invalid --on-hitl value: {on_hitl}. Use: abort, continue, skip[/red]")
            raise typer.Exit(1)
        handler = NonInteractiveHandler(hitl_default=hitl_default)
    else:
        handler = CLIInteractiveHandler()

    # Run the refiner
    async def _run_refinement() -> Any:
        refiner = WorkflowRefiner(
            headless=headless,
            cdp_url=cdp_url,
            user_data_dir=user_data_dir,
            max_steps_per_stage=max_steps,
            enable_checkpoints=not skip_checkpoints,
            human_handler=handler,
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
        get_logger().error("refinement_failed", error=str(e))
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
        console.print("\n[green bold]✓ Refinement completed successfully![/green bold]")
        if result.final_workflow_path:
            console.print(f"[dim]Final workflow saved to:[/dim] {result.final_workflow_path}")
    elif result.status == "paused":
        console.print("\n[yellow bold]⏸️  Refinement paused at checkpoint[/yellow bold]")
        if result.final_workflow_path:
            console.print(f"[dim]Progress saved to:[/dim] {result.final_workflow_path}")
        console.print(f"[dim]Resume with: --start-stage {len([r for r in result.stage_results if r.status != 'skipped'])}[/dim]")
    else:  # failed
        console.print("\n[red bold]✗ Refinement failed[/red bold]")
        # Find first failed stage
        for stage_result in result.stage_results:
            if stage_result.status == "failed" and stage_result.error:
                console.print(f"[red]Error in stage '{stage_result.stage_name}': {stage_result.error}[/red]")
                break
