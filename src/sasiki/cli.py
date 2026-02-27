"""Command-line interface for Sasiki."""

import asyncio
import json
import signal
import uuid
from pathlib import Path
from uuid import UUID

import typer
import websockets
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import box

from sasiki.workflow.storage import WorkflowStorage
from sasiki.utils.logger import configure_logging

# Configure logging
configure_logging()

app = typer.Typer(
    name="sasiki",
    help="观察用户操作，自动生成可复用的工作流 Agent",
    no_args_is_help=True,
)
console = Console()


def _print_header():
    """Print the application header."""
    console.print(Panel.fit(
        "[bold blue]Sasiki[/bold blue] - 工作流摹刻 Agent\n"
        "[dim]观察一次，永久复用[/dim]",
        border_style="blue",
    ))


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


@app.command()
def show(
    workflow_id: str = typer.Argument(..., help="Workflow ID or name"),
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
    workflow_id: str = typer.Argument(..., help="Workflow ID"),
    force: bool = typer.Option(False, "--force", "-f", help="Skip confirmation"),
):
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


@app.command()
def run(
    workflow_id: str = typer.Argument(..., help="Workflow ID or name"),
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
        console.print("\n[dim]Phase 2 execution engine is in development.[/dim]")
        console.print("The execution plan has been prepared but not executed.")


@app.command()
def record(
    name: str = typer.Option(None, "--name", "-n", help="Recording name"),
    ws_port: int = typer.Option(8766, "--ws-port", help="WebSocket server port"),
):
    """Start a browser recording session.

    Records user interactions from the Chrome Extension and saves them
    for later skill generation.
    """
    _print_header()

    async def run_recording():
        uri = f"ws://localhost:{ws_port}"

        try:
            async with websockets.connect(uri) as websocket:
                # Register as CLI client
                await websocket.send(json.dumps({
                    "type": "register",
                    "client": "cli"
                }))

                session_id = name or str(uuid.uuid4())[:8]
                console.print(f"\n[green]Starting recording session: {session_id}[/green]")
                console.print("[dim]Please use the Chrome Extension to record your actions.[/dim]")
                console.print("[dim]Press Ctrl+C to stop recording.[/dim]\n")

                # Send start command
                await websocket.send(json.dumps({
                    "type": "control",
                    "command": "start",
                    "session_id": session_id
                }))

                # Wait for start confirmation
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    data = json.loads(response)
                    if data.get("type") == "control_response" and data.get("success"):
                        console.print(f"[dim]Recording started successfully[/dim]\n")
                    elif data.get("type") == "control_response" and not data.get("success"):
                        console.print(f"[red]Failed to start recording: {data.get('error')}[/red]")
                        return
                except asyncio.TimeoutError:
                    console.print("[yellow]No confirmation from server, continuing...[/yellow]")

                # Keep connection open, display incoming actions
                stop_requested = False

                def signal_handler(sig, frame):
                    nonlocal stop_requested
                    stop_requested = True
                    console.print("\n[yellow]Stopping recording...[/yellow]")

                # Set up signal handler for graceful shutdown
                if hasattr(signal, 'SIGINT'):
                    signal.signal(signal.SIGINT, signal_handler)

                try:
                    while not stop_requested:
                        try:
                            message = await asyncio.wait_for(websocket.recv(), timeout=0.5)
                            data = json.loads(message)

                            if data.get("type") == "action_logged":
                                action = data.get("action", {})
                                action_type = action.get('type', 'unknown')
                                target = action.get('target', 'unknown')
                                console.print(f"  [blue]{action_type}[/blue]: {target[:40] if target else 'N/A'}")
                            elif data.get("type") == "error":
                                console.print(f"  [red]Error: {data.get('payload', {}).get('message', 'Unknown error')}[/red]")
                        except asyncio.TimeoutError:
                            continue

                except websockets.exceptions.ConnectionClosed:
                    console.print("\n[yellow]Connection to server closed.[/yellow]")
                    return

                # Send stop command
                await websocket.send(json.dumps({
                    "type": "control",
                    "command": "stop"
                }))

                # Wait for stop confirmation with filepath
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    data = json.loads(response)
                    if data.get("type") == "control_response" and data.get("success"):
                        filepath = data.get("filepath")
                        if filepath:
                            console.print(f"\n[green]Recording saved to:[/green] {filepath}")
                        else:
                            console.print(f"\n[green]Recording saved.[/green]")
                    else:
                        console.print(f"\n[yellow]Recording stopped (no confirmation).[/yellow]")
                except asyncio.TimeoutError:
                    console.print(f"\n[yellow]Recording stopped (timeout waiting for confirmation).[/yellow]")

        except OSError:
            console.print("[red]Error: Cannot connect to WebSocket server.[/red]")
            console.print("[dim]Please run: sasiki server start[/dim]")
            raise typer.Exit(1)
        except Exception as e:
            console.print(f"[red]Error during recording: {e}[/red]")
            raise typer.Exit(1)

    try:
        asyncio.run(run_recording())
    except KeyboardInterrupt:
        console.print("\n[yellow]Recording interrupted by user.[/yellow]")


@app.command()
def server(
    action: str = typer.Argument("start", help="Action: start, status"),
    port: int = typer.Option(8766, "--port", "-p", help="Server port"),
    host: str = typer.Option("localhost", "--host", help="Server host"),
):
    """Manage the Sasiki WebSocket server.

    The WebSocket server facilitates communication between the Chrome Extension
    and the Python backend for recording browser actions.
    """
    if action == "start":
        from sasiki.server.websocket_server import WebSocketServer

        console.print(Panel.fit(
            f"[bold blue]Sasiki WebSocket Server[/bold blue]\n"
            f"[dim]ws://{host}:{port}[/dim]",
            border_style="blue",
        ))

        ws_server = WebSocketServer(host=host, port=port)

        try:
            asyncio.run(ws_server.start())
        except KeyboardInterrupt:
            console.print("\n[yellow]Shutting down server...[/yellow]")
            asyncio.run(ws_server.stop())

    elif action == "status":
        # Quick check if server is running
        async def check_status():
            try:
                async with websockets.connect(f"ws://{host}:{port}") as ws:
                    await ws.send(json.dumps({
                        "type": "register",
                        "client": "cli"
                    }))
                    console.print("[green]Server is running[/green] at " + f"ws://{host}:{port}")
            except Exception:
                console.print("[red]Server is not running[/red]")
                console.print(f"[dim]Start it with: sasiki server start --port {port}[/dim]")

        asyncio.run(check_status())
    else:
        console.print(f"[red]Unknown action: {action}[/red]")
        console.print("[dim]Available actions: start, status[/dim]")
        raise typer.Exit(1)


def main():
    """Entry point for the CLI."""
    app()


if __name__ == "__main__":
    main()
