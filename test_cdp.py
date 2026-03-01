import asyncio
import json
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.set_content("<h1>Hello</h1><button aria-label='Click me'>Click me</button>")
        
        client = await page.context.new_cdp_session(page)
        await client.send('Accessibility.enable')
        res = await client.send('Accessibility.getFullAXTree')
        
        print(json.dumps(res['nodes'], indent=2))
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
