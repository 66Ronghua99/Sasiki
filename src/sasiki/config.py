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
    openrouter_api_key: str = Field(..., description="OpenRouter API key")
    llm_model: str = Field(
        default="minimax/minimax-m2.5",
        description="LLM model to use"
    )
    llm_base_url: str = Field(
        default="https://openrouter.ai/api/v1",
        description="LLM API base URL"
    )
    
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
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Ensure directories exist
        self.recordings_dir.mkdir(parents=True, exist_ok=True)
        self.workflows_dir.mkdir(parents=True, exist_ok=True)


# Global settings instance
settings = Settings()
