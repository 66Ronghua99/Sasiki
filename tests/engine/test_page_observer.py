import asyncio
import json
import pytest
from playwright.async_api import async_playwright
from sasiki.engine.page_observer import AccessibilityObserver

@pytest.mark.asyncio
async def test_accessibility_observer():
    html_content = """
    <!DOCTYPE html>
    <html>
    <head><title>Test Page</title></head>
    <body>
        <div class="wrapper">
            <header>
                <h1 role="heading">Welcome to Sasiki</h1>
                <nav>
                    <a href="/home">Home</a>
                    <a href="/about">About</a>
                </nav>
            </header>
            <main>
                <div class="unimportant-div">
                    <p>This is a paragraph of text.</p>
                </div>
                <div class="form-container">
                    <input type="text" placeholder="Search..." aria-label="Search box" />
                    <button>Submit</button>
                </div>
                <div role="button" aria-label="Custom Button" onclick="alert('hi')">Custom Button</div>
                <svg width="100" height="100">
                   <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" />
                </svg>
            </main>
        </div>
    </body>
    </html>
    """

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.set_content(html_content)

        observer = AccessibilityObserver()
        result = await observer.observe(page)
        
        compressed_tree = result["compressed_tree"]
        node_map = result["node_map"]

        print("\n=== Compressed Tree ===")
        print(json.dumps(compressed_tree, indent=2))
        
        print("\n=== Node Map Keys ===")
        print(list(node_map.keys()))

        await browser.close()
        
        # Basic assertions
        assert compressed_tree is not None
        assert len(node_map) > 0
        
        # Check if basic elements were extracted
        found_roles = [node_info["clean_node"]["role"] for node_info in node_map.values()]
        assert "heading" in found_roles
        assert "link" in found_roles
        assert "button" in found_roles
        assert "textbox" in found_roles
        assert "StaticText" in found_roles # The paragraph text

if __name__ == "__main__":
    asyncio.run(test_accessibility_observer())
