import os
from typing import Optional, Any
from playwright.async_api import async_playwright, Page, BrowserContext, Playwright, Browser

class PlaywrightEnvironment:
    """Manages the Playwright browser lifecycle, supporting personal Chrome profiles."""

    def __init__(
        self,
        cdp_url: Optional[str] = None,
        user_data_dir: Optional[str] = None,
        executable_path: Optional[str] = None,
        headless: bool = False,
    ):
        """
        Args:
            cdp_url: If provided, connects to an existing browser via CDP (e.g. 'http://localhost:9222').
                     Best way to use personal Chrome without closing it first.
            user_data_dir: Path to Chrome user data dir to use a persistent profile.
                           Note: Chrome must be closed if using the default profile path.
            executable_path: Path to the Chrome binary.
            headless: Whether to run headlessly.
        """
        self.cdp_url = cdp_url
        self.user_data_dir = os.path.expanduser(user_data_dir) if user_data_dir else None
        self.executable_path = executable_path
        self.headless = headless

        self._playwright: Optional[Playwright] = None
        self.context: Optional[BrowserContext] = None
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None

    async def start(self) -> Page:
        self._playwright = await async_playwright().start()
        
        if self.cdp_url:
            # Connect to an existing running browser via CDP
            self.browser = await self._playwright.chromium.connect_over_cdp(self.cdp_url)
            assert self.browser is not None
            # Find the first active page, or create a new one
            contexts = self.browser.contexts
            if contexts:
                self.context = contexts[0]
                pages = self.context.pages
                self.page = pages[0] if pages else await self.context.new_page()
            else:
                self.context = await self.browser.new_context()
                self.page = await self.context.new_page()
                
        elif self.user_data_dir:
            # Launch persistent context using personal profile
            self.context = await self._playwright.chromium.launch_persistent_context(
                user_data_dir=self.user_data_dir,
                executable_path=self.executable_path,
                headless=self.headless,
                no_viewport=True, # Let the browser use standard window size
            )
            pages = self.context.pages
            self.page = pages[0] if pages else await self.context.new_page()
            
        else:
            # Standard ephemeral launch
            self.browser = await self._playwright.chromium.launch(
                headless=self.headless,
                executable_path=self.executable_path
            )
            assert self.browser is not None
            self.context = await self.browser.new_context()
            self.page = await self.context.new_page()

        return self.page

    async def stop(self) -> None:
        # We don't close the context/browser if we attached via CDP
        if not self.cdp_url:
            if self.context:
                await self.context.close()
            if self.browser:
                await self.browser.close()

        if self._playwright:
            await self._playwright.stop()
