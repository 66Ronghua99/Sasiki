import asyncio
import json
from sasiki.engine.playwright_env import PlaywrightEnvironment
from sasiki.engine.page_observer import AccessibilityObserver

async def main():
    print("Launching Playwright with a dedicated persistent profile...")
    print("This will open a new Chrome window that saves your login state.")
    try:
        # We use a dedicated profile for Sasiki to avoid conflicts with your main Chrome
        env = PlaywrightEnvironment(
            user_data_dir="~/.sasiki/chrome_profile",
            headless=False
        )
        page = await env.start()
        print(f"Successfully launched! Current URL: {page.url}")
        
        # Navigate to a test page if it's blank
        if page.url == "about:blank":
            await page.goto("https://www.baidu.com")
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
        print("Make sure you started Chrome with: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222")

if __name__ == "__main__":
    asyncio.run(main())
