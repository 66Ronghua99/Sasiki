"""Command-line interface for Sasiki."""

from pathlib import Path
from uuid import UUID

import typer
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from sasiki.analyzer.session_analyzer import SessionAnalyzer
from sasiki.recorder.capture import ScreenRecorder
from sasiki.utils.logger import configure_logging
from sasiki.workflow.storage import WorkflowStorage

# Configure logging
configure_logging()

app = typer.Typer(
    name="sasiki",
    help="观察用户操作，自动生成可复用的工作流 Agent",
    no_args_is_help=True,
)
console = Console()
RECORDING_PATH_ARGUMENT = typer.Argument(..., help="Path to recording directory")
WORKFLOW_ID_OR_NAME_ARGUMENT = typer.Argument(..., help="Workflow ID or name")
WORKFLOW_ID_ARGUMENT = typer.Argument(..., help="Workflow ID")
AGENT_TASK_ARGUMENT = typer.Argument(..., help="Natural language browser task")
CHROME_PROFILE_DIR_OPTION = typer.Option(
    Path("~/.sasiki/chrome_profile"),
    "--chrome-profile-dir",
    help="Chrome user profile directory",
)
COOKIES_DIR_OPTION = typer.Option(
    Path("~/.sasiki/cookies"),
    "--cookies-dir",
    help="Directory containing cookies JSON files",
)


def _print_header():
    """Print the application header."""
    console.print(Panel.fit(
        "[bold blue]Sasiki[/bold blue] - 工作流摹刻 Agent\n"
        "[dim]观察一次，永久复用[/dim]",
        border_style="blue",
    ))


@app.command()
def record(
    name: str | None = typer.Option(None, "--name", "-n", help="Recording name"),
    description: str | None = typer.Option(None, "--desc", "-d", help="Description"),
):
    """Start a new recording session."""
    _print_header()

    recorder = ScreenRecorder()

    # Start recording
    session = recorder.start_recording(name=name, description=description)

    console.print("\n[green]🔴 Recording started[/green]")
    console.print(f"Session ID: {session.metadata.id}")
    console.print(f"Save location: {session.base_path}")
    console.print("\n[yellow]Press Ctrl+C to stop recording[/yellow]")

    try:
        # Wait for interrupt
        import time
        while recorder.is_recording:
            time.sleep(0.1)
    except KeyboardInterrupt:
        pass
    finally:
        if recorder.is_recording:
            session = recorder.stop_recording()

        # Print summary
        console.print("\n[green]✓ Recording stopped[/green]")
        console.print(f"Duration: {session.metadata.duration_seconds:.1f}s")
        console.print(f"Events: {session.metadata.total_events}")
        console.print(f"Screenshots: {session.metadata.total_screenshots}")
        console.print(f"Apps used: {', '.join(session.metadata.apps_used) or 'None detected'}")

        # Offer to analyze
        if typer.confirm("\nAnalyze this recording to create a workflow?"):
            analyze_recording(session.base_path)


@app.command()
def analyze(
    recording_path: Path = RECORDING_PATH_ARGUMENT,
):
    """Analyze a recording to extract a workflow."""
    analyze_recording(recording_path)


def analyze_recording(recording_path: Path):
    """Analyze a recording and save the workflow."""
    import json

    from sasiki.recorder.events import RecordingMetadata, RecordingSession

    console.print(f"\n[blue]Analyzing recording: {recording_path}[/blue]")

    # Load session
    metadata_path = recording_path / "metadata.json"
    events_path = recording_path / "events.jsonl"
    screenshots_dir = recording_path / "screenshots"

    if not metadata_path.exists():
        console.print("[red]Error: metadata.json not found[/red]")
        raise typer.Exit(1)

    with open(metadata_path) as f:
        metadata = RecordingMetadata(**json.load(f))

    session = RecordingSession(
        metadata=metadata,
        base_path=recording_path,
        screenshots_dir=screenshots_dir,
    )

    # Load events
    if events_path.exists():
        with open(events_path) as f:
            for line in f:
                from sasiki.recorder.events import Event
                session.events.append(Event(**json.loads(line)))

    # Analyze
    with console.status("[bold green]Analyzing with VLM..."):
        analyzer = SessionAnalyzer()
        workflow = analyzer.analyze_session(session)

    # Display results
    console.print(f"\n[green]✓ Workflow extracted:[/green] {workflow.name}")
    console.print(f"Description: {workflow.description}")
    console.print(f"\nStages ({len(workflow.stages)}):")

    table = Table(box=box.SIMPLE)
    table.add_column("#", style="dim")
    table.add_column("Stage")
    table.add_column("Application")
    table.add_column("Actions")

    for i, stage in enumerate(workflow.stages, 1):
        table.add_row(
            str(i),
            stage.name,
            stage.application or "-",
            str(len(stage.actions)),
        )

    console.print(table)

    if workflow.variables:
        console.print(f"\nVariables ({len(workflow.variables)}):")
        for var in workflow.variables:
            console.print(f"  • {var.name} ({var.var_type.value}): {var.description}")
            if var.example:
                console.print(f"    Example: {var.example}")

    if workflow.checkpoints:
        console.print(f"\nCheckpoints ({len(workflow.checkpoints)}):")
        for cp in workflow.checkpoints:
            console.print(f"  • After stage {cp.after_stage}: {cp.description}")

    # Save
    storage = WorkflowStorage()
    workflow_path = storage.save(workflow)

    console.print(f"\n[green]✓ Workflow saved to:[/green] {workflow_path}")
    console.print(f"Workflow ID: {workflow.id}")


@app.command()
def list(
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Show detailed info"),
):
    """List all saved workflows."""
    _print_header()

    storage = WorkflowStorage()
    workflows = storage.list_workflows()

    if not workflows:
        console.print("\n[yellow]No workflows found.[/yellow]")
        console.print("Create one with: sasiki record")
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


@app.command()
def show(
    workflow_id: str = WORKFLOW_ID_OR_NAME_ARGUMENT,
):
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


@app.command()
def delete(
    workflow_id: str = WORKFLOW_ID_ARGUMENT,
    force: bool = typer.Option(False, "--force", "-f", help="Skip confirmation"),
):
    """Delete a workflow."""
    try:
        wf_id = UUID(workflow_id)
    except ValueError as err:
        console.print("[red]Invalid workflow ID format[/red]")
        raise typer.Exit(1) from err

    storage = WorkflowStorage()
    workflow = storage.load(wf_id)

    if not workflow:
        console.print(f"[red]Workflow not found: {workflow_id}[/red]")
        raise typer.Exit(1)

    if not force and not typer.confirm(f"Delete workflow '{workflow.name}'?"):
        console.print("Cancelled.")
        raise typer.Exit(0)

    storage.delete(wf_id)
    console.print(f"[green]✓ Deleted workflow: {workflow.name}[/green]")


@app.command()
def run(
    workflow_id: str = WORKFLOW_ID_OR_NAME_ARGUMENT,
    dry_run: bool = typer.Option(True, "--dry-run/--execute", help="Preview execution plan without running"),
):
    """Run a workflow.

    Currently in Phase 2 development. Use --execute to attempt actual execution
    (requires Phase 2 execution engine), or use --dry-run (default) to preview.
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
    except ValueError as err:
        console.print(f"[red]Error creating execution plan: {err}[/red]")
        raise typer.Exit(1) from err

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
        console.print("\n[dim]Phase 2 execution engine is in development.[/dim]")
        console.print("The execution plan has been prepared but not executed.")


@app.command("agent")
def run_browser_agent(
    task: str = AGENT_TASK_ARGUMENT,
    max_steps: int = typer.Option(12, "--max-steps", help="Maximum agent steps"),
    max_stall_steps: int = typer.Option(3, "--max-stall-steps", help="Stop after N no-progress steps"),
    max_failures: int = typer.Option(2, "--max-failures", help="Stop after N consecutive failures"),
    launch_cdp: bool = typer.Option(True, "--launch-cdp/--no-launch-cdp", help="Launch local CDP browser"),
    cdp_endpoint: str | None = typer.Option(None, "--cdp-endpoint", help="CDP endpoint for Playwright MCP"),
    chrome_profile_dir: Path = CHROME_PROFILE_DIR_OPTION,
    cookies_dir: Path = COOKIES_DIR_OPTION,
    headless: bool = typer.Option(True, "--headless/--headed", help="Run browser in headless mode"),
    mcp_command: str = typer.Option("npx", "--mcp-command", help="MCP server command"),
    mcp_args: str = typer.Option("@playwright/mcp@latest", "--mcp-args", help="MCP server args"),
):
    """Run a minimal Playwright MCP browser agent loop."""
    from sasiki.agent.browser_agent import AgentRunStatus, BrowserAgent
    from sasiki.agent.mcp_client import MCPStdioClient
    from sasiki.browser import DEFAULT_CDP_ENDPOINT, CdpBrowserLauncher, is_local_cdp_endpoint
    from sasiki.llm.client import LLMClient

    _print_header()
    console.print(Panel.fit(task, title="Agent Task", border_style="cyan"))

    import os
    import shlex
    from urllib.parse import urlparse

    args = shlex.split(mcp_args)
    if headless and "--headless" not in args:
        args.append("--headless")

    effective_cdp_endpoint = cdp_endpoint or os.getenv("PLAYWRIGHT_MCP_CDP_ENDPOINT", DEFAULT_CDP_ENDPOINT)
    os.environ["PLAYWRIGHT_MCP_CDP_ENDPOINT"] = effective_cdp_endpoint
    if "--cdp-endpoint" not in args:
        args.extend(["--cdp-endpoint", effective_cdp_endpoint])

    mcp_env: dict[str, str] = {"PLAYWRIGHT_MCP_CDP_ENDPOINT": effective_cdp_endpoint}
    if is_local_cdp_endpoint(effective_cdp_endpoint):
        local_hosts = {"localhost", "127.0.0.1", "::1"}
        endpoint_host = urlparse(effective_cdp_endpoint).hostname
        if endpoint_host:
            local_hosts.add(endpoint_host)
        no_proxy = ",".join(sorted(local_hosts))
        mcp_env["NO_PROXY"] = no_proxy
        mcp_env["no_proxy"] = no_proxy

    browser_launcher: CdpBrowserLauncher | None = None
    try:
        if launch_cdp:
            if not is_local_cdp_endpoint(effective_cdp_endpoint):
                raise ValueError(f"CDP auto launch requires local endpoint, got: {effective_cdp_endpoint}")

            browser_launcher = CdpBrowserLauncher(
                cdp_endpoint=effective_cdp_endpoint,
                user_data_dir=chrome_profile_dir,
                cookies_dir=cookies_dir,
                headless=headless,
            )
            launch_result = browser_launcher.start()
            console.print(
                "[dim]CDP browser ready:[/dim] "
                f"{effective_cdp_endpoint} | "
                f"profile={Path(chrome_profile_dir).expanduser()} | "
                f"cookies={launch_result.cookies_injected}"
            )
        else:
            console.print(f"[dim]Using existing CDP endpoint:[/dim] {effective_cdp_endpoint}")

        with console.status("[bold green]Starting Playwright MCP..."), MCPStdioClient(
            command=mcp_command, args=args, env=mcp_env
        ) as mcp_client:
            agent = BrowserAgent(
                llm=LLMClient(),
                mcp=mcp_client,
                max_steps=max_steps,
                max_stall_steps=max_stall_steps,
                max_failures=max_failures,
            )
            result = agent.run(task)
    except Exception as e:
        console.print(f"[red]Agent run failed to start: {e}[/red]")
        raise typer.Exit(1) from e
    finally:
        if browser_launcher is not None:
            browser_launcher.stop()

    console.print(f"\n[bold]Result:[/bold] {result.status.value} - {result.finish_reason}")
    console.print(f"[dim]Steps executed: {len(result.steps)}[/dim]\n")

    steps_table = Table(box=box.SIMPLE)
    steps_table.add_column("#", style="dim", width=4)
    steps_table.add_column("Action")
    steps_table.add_column("Tool")
    steps_table.add_column("Progress")
    steps_table.add_column("Note", max_width=70)

    for step in result.steps:
        progress = "yes" if step.progressed else "no"
        note = step.error or step.reason or step.result_excerpt
        steps_table.add_row(
            str(step.step_index),
            step.action,
            step.tool_name or "-",
            progress,
            note or "-",
        )
    console.print(steps_table)

    if result.status == AgentRunStatus.COMPLETED:
        console.print("\n[green]✓ Agent completed the task[/green]")
    elif result.status == AgentRunStatus.STALLED:
        console.print("\n[yellow]⚠ Agent stalled (no observable progress)[/yellow]")
    else:
        console.print("\n[red]✗ Agent did not complete the task[/red]")


def main():
    """Entry point for the CLI."""
    app()


if __name__ == "__main__":
    main()
