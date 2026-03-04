"""Utility for migrating cookies and local storage from the main Chrome profile."""

import json
from pathlib import Path
from typing import Any

try:
    from playwright.async_api import BrowserContext as AsyncBrowserContext
except Exception:  # pragma: no cover - playwright might be unavailable in test env
    AsyncBrowserContext = Any  # type: ignore[misc,assignment]

try:
    from playwright.sync_api import BrowserContext as SyncBrowserContext
except Exception:  # pragma: no cover - playwright might be unavailable in test env
    SyncBrowserContext = Any  # type: ignore[misc,assignment]


class SessionManager:
    """Manages moving session state (cookies) between profiles or from raw JSON."""

    DEFAULT_COOKIES_DIR: Path = Path.home() / ".sasiki" / "cookies"

    @staticmethod
    def get_cookies_dir() -> Path:
        """Get the default cookies storage directory."""
        return SessionManager.DEFAULT_COOKIES_DIR

    @staticmethod
    def _normalize_same_site(value: str) -> str | None:
        same_site = value.strip().lower()
        if same_site in {"strict", "lax", "none"}:
            return same_site.capitalize()
        return None

    @staticmethod
    def _format_cookie(raw: dict[str, Any]) -> dict[str, Any]:
        cookie: dict[str, Any] = {
            "name": str(raw.get("name", "")),
            "value": str(raw.get("value", "")),
            "domain": str(raw.get("domain", "")),
            "path": str(raw.get("path", "/")),
        }
        if "secure" in raw:
            cookie["secure"] = bool(raw["secure"])
        if "httpOnly" in raw:
            cookie["httpOnly"] = bool(raw["httpOnly"])
        if "sameSite" in raw:
            normalized = SessionManager._normalize_same_site(str(raw["sameSite"]))
            if normalized is not None:
                cookie["sameSite"] = normalized
        if "expirationDate" in raw:
            cookie["expires"] = float(raw["expirationDate"])
        return cookie

    @staticmethod
    def load_cookies_from_file(cookie_file_path: str | Path) -> list[dict[str, Any]]:
        """Load and normalize cookies from a JSON file."""
        path = Path(cookie_file_path).expanduser()
        if not path.exists():
            raise FileNotFoundError(f"Cookie file not found: {path}")

        with open(path, encoding="utf-8") as f:
            raw_cookies = json.load(f)

        if not isinstance(raw_cookies, list):
            raise ValueError(f"Cookie file must contain a list: {path}")

        normalized: list[dict[str, Any]] = []
        for raw in raw_cookies:
            if not isinstance(raw, dict):
                continue
            normalized.append(SessionManager._format_cookie(raw))
        return normalized

    @staticmethod
    async def inject_all_cookies(
        context: AsyncBrowserContext,
        cookies_dir: str | Path | None = None,
    ) -> tuple[int, int]:
        """Inject all cookie files from the specified directory.

        Automatically discovers and loads all .json cookie files from the
        cookies directory. This is useful for restoring multiple sessions
        (e.g., login state for various websites).

        Args:
            context: The Playwright browser context
            cookies_dir: Directory containing cookie JSON files.
                        Defaults to ~/.sasiki/cookies/

        Returns:
            Tuple of (number of files loaded, total cookies injected)
        """
        cookies_path = Path(cookies_dir or SessionManager.DEFAULT_COOKIES_DIR).expanduser()

        if not cookies_path.exists():
            return 0, 0

        cookie_files = list(cookies_path.glob("*.json"))
        total_cookies = 0

        for cookie_file in cookie_files:
            try:
                count = await SessionManager.inject_cookies_from_file(context, cookie_file)
                total_cookies += count
            except Exception:
                # Skip invalid cookie files, continue loading others
                continue

        return len(cookie_files), total_cookies

    @staticmethod
    async def inject_cookies_from_file(
        context: AsyncBrowserContext, cookie_file_path: str | Path
    ) -> int:
        """
        Injects a list of cookies (in JSON format) directly into the Playwright context.
        This allows you to export cookies from an extension (like 'EditThisCookie')
        and load them directly without logging in.

        Args:
            context: The Playwright browser context
            cookie_file_path: Path to the JSON file containing cookies

        Returns:
            Number of cookies injected
        """
        formatted_cookies = SessionManager.load_cookies_from_file(cookie_file_path)

        # Cast to Any to satisfy type checker.
        await context.add_cookies(formatted_cookies)  # type: ignore[arg-type]
        return len(formatted_cookies)

    @staticmethod
    def inject_all_cookies_sync(
        context: SyncBrowserContext,
        cookies_dir: str | Path | None = None,
    ) -> tuple[int, int]:
        """Sync variant of inject_all_cookies for sync Playwright contexts."""
        cookies_path = Path(cookies_dir or SessionManager.DEFAULT_COOKIES_DIR).expanduser()
        if not cookies_path.exists():
            return 0, 0

        cookie_files = list(cookies_path.glob("*.json"))
        total_cookies = 0
        loaded_files = 0
        for cookie_file in cookie_files:
            try:
                total_cookies += SessionManager.inject_cookies_from_file_sync(context, cookie_file)
                loaded_files += 1
            except Exception:
                continue

        return loaded_files, total_cookies

    @staticmethod
    def inject_cookies_from_file_sync(
        context: SyncBrowserContext,
        cookie_file_path: str | Path,
    ) -> int:
        """Sync variant of inject_cookies_from_file for sync Playwright contexts."""
        formatted_cookies = SessionManager.load_cookies_from_file(cookie_file_path)
        context.add_cookies(formatted_cookies)
        return len(formatted_cookies)

    @staticmethod
    async def export_cookies_to_file(
        context: AsyncBrowserContext, cookie_file_path: str | Path
    ) -> int:
        """Export current session cookies to a JSON file for backup."""
        cookies = await context.cookies()
        path = Path(cookie_file_path).expanduser()

        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(cookies, f, indent=2)

        return len(cookies)
