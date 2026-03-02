"""Utility for migrating cookies and local storage from the main Chrome profile."""

import os
import json
from pathlib import Path
from typing import Any
from playwright.async_api import BrowserContext

class SessionManager:
    """Manages moving session state (cookies) between profiles or from raw JSON."""
    
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
