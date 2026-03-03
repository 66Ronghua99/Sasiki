"""Utility for migrating cookies and local storage from the main Chrome profile."""

import os
import json
from pathlib import Path
from typing import Any
from playwright.async_api import BrowserContext


class SessionManager:
    """Manages moving session state (cookies) between profiles or from raw JSON."""

    DEFAULT_COOKIES_DIR: Path = Path.home() / ".sasiki" / "cookies"

    @staticmethod
    def get_cookies_dir() -> Path:
        """Get the default cookies storage directory."""
        return SessionManager.DEFAULT_COOKIES_DIR

    @staticmethod
    async def inject_all_cookies(
        context: BrowserContext,
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
        context: BrowserContext, cookie_file_path: str | Path
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
        path = Path(cookie_file_path).expanduser()
        if not path.exists():
            raise FileNotFoundError(f"Cookie file not found: {path}")
            
        with open(path, 'r', encoding='utf-8') as f:
            cookies = json.load(f)
            
        # Playwright expects a specific format, ensure it matches
        formatted_cookies = []
        for c in cookies:
            cookie = {
                "name": c.get("name", ""),
                "value": c.get("value", ""),
                "domain": c.get("domain", ""),
                "path": c.get("path", "/"),
            }
            # Optional fields Playwright accepts
            if "secure" in c: cookie["secure"] = bool(c["secure"])
            if "httpOnly" in c: cookie["httpOnly"] = bool(c["httpOnly"])
            if "sameSite" in c: 
                # Playwright expects "Strict", "Lax", or "None"
                same_site = str(c["sameSite"])
                if same_site.lower() in ['strict', 'lax', 'none']:
                    cookie["sameSite"] = same_site.capitalize()
            if "expirationDate" in c: cookie["expires"] = float(c["expirationDate"])
            
            formatted_cookies.append(cookie)

        # Cast to Any to satisfy type checker - Playwright accepts this format
        await context.add_cookies(formatted_cookies)  # type: ignore[arg-type]
        return len(formatted_cookies)

    @staticmethod
    async def export_cookies_to_file(
        context: BrowserContext, cookie_file_path: str | Path
    ) -> int:
        """Export current session cookies to a JSON file for backup."""
        cookies = await context.cookies()
        path = Path(cookie_file_path).expanduser()

        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(cookies, f, indent=2)

        return len(cookies)
