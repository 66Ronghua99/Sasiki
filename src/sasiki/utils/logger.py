"""Structured logging configuration."""

import logging
import sys
from typing import Any, Optional

import structlog

from sasiki.config import get_settings

# Flag to track if logging has been configured
_logging_configured = False


def configure_logging() -> Any:
    """Configure structured logging.

    This function is idempotent - calling it multiple times has no additional effect.

    Returns:
        Configured structlog logger instance
    """
    global _logging_configured

    if _logging_configured:
        return structlog.get_logger()

    settings = get_settings()

    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.log_level.upper()),
    )

    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer() if not settings.debug else structlog.dev.ConsoleRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    _logging_configured = True
    return structlog.get_logger()


# Global logger instance (lazy initialization)
_logger: Optional[Any] = None


def get_logger() -> Any:
    """Get or create the global logger instance.

    This function uses lazy initialization to avoid side effects during import.
    Logging is configured automatically on first call.

    Returns:
        Configured structlog logger instance
    """
    global _logger
    if _logger is None:
        _logger = configure_logging()
    return _logger


# Backwards compatibility: module-level logger instance
# Deprecated: Use get_logger() instead for new code
logger = get_logger()
