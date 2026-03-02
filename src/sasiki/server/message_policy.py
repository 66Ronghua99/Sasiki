"""Message policy layer for WebSocket communication.

Defines which message types each client role can send and receive.
Provides centralized policy enforcement to prevent role spoofing.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from sasiki.server.websocket_protocol import WSMessageType


class ClientRole(str, Enum):
    """Valid client roles in the WebSocket protocol."""

    EXTENSION = "extension"
    CLI = "cli"


class MessagePolicyViolation(Exception):
    """Raised when a message violates the communication policy."""

    pass


class MessagePolicy:
    """Policy layer for WebSocket message validation.

    Enforces rules about which client roles can send which message types,
    preventing unauthorized message spoofing.

    Example:
        policy = MessagePolicy()

        # Check if extension can send ACTION
        policy.validate_sender(ClientRole.EXTENSION, WSMessageType.ACTION)

        # Check if CLI can receive ACTION_LOGGED
        policy.validate_receiver(ClientRole.CLI, WSMessageType.ACTION_LOGGED)
    """

    # Map: sender role -> allowed message types
    SENDER_POLICY: dict[ClientRole, set[WSMessageType]] = {
        ClientRole.EXTENSION: {
            WSMessageType.REGISTER,
            WSMessageType.ACTION,
        },
        ClientRole.CLI: {
            WSMessageType.REGISTER,
            WSMessageType.CONTROL,
        },
    }

    # Map: receiver role -> allowed message types
    RECEIVER_POLICY: dict[ClientRole, set[WSMessageType]] = {
        ClientRole.EXTENSION: {
            WSMessageType.CONTROL,  # Server sends control to extension
            WSMessageType.ERROR,
        },
        ClientRole.CLI: {
            WSMessageType.CONTROL_RESPONSE,
            WSMessageType.ACTION_LOGGED,
            WSMessageType.ERROR,
        },
    }

    @classmethod
    def validate_sender(
        cls,
        role: ClientRole | str | None,
        msg_type: WSMessageType,
        raise_on_violation: bool = True,
    ) -> bool:
        """Validate that a client role is allowed to send a message type.

        Args:
            role: The client role (or None for unregistered)
            msg_type: The message type being sent
            raise_on_violation: If True, raise exception on violation

        Returns:
            True if allowed, False if not (when raise_on_violation=False)

        Raises:
            MessagePolicyViolation: If role cannot send this message type
        """
        if role is None:
            # Unregistered clients can only send REGISTER
            allowed = {WSMessageType.REGISTER}
            role_str = "unregistered"
        else:
            role_enum = ClientRole(role) if isinstance(role, str) else role
            allowed = cls.SENDER_POLICY.get(role_enum, set())
            role_str = role_enum.value

        if msg_type not in allowed:
            if raise_on_violation:
                raise MessagePolicyViolation(
                    f"Role '{role_str}' is not allowed to send '{msg_type.value}' messages. "
                    f"Allowed types: {[t.value for t in allowed]}"
                )
            return False
        return True

    @classmethod
    def validate_receiver(
        cls,
        role: ClientRole | str,
        msg_type: WSMessageType,
        raise_on_violation: bool = True,
    ) -> bool:
        """Validate that a client role is allowed to receive a message type.

        Args:
            role: The client role
            msg_type: The message type being received
            raise_on_violation: If True, raise exception on violation

        Returns:
            True if allowed, False if not (when raise_on_violation=False)

        Raises:
            MessagePolicyViolation: If role cannot receive this message type
        """
        role_enum = ClientRole(role) if isinstance(role, str) else role
        allowed = cls.RECEIVER_POLICY.get(role_enum, set())

        if msg_type not in allowed:
            if raise_on_violation:
                raise MessagePolicyViolation(
                    f"Role '{role_enum.value}' is not allowed to receive '{msg_type.value}' messages. "
                    f"Allowed types: {[t.value for t in allowed]}"
                )
            return False
        return True

    @classmethod
    def get_allowed_sender_types(cls, role: ClientRole | str | None) -> set[WSMessageType]:
        """Get all message types a role is allowed to send."""
        if role is None:
            return {WSMessageType.REGISTER}
        role_enum = ClientRole(role) if isinstance(role, str) else role
        return cls.SENDER_POLICY.get(role_enum, set()).copy()

    @classmethod
    def get_allowed_receiver_types(cls, role: ClientRole | str) -> set[WSMessageType]:
        """Get all message types a role is allowed to receive."""
        role_enum = ClientRole(role) if isinstance(role, str) else role
        return cls.RECEIVER_POLICY.get(role_enum, set()).copy()

    @classmethod
    def is_valid_role(cls, role: str | None) -> bool:
        """Check if a role string is valid."""
        if role is None:
            return False
        try:
            ClientRole(role)
            return True
        except ValueError:
            return False
