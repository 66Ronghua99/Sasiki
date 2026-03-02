"""Tests for message policy layer."""

import pytest

from sasiki.server.message_policy import (
    ClientRole,
    MessagePolicy,
    MessagePolicyViolation,
)
from sasiki.server.websocket_protocol import WSMessageType


class TestSenderPolicy:
    """Tests for sender-side message policy."""

    def test_extension_can_send_action(self) -> None:
        """Extension should be allowed to send ACTION messages."""
        assert MessagePolicy.validate_sender(
            ClientRole.EXTENSION, WSMessageType.ACTION
        ) is True

    def test_extension_can_send_register(self) -> None:
        """Extension should be allowed to send REGISTER messages."""
        assert MessagePolicy.validate_sender(
            ClientRole.EXTENSION, WSMessageType.REGISTER
        ) is True

    def test_extension_cannot_send_control(self) -> None:
        """Extension should NOT be allowed to send CONTROL messages."""
        with pytest.raises(MessagePolicyViolation) as exc_info:
            MessagePolicy.validate_sender(ClientRole.EXTENSION, WSMessageType.CONTROL)
        assert "extension" in str(exc_info.value).lower()
        assert "control" in str(exc_info.value).lower()

    def test_cli_can_send_control(self) -> None:
        """CLI should be allowed to send CONTROL messages."""
        assert MessagePolicy.validate_sender(
            ClientRole.CLI, WSMessageType.CONTROL
        ) is True

    def test_cli_can_send_register(self) -> None:
        """CLI should be allowed to send REGISTER messages."""
        assert MessagePolicy.validate_sender(
            ClientRole.CLI, WSMessageType.REGISTER
        ) is True

    def test_cli_cannot_send_action(self) -> None:
        """CLI should NOT be allowed to send ACTION messages."""
        with pytest.raises(MessagePolicyViolation) as exc_info:
            MessagePolicy.validate_sender(ClientRole.CLI, WSMessageType.ACTION)
        assert "cli" in str(exc_info.value).lower()
        assert "action" in str(exc_info.value).lower()

    def test_unregistered_can_only_send_register(self) -> None:
        """Unregistered clients can only send REGISTER."""
        assert MessagePolicy.validate_sender(None, WSMessageType.REGISTER) is True

        with pytest.raises(MessagePolicyViolation):
            MessagePolicy.validate_sender(None, WSMessageType.ACTION)

        with pytest.raises(MessagePolicyViolation):
            MessagePolicy.validate_sender(None, WSMessageType.CONTROL)

    def test_validate_sender_returns_false_without_raise(self) -> None:
        """validate_sender should return False when raise_on_violation=False."""
        result = MessagePolicy.validate_sender(
            ClientRole.EXTENSION, WSMessageType.CONTROL, raise_on_violation=False
        )
        assert result is False


class TestReceiverPolicy:
    """Tests for receiver-side message policy."""

    def test_extension_can_receive_control(self) -> None:
        """Extension should receive CONTROL from server."""
        assert MessagePolicy.validate_receiver(
            ClientRole.EXTENSION, WSMessageType.CONTROL
        ) is True

    def test_extension_can_receive_error(self) -> None:
        """Extension should receive ERROR from server."""
        assert MessagePolicy.validate_receiver(
            ClientRole.EXTENSION, WSMessageType.ERROR
        ) is True

    def test_extension_cannot_receive_action_logged(self) -> None:
        """Extension should NOT receive ACTION_LOGGED."""
        with pytest.raises(MessagePolicyViolation):
            MessagePolicy.validate_receiver(
                ClientRole.EXTENSION, WSMessageType.ACTION_LOGGED
            )

    def test_cli_can_receive_control_response(self) -> None:
        """CLI should receive CONTROL_RESPONSE from server."""
        assert MessagePolicy.validate_receiver(
            ClientRole.CLI, WSMessageType.CONTROL_RESPONSE
        ) is True

    def test_cli_can_receive_action_logged(self) -> None:
        """CLI should receive ACTION_LOGGED from server."""
        assert MessagePolicy.validate_receiver(
            ClientRole.CLI, WSMessageType.ACTION_LOGGED
        ) is True

    def test_cli_cannot_receive_control(self) -> None:
        """CLI should NOT receive CONTROL (server-to-extension only)."""
        with pytest.raises(MessagePolicyViolation):
            MessagePolicy.validate_receiver(ClientRole.CLI, WSMessageType.CONTROL)


class TestRoleSpoofing:
    """Tests for role spoofing prevention."""

    def test_extension_cannot_spoof_control(self) -> None:
        """Extension trying to send CONTROL (spoofing CLI) should be rejected."""
        # This simulates an extension trying to control recording
        with pytest.raises(MessagePolicyViolation) as exc_info:
            MessagePolicy.validate_sender(ClientRole.EXTENSION, WSMessageType.CONTROL)

        # Verify the error message is informative
        error_msg = str(exc_info.value).lower()
        assert "extension" in error_msg
        assert "not allowed" in error_msg
        assert "control" in error_msg

    def test_cli_cannot_spoof_action(self) -> None:
        """CLI trying to send ACTION (fake recording) should be rejected."""
        # This simulates a CLI trying to inject fake actions
        with pytest.raises(MessagePolicyViolation) as exc_info:
            MessagePolicy.validate_sender(ClientRole.CLI, WSMessageType.ACTION)

        error_msg = str(exc_info.value).lower()
        assert "cli" in error_msg
        assert "not allowed" in error_msg
        assert "action" in error_msg


class TestInvalidRoles:
    """Tests for handling invalid/unknown roles."""

    def test_is_valid_role_true_for_valid(self) -> None:
        assert MessagePolicy.is_valid_role("extension") is True
        assert MessagePolicy.is_valid_role("cli") is True

    def test_is_valid_role_false_for_invalid(self) -> None:
        assert MessagePolicy.is_valid_role("hacker") is False
        assert MessagePolicy.is_valid_role("admin") is False
        assert MessagePolicy.is_valid_role("") is False
        assert MessagePolicy.is_valid_role(None) is False


class TestPolicyQueries:
    """Tests for policy query methods."""

    def test_get_allowed_sender_types(self) -> None:
        ext_types = MessagePolicy.get_allowed_sender_types(ClientRole.EXTENSION)
        assert WSMessageType.REGISTER in ext_types
        assert WSMessageType.ACTION in ext_types
        assert WSMessageType.CONTROL not in ext_types

    def test_get_allowed_receiver_types(self) -> None:
        cli_types = MessagePolicy.get_allowed_receiver_types(ClientRole.CLI)
        assert WSMessageType.CONTROL_RESPONSE in cli_types
        assert WSMessageType.ACTION_LOGGED in cli_types
        assert WSMessageType.ERROR in cli_types
        assert WSMessageType.CONTROL not in cli_types

    def test_string_role_accepted(self) -> None:
        """String roles should be accepted alongside enum."""
        assert MessagePolicy.validate_sender("extension", WSMessageType.ACTION) is True
        assert MessagePolicy.validate_sender("cli", WSMessageType.CONTROL) is True
