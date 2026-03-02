"""Command for starting a browser recording session."""

import asyncio
import signal
import uuid
from typing import Any

import typer
import websockets
from rich.console import Console

from sasiki.commands.ui import print_header
from sasiki.server.message_codec import WSMessageCodec, WSMessageCodecError
from sasiki.server.websocket_protocol import WSMessageType

app = typer.Typer()
console = Console()


@app.command()
def record(
    name: str = typer.Option(None, "--name", "-n", help="Recording name"),
    ws_port: int = typer.Option(8766, "--ws-port", help="WebSocket server port"),
) -> None:
    """Start a browser recording session.

    Records user interactions from the Chrome Extension and saves them
    for later skill generation.
    """
    print_header()

    async def run_recording() -> None:
        uri = f"ws://localhost:{ws_port}"

        try:
            async with websockets.connect(uri) as websocket:
                # Register as CLI client
                await websocket.send(WSMessageCodec.build_register(client="cli"))

                session_id = name or str(uuid.uuid4())[:8]
                console.print(f"\n[green]Starting recording session: {session_id}[/green]")
                console.print("[dim]Please use the Chrome Extension to record your actions.[/dim]")
                console.print("[dim]Press Ctrl+C to stop recording.[/dim]\n")

                # Send start command
                await websocket.send(WSMessageCodec.build_control(
                    command="start",
                    session_id=session_id,
                ))

                # Wait for start confirmation
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    response_str = response.decode() if isinstance(response, bytes) else response
                    message = WSMessageCodec.parse_incoming(response_str)
                    if message.type == WSMessageType.CONTROL_RESPONSE and message.payload.get("success"):
                        console.print("[dim]Recording started successfully[/dim]\n")
                    elif message.type == WSMessageType.CONTROL_RESPONSE and not message.payload.get("success"):
                        console.print(f"[red]Failed to start recording: {message.payload.get('error')}[/red]")
                        return
                except asyncio.TimeoutError:
                    console.print("[yellow]No confirmation from server, continuing...[/yellow]")
                except WSMessageCodecError as e:
                    console.print(f"[yellow]Invalid message from server: {e}[/yellow]")

                # Keep connection open, display incoming actions
                stop_requested = False

                def signal_handler(sig: int, frame: Any) -> None:
                    nonlocal stop_requested
                    stop_requested = True
                    console.print("\n[yellow]Stopping recording...[/yellow]")

                # Set up signal handler for graceful shutdown
                if hasattr(signal, 'SIGINT'):
                    signal.signal(signal.SIGINT, signal_handler)

                try:
                    while not stop_requested:
                        try:
                            raw = await asyncio.wait_for(websocket.recv(), timeout=0.5)
                            raw_str = raw.decode() if isinstance(raw, bytes) else raw
                            try:
                                message = WSMessageCodec.parse_incoming(raw_str)
                            except WSMessageCodecError:
                                continue

                            if message.type == WSMessageType.ACTION_LOGGED:
                                action = message.payload.get("action", {})
                                action_type = action.get('type', 'unknown')
                                target = action.get('target', 'unknown')
                                console.print(f"  [blue]{action_type}[/blue]: {target[:40] if target else 'N/A'}")
                            elif message.type == WSMessageType.ERROR:
                                payload = message.payload or {}
                                console.print(f"  [red]Error: {payload.get('message', 'Unknown error')}[/red]")
                        except asyncio.TimeoutError:
                            continue

                except websockets.exceptions.ConnectionClosed:
                    console.print("\n[yellow]Connection to server closed.[/yellow]")
                    return

                # Send stop command
                await websocket.send(WSMessageCodec.build_control(command="stop"))

                # Wait for stop confirmation with filepath
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    response_str = response.decode() if isinstance(response, bytes) else response
                    try:
                        message = WSMessageCodec.parse_incoming(response_str)
                        if message.type == WSMessageType.CONTROL_RESPONSE and message.payload.get("success"):
                            filepath = message.payload.get("filepath")
                            if filepath:
                                console.print(f"\n[green]Recording saved to:[/green] {filepath}")
                            else:
                                console.print("\n[green]Recording saved.[/green]")
                        else:
                            console.print("\n[yellow]Recording stopped (no confirmation).[/yellow]")
                    except WSMessageCodecError:
                        console.print("\n[yellow]Recording stopped (invalid confirmation).[/yellow]")
                except asyncio.TimeoutError:
                    console.print("\n[yellow]Recording stopped (timeout waiting for confirmation).[/yellow]")

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
