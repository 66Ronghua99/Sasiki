"""Command for managing the Sasiki WebSocket server."""

import asyncio
import json

import typer
import websockets
from rich.console import Console
from rich.panel import Panel

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
def server(
    action: str = typer.Argument("start", help="Action: start, status"),
    port: int = typer.Option(8766, "--port", "-p", help="Server port"),
    host: str = typer.Option("localhost", "--host", help="Server host"),
) -> None:
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
        async def check_status() -> None:
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
