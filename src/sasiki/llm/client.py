"""LLM client with OpenRouter support."""

from typing import Any

from openai import AsyncOpenAI, OpenAI
from openai.types.chat import ChatCompletion

from sasiki.config import get_settings
from sasiki.utils.logger import get_logger


class LLMClient:
    """Client for LLM API calls."""

    def __init__(self) -> None:
        settings = get_settings()
        self.client = OpenAI(
            base_url=settings.active_base_url,
            api_key=settings.active_api_key,
        )
        self.async_client = AsyncOpenAI(
            base_url=settings.active_base_url,
            api_key=settings.active_api_key,
        )
        self.model = settings.active_model

        get_logger().info("llm_client_initialized", model=self.model)

    def _build_kwargs(
        self,
        messages: list[dict[str, Any]],
        temperature: float,
        max_tokens: int | None,
        response_format: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """Build kwargs for completion API call.

        Centralizes parameter construction to ensure consistency
        between sync and async paths.
        """
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
        if response_format is not None:
            kwargs["response_format"] = response_format
        return kwargs

    def _log_completion(
        self,
        response: ChatCompletion,
        operation: str,
    ) -> None:
        """Log completion metrics."""
        get_logger().debug(
            operation,
            model=self.model,
            prompt_tokens=response.usage.prompt_tokens if response.usage else 0,
            completion_tokens=response.usage.completion_tokens if response.usage else 0,
        )

    def complete(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.3,
        max_tokens: int | None = None,
        response_format: dict[str, Any] | None = None,
    ) -> str:
        """Send a completion request to the LLM."""
        try:
            kwargs = self._build_kwargs(messages, temperature, max_tokens, response_format)
            response = self.client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content or ""

            self._log_completion(response, "llm_completion")
            return content

        except Exception as e:
            get_logger().error("llm_completion_error", error=str(e))
            raise

    async def complete_async(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.3,
        max_tokens: int | None = None,
        response_format: dict[str, Any] | None = None,
    ) -> str:
        """Async completion request."""
        try:
            kwargs = self._build_kwargs(messages, temperature, max_tokens, response_format)
            response = await self.async_client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content or ""

            self._log_completion(response, "llm_completion_async")
            return content

        except Exception as e:
            get_logger().error("llm_completion_async_error", error=str(e))
            raise
