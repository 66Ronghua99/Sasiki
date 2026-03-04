"""Tests for configuration."""

from sasiki.config import Settings


class TestSettings:
    """Tests for Settings configuration."""

    def test_default_settings(self, monkeypatch):
        """Test default settings values."""
        # Ensure env file is not loaded.
        monkeypatch.setenv("OPENROUTER_API_KEY", "test_key")

        settings = Settings(_env_file=None)

        assert settings.llm_model is None
        assert settings.llm_base_url is None
        assert settings.active_model == "minimax/minimax-m2.5"
        assert settings.active_api_key == "test_key"
        assert settings.active_base_url == "https://openrouter.ai/api/v1"
        assert settings.frame_sample_rate == 1
        assert settings.similarity_threshold == 0.9
        assert settings.max_frames_per_analysis == 100

    def test_directories_created(self, monkeypatch, tmp_path):
        """Test that data directories are created when ensure_directories is called."""
        monkeypatch.setenv("OPENROUTER_API_KEY", "test_key")

        # Use temp directories
        recordings_dir = tmp_path / "recordings"
        workflows_dir = tmp_path / "workflows"

        settings = Settings(
            _env_file=None,
            recordings_dir=recordings_dir,
            workflows_dir=workflows_dir,
        )
        settings.ensure_directories()

        assert recordings_dir.exists()
        assert workflows_dir.exists()
