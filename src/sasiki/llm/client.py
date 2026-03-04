"""LLM client with provider routing support."""

from typing import Any, cast

from openai import AsyncOpenAI, OpenAI

from sasiki.config import get_settings
from sasiki.utils.logger import logger


class LLMClient:
    """Client for LLM API calls."""

    def __init__(self) -> None:
        settings = get_settings()
        base_url = settings.active_base_url
        api_key = settings.active_api_key
        model = settings.active_model
        provider = "dashscope" if settings.dashscope_api_key else "openrouter"

        self.client = OpenAI(
            base_url=base_url,
            api_key=api_key,
        )
        self.async_client = AsyncOpenAI(
            base_url=base_url,
            api_key=api_key,
        )
        self.model = model

        logger.info("llm_client_initialized", model=self.model, provider=provider, base_url=base_url)

    def complete(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.3,
        max_tokens: int | None = None,
        response_format: dict[str, Any] | None = None,
    ) -> str:
        """Send a completion request to the LLM."""
        try:
            kwargs: dict[str, Any] = {
                "model": self.model,
                "messages": messages,
                "temperature": temperature,
            }
            if max_tokens:
                kwargs["max_tokens"] = max_tokens
            if response_format:
                kwargs["response_format"] = response_format

            response = self.client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content

            logger.debug(
                "llm_completion",
                model=self.model,
                prompt_tokens=response.usage.prompt_tokens,
                completion_tokens=response.usage.completion_tokens,
            )

            return cast(str, content or "")

        except Exception as e:
            logger.error("llm_completion_error", error=str(e))
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
            kwargs: dict[str, Any] = {
                "model": self.model,
                "messages": messages,
                "temperature": temperature,
            }
            if max_tokens:
                kwargs["max_tokens"] = max_tokens
            if response_format:
                kwargs["response_format"] = response_format

            response = await self.async_client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content

            logger.debug(
                "llm_completion_async",
                model=self.model,
                prompt_tokens=response.usage.prompt_tokens,
                completion_tokens=response.usage.completion_tokens,
            )

            return cast(str, content or "")

        except Exception as e:
            logger.error("llm_completion_async_error", error=str(e))
            raise

    def analyze_frames(
        self,
        frames: list[tuple[str, float]],  # List of (base64_image, timestamp)
        context: str | None = None,
    ) -> str:
        """Analyze a sequence of screenshot frames.

        Args:
            frames: List of (base64_image, timestamp) tuples
            context: Optional context about what the user is doing
        """
        system_prompt = """You are a workflow observation assistant. Analyze the sequence of screenshot frames and describe what the user is doing.

Focus on:
1. What applications are being used
2. What actions are being performed (searching, typing, clicking, copying, etc.)
3. What data is being transferred between applications
4. The overall goal or task being accomplished

Be specific about:
- URLs or search queries visible
- Text content being selected or copied
- Files being opened or saved
- Transitions between applications

Output a structured description of the observed workflow."""

        user_content: list[dict[str, Any]] = []

        if context:
            user_content.append({
                "type": "text",
                "text": f"Context: {context}\n\nAnalyze these screenshot frames captured during the user's work session:"
            })
        else:
            user_content.append({
                "type": "text",
                "text": "Analyze these screenshot frames captured during the user's work session:"
            })

        # Add frames (limit to avoid token overflow)
        for _i, (b64_image, timestamp) in enumerate(frames[:20]):  # Limit to 20 frames
            user_content.append({
                "type": "text",
                "text": f"\n[Frame at {timestamp:.1f}s]"
            })
            user_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{b64_image}"
                }
            })

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ]

        return self.complete(messages, temperature=0.2, max_tokens=2000)

    def extract_workflow(
        self,
        observation: str,
        events_summary: str,
    ) -> dict[str, Any]:
        """Extract structured workflow from observation text.

        Returns a JSON object with:
        - workflow_name
        - stages[]
        - variables[]
        - checkpoints[]
        """
        system_prompt = """You are a workflow extraction assistant. Based on the observed user actions, extract a reusable workflow structure.

Output JSON format:
{
  "workflow_name": "Short descriptive name",
  "description": "What this workflow accomplishes",
  "stages": [
    {
      "name": "Stage name",
      "application": "App used (Chrome, Excel, Word, etc.)",
      "actions": ["list of specific actions"],
      "inputs": ["input data/variables"],
      "outputs": ["output data produced"]
    }
  ],
  "variables": [
    {
      "name": "variable_name",
      "description": "What this variable represents",
      "type": "text|number|file|url",
      "example": "example value from observation"
    }
  ],
  "checkpoints": [
    {
      "after_stage": 0,
      "description": "What should be verified at this point",
      "manual_confirmation": true/false
    }
  ],
  "estimated_duration_minutes": 10
}

Guidelines:
- Identify what values should be parameterized (search terms, file paths, etc.)
- Group related actions into logical stages
- Mark natural breakpoints as checkpoints where user might want to verify progress"""

        user_prompt = f"""Observed workflow:
{observation}

Recorded events summary:
{events_summary}

Extract the structured workflow."""

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        response = self.complete(
            messages,
            temperature=0.2,
            max_tokens=3000,
            response_format={"type": "json_object"}
        )

        import json

        return cast(dict[str, Any], json.loads(response))
