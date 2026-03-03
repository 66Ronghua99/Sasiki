"""Configuration management for Sasiki."""

from pathlib import Path
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM Configuration
    openrouter_api_key: Optional[str] = Field(default=None, description="OpenRouter API key")
    dashscope_api_key: Optional[str] = Field(default=None, description="DashScope API key")
    dashscope_base_url: str = Field(
        default="https://dashscope.aliyuncs.com/compatible-mode/v1",
        description="DashScope API base URL"
    )
    llm_model: Optional[str] = Field(
        default=None,
        description="LLM model to use (overrides default provider models if set)"
    )
    llm_base_url: Optional[str] = Field(
        default=None,
        description="LLM API base URL (overrides default provider URLs if set)"
    )

    @property
    def active_model(self) -> str:
        if self.dashscope_api_key:
            return "MiniMax-M2.1"
        if self.llm_model:
            return self.llm_model
        return "minimax/minimax-m2.5"

    @property
    def active_api_key(self) -> str:
        if self.dashscope_api_key:
            return self.dashscope_api_key
        if self.openrouter_api_key:
            return self.openrouter_api_key
        return "dummy_key"

    @property
    def active_base_url(self) -> str:
        if self.dashscope_api_key:
            return self.dashscope_base_url
        if self.llm_base_url:
            return self.llm_base_url
        return "https://openrouter.ai/api/v1"

    # Recording Settings
    recordings_dir: Path = Field(
        default=Path.home() / ".sasiki" / "recordings",
        description="Directory to store recordings"
    )
    workflows_dir: Path = Field(
        default=Path.home() / ".sasiki" / "workflows",
        description="Directory to store generated workflows"
    )
    max_recording_duration_minutes: int = Field(
        default=60,
        description="Maximum recording duration in minutes"
    )

    # Analysis Settings
    frame_sample_rate: int = Field(
        default=1,
        description="Capture frame every N seconds"
    )
    similarity_threshold: float = Field(
        default=0.9,
        description="Similarity threshold for deduplication (0-1)"
    )
    max_frames_per_analysis: int = Field(
        default=100,
        description="Maximum frames to send to LLM in one batch"
    )

    # Debug
    debug: bool = Field(default=False)
    log_level: str = Field(default="INFO")

    def ensure_directories(self) -> None:
        """Ensure configured directories exist.

        This should be called explicitly after settings are initialized,
        typically at application entry points.
        """
        self.recordings_dir.mkdir(parents=True, exist_ok=True)
        self.workflows_dir.mkdir(parents=True, exist_ok=True)


# Global settings instance (lazy initialization)
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Get or create the global Settings instance.

    This function uses lazy initialization to avoid side effects during import.
    Directories are NOT created automatically; call ensure_directories() explicitly.

    Returns:
        Settings instance
    """
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


# Backwards compatibility: module-level settings instance
# Deprecated: Use get_settings() instead for new code
settings = get_settings()
