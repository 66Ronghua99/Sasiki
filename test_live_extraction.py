import asyncio
import json
import os
from sasiki.engine.playwright_env import PlaywrightEnvironment
from sasiki.engine.page_observer import AccessibilityObserver
from sasiki.engine.cookie_manager import SessionManager

async def main():
    print("Launching Playwright with a dedicated persistent profile...")
    print("This will open a new Chrome window that saves your login state.")
    try:
        # We use a local dedicated profile for Sasiki to avoid conflicts with your main Chrome
        env = PlaywrightEnvironment(
            user_data_dir="./browser_data",
            headless=False
        )
        page = await env.start()
        print(f"Successfully launched! Current URL: {page.url}")
        
        # Inject cookies if available
        cookie_file = "browser_cookies/xhs.json"
        if os.path.exists(cookie_file):
            print(f"Found cookie file {cookie_file}, injecting...")
            await SessionManager.inject_cookies_from_file(env.context, cookie_file)
            print("Cookies injected successfully.")
        
        # Navigate to target page
        target_url = "https://www.xiaohongshu.com"
        print(f"Navigating to {target_url}...")
        await page.goto(target_url)
        # Wait for network idle to ensure the page is loaded
        await page.wait_for_load_state("networkidle")
        print(f"Navigated to {page.url}")
        
        observer = AccessibilityObserver()
        print("Capturing Accessibility Tree...")
        result = await observer.observe(page)
        
        compressed_tree = result["compressed_tree"]
        node_map = result["node_map"]
        
        # Save output to a file so it doesn't flood the console
        with open("live_dom_snapshot.json", "w") as f:
            json.dump(compressed_tree, f, indent=2, ensure_ascii=False)
            
        print(f"Success! Found {len(node_map)} interactive/readable nodes.")
        print("Snapshot saved to 'live_dom_snapshot.json'")
        
        # Show a quick summary
        roles = {}
        for node in node_map.values():
            role = node['clean_node']['role']
            roles[role] = roles.get(role, 0) + 1
            
        print("Role distribution:", roles)
        
    except Exception as e:
        print(f"Failed to connect or observe: {e}")
        
if __name__ == "__main__":
    asyncio.run(main())
