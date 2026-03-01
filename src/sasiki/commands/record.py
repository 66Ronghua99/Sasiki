"""Command for starting a browser recording session."""

import asyncio
import json
import signal
import uuid
import typer
import websockets
from rich.console import Console
from rich.panel import Panel

app = typer.Typer()
console = Console()


def _print_header():
    """Print the application header."""
    console.print(Panel.fit(
        "[bold blue]Sasiki[/bold blue] - 工作流摹刻 Agent\n"
        "[dim]观察一次，永久复用[/dim]",
        border_style="blue",
    ))


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
