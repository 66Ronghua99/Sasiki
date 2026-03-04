"""MCP stdio client wrapper built on the official python mcp package."""

from __future__ import annotations

import asyncio
import os
import threading
from collections.abc import Coroutine
from concurrent.futures import Future
from concurrent.futures import TimeoutError as FuturesTimeoutError
from contextlib import AsyncExitStack, suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TypeVar

from sasiki.utils.logger import logger

_T = TypeVar("_T")


class MCPClientError(RuntimeError):
    """Base error for MCP client failures."""


class MCPProtocolError(MCPClientError):
    """Raised when server response violates protocol or returns an error."""


@dataclass(slots=True)
class MCPServerConfig:
    """Process configuration for an MCP stdio server."""

    command: str
    args: list[str]
    cwd: Path | None = None
    env: dict[str, str] | None = None


class MCPStdioClient:
    """Sync-friendly wrapper over python mcp's async stdio session."""

    def __init__(
        self,
        command: str,
        args: list[str] | None = None,
        *,
        cwd: Path | None = None,
        env: dict[str, str] | None = None,
        request_timeout_seconds: float = 60.0,
    ) -> None:
        self._config = MCPServerConfig(
            command=command,
            args=args or [],
            cwd=cwd,
            env=env,
        )
        self._request_timeout_seconds = request_timeout_seconds

        self._loop: asyncio.AbstractEventLoop | None = None
        self._loop_thread: threading.Thread | None = None
        self._start_event = threading.Event()
        self._start_error: Exception | None = None

        self._exit_stack: AsyncExitStack | None = None
        self._session: Any | None = None
        self._shutdown_event: asyncio.Event | None = None
        self._closed = True
        self._lock = threading.Lock()

    def __enter__(self) -> MCPStdioClient:
        self.start()
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        self.close()

    def start(self) -> None:
        """Start MCP server process and perform initialize handshake."""
        with self._lock:
            if self._loop_thread is not None:
                return
            self._closed = False
            self._start_error = None
            self._start_event.clear()
            self._loop_thread = threading.Thread(
                target=self._loop_worker,
                daemon=True,
                name="mcp-stdio-loop",
            )

        logger.info(
            "mcp_starting",
            command=self._config.command,
            args=self._config.args,
            cwd=str(self._config.cwd) if self._config.cwd else None,
            cdp_endpoint=os.getenv("PLAYWRIGHT_MCP_CDP_ENDPOINT"),
        )
        self._loop_thread.start()

        if not self._start_event.wait(timeout=self._request_timeout_seconds):
            self.close()
            raise MCPClientError("timeout while starting MCP client")

        if self._start_error is not None:
            error = self._start_error
            self.close()
            if isinstance(error, MCPClientError):
                raise error
            raise MCPClientError(f"failed to start MCP client: {error}") from error

    def close(self) -> None:
        """Close client and underlying server process."""
        with self._lock:
            if self._closed:
                return
            self._closed = True
            loop = self._loop
            loop_thread = self._loop_thread

        if loop is not None and loop.is_running() and self._shutdown_event is not None:
            loop.call_soon_threadsafe(self._shutdown_event.set)

        if loop_thread is not None:
            loop_thread.join(timeout=5)

        with self._lock:
            self._loop = None
            self._loop_thread = None
            self._session = None
            self._exit_stack = None
            self._shutdown_event = None

    def list_tools(self) -> list[dict[str, Any]]:
        """Return tool metadata exposed by MCP server."""
        session = self._require_session()
        result = self._run_coro("tools/list", session.list_tools())
        tools = getattr(result, "tools", [])
        output: list[dict[str, Any]] = []
        for tool in tools:
            payload = self._as_dict(tool)
            output.append(payload)
        return output

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        """Invoke a tool and return raw MCP tool response."""
        session = self._require_session()
        result = self._run_coro(f"tools/call:{name}", session.call_tool(name, arguments or {}))
        payload = self._as_dict(result)
        if payload.get("isError"):
            message = self._extract_text(payload) or "tool returned isError=true"
            raise MCPProtocolError(f"{name} failed: {message}")
        return payload

    def last_stderr(self) -> str:
        """Placeholder for compatibility with old client interface."""
        return ""

    async def _async_start(self) -> None:
        try:
            from mcp import ClientSession, StdioServerParameters
            from mcp.client.stdio import stdio_client
        except Exception as exc:  # pragma: no cover - dependency/runtime issue
            raise MCPClientError("python package `mcp` is required; install with `uv pip install mcp`") from exc

        server_params = StdioServerParameters(
            command=self._config.command,
            args=self._config.args,
            env=self._config.env,
            cwd=self._config.cwd,
        )

        self._exit_stack = AsyncExitStack()
        stdio, write = await self._exit_stack.enter_async_context(stdio_client(server_params))
        session = await self._exit_stack.enter_async_context(ClientSession(stdio, write))
        await asyncio.wait_for(session.initialize(), timeout=self._request_timeout_seconds)
        self._session = session

        tools_result = await asyncio.wait_for(session.list_tools(), timeout=self._request_timeout_seconds)
        tool_names = [tool.name for tool in getattr(tools_result, "tools", [])]
        logger.info("mcp_initialized", tool_count=len(tool_names), tools=tool_names)

    async def _async_close(self) -> None:
        exit_stack = self._exit_stack
        self._exit_stack = None
        self._session = None
        if exit_stack is not None:
            await exit_stack.aclose()

    def _loop_worker(self) -> None:
        loop = asyncio.new_event_loop()
        self._loop = loop
        asyncio.set_event_loop(loop)

        try:
            self._shutdown_event = asyncio.Event()
            loop.run_until_complete(self._async_start())
            self._start_event.set()
            loop.run_until_complete(self._shutdown_event.wait())
            loop.run_until_complete(self._async_close())
        except Exception as exc:
            self._start_error = exc
            self._start_event.set()
        finally:
            with suppress(Exception):
                pending = [task for task in asyncio.all_tasks(loop) if not task.done()]
                for task in pending:
                    task.cancel()
                if pending:
                    loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            loop.close()

    def _run_coro(
        self,
        operation: str,
        awaitable: Coroutine[Any, Any, _T],
        *,
        timeout_seconds: float | None = None,
    ) -> _T:
        loop = self._loop
        if loop is None or not loop.is_running():
            raise MCPClientError("MCP process is not running")

        timeout = timeout_seconds or self._request_timeout_seconds
        future: Future[_T] = asyncio.run_coroutine_threadsafe(awaitable, loop)
        try:
            return future.result(timeout=timeout)
        except FuturesTimeoutError as exc:
            future.cancel()
            raise MCPClientError(f"timeout waiting for MCP response: {operation}") from exc
        except Exception as exc:
            raise MCPClientError(f"MCP request failed for {operation}: {exc}") from exc

    def _require_session(self) -> Any:
        session = self._session
        if session is None:
            raise MCPClientError("MCP process is not initialized")
        return session

    @staticmethod
    def _as_dict(value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return value

        model_dump = getattr(value, "model_dump", None)
        if callable(model_dump):
            payload = model_dump(by_alias=True, exclude_none=True)
            if isinstance(payload, dict):
                return payload

        raise MCPProtocolError(f"invalid MCP payload: {value}")

    @staticmethod
    def _extract_text(result: dict[str, Any]) -> str:
        content = result.get("content")
        if not isinstance(content, list):
            return ""

        chunks: list[str] = []
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") != "text":
                continue
            text = part.get("text")
            if isinstance(text, str):
                chunks.append(text)

        return "\n".join(chunks).strip()
