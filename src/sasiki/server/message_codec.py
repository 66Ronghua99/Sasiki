"""WebSocket message codec for encoding/decoding protocol messages.

This module centralizes message serialization/deserialization to eliminate
scattered hardcoded JSON dicts across the codebase.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from pydantic import ValidationError

from sasiki.server.websocket_protocol import WSMessage


class WSMessageCodecError(Exception):
    """Error encoding or decoding WebSocket messages."""

    pass


class WSMessageCodec:
    """Codec for WebSocket message encoding and decoding.

    Provides centralized message serialization/deserialization to ensure
    consistent message handling across server and clients.

    Example:
        codec = WSMessageCodec()

        # Decode incoming message
        message = codec.parse_incoming(raw_message)

        # Encode outgoing message
        raw = codec.build_outgoing(message)
    """

    @staticmethod
    def parse_incoming(raw_message: str) -> WSMessage:
        """Parse an incoming raw WebSocket message.

        Args:
            raw_message: Raw JSON string from WebSocket

        Returns:
            Parsed WSMessage

        Raises:
            WSMessageCodecError: If message is invalid JSON or schema
        """
        try:
            data = json.loads(raw_message)
        except json.JSONDecodeError as e:
            raise WSMessageCodecError(f"Invalid JSON: {e}") from e

        if not isinstance(data, dict):
            raise WSMessageCodecError("Message must be a JSON object")

        # Normalize: if payload is missing but we have extra fields, create payload
        # This handles the legacy format where fields are at top level
        if "payload" not in data:
            payload_fields = {}
            message_fields = {"type", "timestamp", "client", "version", "payload"}
            for key, value in data.items():
                if key not in message_fields:
                    payload_fields[key] = value
            if payload_fields:
                data = {**data, "payload": payload_fields}

        try:
            return WSMessage.model_validate(data)
        except ValidationError as e:
            raise WSMessageCodecError(f"Invalid message schema: {e}") from e

    @staticmethod
    def build_outgoing(message: WSMessage) -> str:
        """Encode a message for transmission.

        Args:
            message: WSMessage to encode

        Returns:
            JSON string ready for WebSocket transmission

        Raises:
            WSMessageCodecError: If encoding fails
        """
        try:
            return json.dumps(message.model_dump(exclude_none=True))
        except (TypeError, ValueError) as e:
            raise WSMessageCodecError(f"Failed to encode message: {e}") from e

    @classmethod
    def build_from_dict(cls, data: dict[str, Any]) -> str:
        """Build a message directly from a dict (for convenience).

        Args:
            data: Dictionary with message data (must include 'type' field)

        Returns:
            JSON string ready for WebSocket transmission
        """
        try:
            message = WSMessage.model_validate(data)
            return cls.build_outgoing(message)
        except ValidationError as e:
            raise WSMessageCodecError(f"Invalid message data: {e}") from e

    # Convenience methods for building common message types

    @classmethod
    def build_register(cls, client: str, version: str = "1.0") -> str:
        """Build a registration message."""
        return cls.build_outgoing(WSMessage.register(client, version))

    @classmethod
    def build_control(
        cls, command: str, session_id: Optional[str] = None
    ) -> str:
        """Build a control message."""
        return cls.build_outgoing(WSMessage.control(command, session_id))

    @classmethod
    def build_control_response(
        cls,
        command: str,
        success: bool,
        session_id: Optional[str] = None,
        filepath: Optional[str] = None,
        error: Optional[str] = None,
    ) -> str:
        """Build a control response message."""
        message = WSMessage.control_response(
            command=command,
            success=success,
            session_id=session_id,
            filepath=filepath,
            error=error,
        )
        return cls.build_outgoing(message)

    @classmethod
    def build_action_logged(cls, action: dict[str, Any]) -> str:
        """Build an action_logged notification message."""
        return cls.build_outgoing(WSMessage.action_logged(action))

    @classmethod
    def build_error(cls, message: str, details: Optional[dict] = None) -> str:
        """Build an error message."""
        return cls.build_outgoing(WSMessage.error(message, details))
