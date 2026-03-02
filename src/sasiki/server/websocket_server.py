"""WebSocket server for Sasiki Extension <-> Python communication.

This server handles bidirectional communication between the Chrome Extension
(recording layer) and the Python backend (Agent service layer).
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

import structlog
import websockets

from sasiki.server.message_codec import WSMessageCodec, WSMessageCodecError
from sasiki.server.message_policy import MessagePolicy, MessagePolicyViolation
from sasiki.server.websocket_protocol import (
    RecordedAction,
    WSMessage,
    WSMessageType,
)
from sasiki.server.recording_session import RecordingSession

logger = structlog.get_logger(__name__)

# Type alias for message handlers
MessageHandler = Callable[[Any, WSMessage, Optional[str]], Any]


class WebSocketServer:
    """WebSocket server for Extension <-> Python communication."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 8766,
        recordings_dir: Optional[Path] = None,
    ) -> None:
        self.host = host
        self.port = port
        self.recordings_dir = recordings_dir or Path.home() / ".sasiki" / "recordings" / "browser"

        # Connected clients
        self.extension_ws: Optional[Any] = None
        self.cli_ws: Optional[Any] = None

        # Recording state
        self.current_session: Optional[RecordingSession] = None
        self.sessions: dict[str, RecordingSession] = {}

        # Server state
        self._server: Optional[asyncio.Server] = None
        self._shutdown_event = asyncio.Event()

        # Message handler registry: maps message types to handlers
        self._handlers: dict[WSMessageType, MessageHandler] = {
            WSMessageType.REGISTER: self._handle_register,
            WSMessageType.ACTION: self._handle_action_message,
            WSMessageType.CONTROL: self._handle_control_message,
        }

    async def handle_client(
        self, websocket: Any, path: Optional[str] = None
    ) -> None:
        """Handle a WebSocket client connection."""
        client_type: Optional[str] = None
        client_info = f"{websocket.remote_address}"

        logger.info("client_connected", client=client_info)

        try:
            async for message in websocket:
                try:
                    ws_message = WSMessageCodec.parse_incoming(message)
                    client_type = await self._handle_message(websocket, ws_message, client_type)
                except WSMessageCodecError as e:
                    logger.error("invalid_message", error=str(e), client=client_info)
                    await self._send_error(websocket, f"Invalid message: {e}")
                except Exception as e:
                    logger.error("message_handler_error", error=str(e), client=client_info)
                    await self._send_error(websocket, f"Error processing message: {e}")

        except websockets.exceptions.ConnectionClosed:
            logger.info("client_disconnected", client=client_info, type=client_type)
        except Exception as e:
            logger.error("connection_error", error=str(e), client=client_info)
        finally:
            # Clean up client reference
            if client_type == "extension" and self.extension_ws is websocket:
                self.extension_ws = None
            elif client_type == "cli" and self.cli_ws is websocket:
                self.cli_ws = None

    async def _handle_message(
        self,
        websocket: Any,
        message: WSMessage,
        client_type: Optional[str],
    ) -> Optional[str]:
        """Handle a single message from a client using the handler registry."""
        msg_type = message.type

        # Validate sender policy (before processing)
        try:
            MessagePolicy.validate_sender(client_type, msg_type)
        except MessagePolicyViolation as e:
            logger.warning("policy_violation", error=str(e), client_type=client_type)
            await self._send_error(websocket, f"Policy violation: {e}")
            return client_type

        # Look up handler in registry
        handler = self._handlers.get(msg_type)
        if handler:
            return await handler(websocket, message, client_type)

        # Unknown message type
        logger.warning("unknown_message_type", type=msg_type.value, data=message.model_dump())
        return client_type

    async def _handle_register(
        self,
        websocket: Any,
        message: WSMessage,
        client_type: Optional[str],
    ) -> Optional[str]:
        """Handle REGISTER message from a client."""
        new_client_type = message.client
        if not MessagePolicy.is_valid_role(new_client_type):
            logger.warning("invalid_client_role", role=new_client_type)
            await self._send_error(websocket, f"Invalid client role: {new_client_type}")
            return None
        if new_client_type == "extension":
            self.extension_ws = websocket
            logger.info("extension_registered", client=f"{websocket.remote_address}")
        elif new_client_type == "cli":
            self.cli_ws = websocket
            logger.info("cli_registered", client=f"{websocket.remote_address}")
        return new_client_type

    async def _handle_action_message(
        self,
        websocket: Any,
        message: WSMessage,
        client_type: Optional[str],
    ) -> Optional[str]:
        """Handle ACTION message from extension."""
        payload = message.payload if isinstance(message.payload, dict) else {}
        await self._handle_action(payload)
        return client_type

    async def _handle_control_message(
        self,
        websocket: Any,
        message: WSMessage,
        client_type: Optional[str],
    ) -> Optional[str]:
        """Handle CONTROL message from CLI."""
        payload = message.payload if isinstance(message.payload, dict) else {}
        await self._handle_control(payload, websocket)
        return client_type

    async def _handle_action(self, payload: dict[str, Any]) -> None:
        """Handle an action message from the extension."""
        if not self.current_session:
            logger.warning("action_received_but_no_recording", payload=payload)
            return

        try:
            # Parse the action
            action = RecordedAction(**payload)

            # Add to current session
            await self.current_session.add_action(action)

            # Log the action
            target_name = action.target_hint.name if action.target_hint else "page"
            logger.info(
                "action_recorded",
                type=action.type.value,
                target=target_name[:30] if target_name else None,
                url=action.page_context.url[:50] if action.page_context else None,
            )

            # Forward to CLI for display
            if self.cli_ws:
                action_data = {
                    "type": action.type.value,
                    "target": target_name,
                    "timestamp": action.timestamp,
                }
                await self.cli_ws.send(
                    WSMessageCodec.build_action_logged(action_data)
                )

        except Exception as e:
            logger.error("action_parse_error", error=str(e), payload=payload)

    async def _handle_control(
        self, payload: dict[str, Any], source_ws: Any
    ) -> None:
        """Handle a control message (start/stop/pause recording)."""
        command = payload.get("command")
        session_id = payload.get("session_id") or payload.get("sessionId")

        if command in ("start", "START_RECORDING"):
            await self._start_recording(session_id)
            current_session_id = (
                self.current_session.session_id if self.current_session else None
            )

            # Forward to extension if connected
            if self.extension_ws:
                await self.extension_ws.send(
                    WSMessageCodec.build_control(
                        command="START_RECORDING",
                        session_id=current_session_id,
                    )
                )

            # Confirm to CLI
            await source_ws.send(
                WSMessageCodec.build_control_response(
                    command="start",
                    success=True,
                    session_id=current_session_id,
                )
            )

        elif command in ("stop", "STOP_RECORDING"):
            session_id = (
                self.current_session.session_id if self.current_session else None
            )

            # Stop the recording
            filepath = await self._stop_recording()

            # Forward to extension if connected
            if self.extension_ws:
                await self.extension_ws.send(
                    WSMessageCodec.build_control(command="STOP_RECORDING")
                )

            # Confirm to CLI
            await source_ws.send(
                WSMessageCodec.build_control_response(
                    command="stop",
                    success=True,
                    session_id=session_id,
                    filepath=str(filepath) if filepath else None,
                )
            )

        else:
            logger.warning("unknown_control_command", command=command)
            await source_ws.send(
                WSMessageCodec.build_control_response(
                    command=command,
                    success=False,
                    error=f"Unknown command: {command}",
                )
            )

    async def _start_recording(self, session_id: Optional[str] = None) -> None:
        """Start a new recording session."""
        if self.current_session:
            logger.warning("recording_already_in_progress", session_id=self.current_session.session_id)
            return

        session_id = session_id or str(uuid.uuid4())[:8]
        self.current_session = RecordingSession(session_id)
        self.sessions[session_id] = self.current_session

        logger.info("recording_started", session_id=session_id)

    async def _stop_recording(self) -> Optional[Path]:
        """Stop the current recording session and save it."""
        if not self.current_session:
            logger.warning("no_recording_in_progress")
            return None

        self.current_session.stop()
        filepath = self.current_session.save(self.recordings_dir)

        logger.info(
            "recording_stopped",
            session_id=self.current_session.session_id,
            filepath=str(filepath),
            action_count=self.current_session.get_action_count(),
            duration_ms=self.current_session.duration_ms,
        )

        self.current_session = None
        return filepath

    async def _send_error(self, websocket: Any, message: str) -> None:
        """Send an error message to a client."""
        try:
            await websocket.send(WSMessageCodec.build_error(message))
        except Exception:
            pass

    async def start(self) -> None:
        """Start the WebSocket server."""
        logger.info("starting_websocket_server", host=self.host, port=self.port)

        self._server = await websockets.serve(
            self.handle_client,
            self.host,
            self.port,
        )

        logger.info(
            "websocket_server_started",
            host=self.host,
            port=self.port,
            url=f"ws://{self.host}:{self.port}",
        )

        # Wait for shutdown signal
        await self._shutdown_event.wait()

    async def stop(self) -> None:
        """Stop the WebSocket server gracefully."""
        logger.info("stopping_websocket_server")
        self._shutdown_event.set()

        if self._server:
            self._server.close()
            await self._server.wait_closed()

        logger.info("websocket_server_stopped")

    def get_status(self) -> dict[str, Any]:
        """Get current server status."""
        return {
            "running": self._server is not None,
            "host": self.host,
            "port": self.port,
            "extension_connected": self.extension_ws is not None,
            "cli_connected": self.cli_ws is not None,
            "recording": self.current_session is not None,
            "current_session": (
                self.current_session.to_summary() if self.current_session else None
            ),
            "total_sessions": len(self.sessions),
        }


def main() -> None:
    """Entry point for running the WebSocket server standalone."""
    import signal

    # Configure logging
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.dev.ConsoleRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    server = WebSocketServer()

    # Handle shutdown signals
    loop = asyncio.get_event_loop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(server.stop()))

    try:
        loop.run_until_complete(server.start())
    except KeyboardInterrupt:
        logger.info("shutdown_requested")
    finally:
        loop.run_until_complete(server.stop())


if __name__ == "__main__":
    main()
