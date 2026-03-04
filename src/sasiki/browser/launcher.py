"""CDP browser launcher utilities for agent sessions."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from sasiki.browser.cookies import SessionManager

DEFAULT_CDP_ENDPOINT = "http://localhost:9222"
DEFAULT_PROFILE_DIR = Path.home() / ".sasiki" / "chrome_profile"
DEFAULT_COOKIES_DIR = Path.home() / ".sasiki" / "cookies"


def log(msg: str, level: str = "INFO") -> None:
    """Print timestamped launcher logs."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}")


def parse_cdp_port(cdp_endpoint: str) -> int:
    """Extract CDP port from endpoint string."""
    parsed = urlparse(cdp_endpoint)
    if parsed.port is not None:
        return parsed.port
    return 9222


def is_local_cdp_endpoint(cdp_endpoint: str) -> bool:
    """Return True when endpoint points to local host."""
    parsed = urlparse(cdp_endpoint)
    hostname = parsed.hostname
    return hostname in {None, "localhost", "127.0.0.1"}


@dataclass(slots=True)
class CdpLaunchResult:
    """Launch metadata for CDP browser startup."""

    cookie_files_loaded: int = 0
    cookies_injected: int = 0


class CdpBrowserLauncher:
    """Launches and manages a local Chromium with CDP enabled."""

    def __init__(
        self,
        *,
        cdp_endpoint: str = DEFAULT_CDP_ENDPOINT,
        user_data_dir: str | Path = DEFAULT_PROFILE_DIR,
        cookies_dir: str | Path = DEFAULT_COOKIES_DIR,
        headless: bool = False,
        viewport_width: int = 1280,
        viewport_height: int = 720,
    ) -> None:
        self.cdp_endpoint = cdp_endpoint
        self.cdp_port = parse_cdp_port(cdp_endpoint)
        self.user_data_dir = Path(user_data_dir).expanduser()
        self.cookies_dir = Path(cookies_dir).expanduser()
        self.headless = headless
        self.viewport_width = viewport_width
        self.viewport_height = viewport_height

        self._playwright: Any | None = None
        self._context: Any | None = None

    def start(self) -> CdpLaunchResult:
        """Start local browser and inject cookies if present."""
        if not is_local_cdp_endpoint(self.cdp_endpoint):
            raise ValueError(f"only local CDP endpoints are supported for auto-launch: {self.cdp_endpoint}")

        from playwright.sync_api import sync_playwright

        self.user_data_dir.mkdir(parents=True, exist_ok=True)
        self.cookies_dir.mkdir(parents=True, exist_ok=True)

        log(f"启动 CDP 浏览器: {self.cdp_endpoint}")
        log(f"使用 profile: {self.user_data_dir}")
        log(f"使用 cookies: {self.cookies_dir}")

        self._playwright = sync_playwright().start()
        self._context = self._playwright.chromium.launch_persistent_context(
            user_data_dir=str(self.user_data_dir),
            args=[f"--remote-debugging-port={self.cdp_port}"],
            headless=self.headless,
            viewport={"width": self.viewport_width, "height": self.viewport_height},
        )

        if not self._context.pages:
            self._context.new_page()

        loaded_files, loaded_cookies = SessionManager.inject_all_cookies_sync(self._context, self.cookies_dir)
        if loaded_files > 0:
            log(f"已注入 cookies: {loaded_cookies} 条（来自 {loaded_files} 个文件）")
        else:
            log("未发现可注入的 cookie 文件")

        return CdpLaunchResult(
            cookie_files_loaded=loaded_files,
            cookies_injected=loaded_cookies,
        )

    def stop(self) -> None:
        """Stop browser and Playwright resources."""
        try:
            if self._context is not None:
                self._context.close()
                log("浏览器上下文已关闭")
        finally:
            self._context = None

        if self._playwright is not None:
            self._playwright.stop()
            self._playwright = None
            log("Playwright 已停止")

    def keep_alive(self) -> None:
        """Keep browser alive until interrupted."""
        log("浏览器保持运行中，按 Ctrl+C 停止...")
        try:
            while True:
                time.sleep(1.0)
        except KeyboardInterrupt:
            log("收到停止信号")


def main() -> None:
    """Standalone launcher entrypoint for manual debugging."""
    endpoint = os.getenv("PLAYWRIGHT_MCP_CDP_ENDPOINT", DEFAULT_CDP_ENDPOINT)
    launcher = CdpBrowserLauncher(cdp_endpoint=endpoint)
    try:
        launcher.start()
        log("浏览器启动成功")
        log(f"CDP endpoint: {endpoint}")
        launcher.keep_alive()
    finally:
        launcher.stop()


if __name__ == "__main__":
    main()
