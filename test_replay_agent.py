import asyncio
import os
from sasiki.engine.playwright_env import PlaywrightEnvironment
from sasiki.engine.replay_agent import ReplayAgent
from sasiki.engine.cookie_manager import SessionManager

async def main():
    print("Launching Playwright with a dedicated persistent profile...")
    env = PlaywrightEnvironment(
        user_data_dir="./browser_data",
        headless=False
    )
    page = await env.start()
    
    # Inject cookies if available (optional)
    cookie_file = "browser_cookies/xhs.json"
    if os.path.exists(cookie_file):
        await SessionManager.inject_cookies_from_file(env.context, cookie_file)
        print("Cookies injected successfully.")
    
    print("Navigating to Baidu...")
    await page.goto("https://www.baidu.com")
    await page.wait_for_load_state("networkidle")
    
    agent = ReplayAgent()
    goal = "Search for 'Playwright Python' using the search box."
    print(f"\nGoal: {goal}")
    
    print("Agent is thinking...")
    action = await agent.step(page, goal)
    
    print(f"\nAgent decided to: {action.action_type}")
    print(f"Thought: {action.thought}")
    if action.target_id:
        print(f"Target ID: {action.target_id}")
    if action.value:
        print(f"Value: {action.value}")
        
    print("\nExecuting action...")
    await agent.execute_action(page, action)
    print("Action executed successfully.")
    
    # Give it a second to show the result
    await asyncio.sleep(2)
    
if __name__ == "__main__":
    asyncio.run(main())
