import asyncio
import os
import yaml
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
    
    # Inject cookies if available
    cookie_file = "browser_cookies/xhs.json"
    if os.path.exists(cookie_file):
        await SessionManager.inject_cookies_from_file(env.context, cookie_file)
        print("Cookies injected successfully.")
    
    print("Navigating to Xiaohongshu...")
    await page.goto("https://www.xiaohongshu.com")
    await page.wait_for_load_state("networkidle")
    
    # Let's mock a simple YAML-like workflow task
    workflow_yaml = """
name: 搜索并点赞AI笔记
description: 在小红书搜索AI相关内容，找到第一篇笔记，点击进入，并提取出它的标题或者点赞数。
stages:
  - name: 搜索阶段
    actions:
      - 点击顶部搜索框
      - 输入 "AI Agent" 并执行搜索
  - name: 浏览阶段
    actions:
      - 等待搜索结果加载
      - 点击第一篇笔记封面进入详情页
  - name: 提取阶段
    actions:
      - 提取笔记的标题文本
      - 结束任务
"""
    print("================================")
    print(f"Executing Raw Workflow Goal:\n{workflow_yaml}")
    print("================================")
    
    agent = ReplayAgent()
    
    # We pass the entire YAML as the high-level goal for the agent
    goal = f"You must execute the following workflow step by step:\n\n{workflow_yaml}\n\nWhen you finish all stages, use the 'done' action."
    
    max_steps = 15
    step_count = 0
    
    while step_count < max_steps:
        step_count += 1
        print(f"\n--- Step {step_count} ---")
        print("Agent is observing and thinking...")
        
        try:
            action = await agent.step(page, goal)
            
            print(f"Action Type: {action.action_type}")
            print(f"Thought: {action.thought}")
            if action.target_id:
                print(f"Target ID: {action.target_id}")
            if action.value:
                print(f"Value: {action.value}")
            if action.message:
                print(f"Message: {action.message}")
                
            if action.action_type == "done":
                print("\n[SUCCESS] Agent declared the workflow is done!")
                break
                
            if action.action_type == "ask_human":
                print("\n[PAUSED] Agent needs human assistance. Stopping loop for now.")
                break
                
            print("Executing action...")
            result = await agent.execute_action(page, action)
            
            if action.action_type == "extract_text":
                print(f"[EXTRACTED]: {result}")
                
            # Wait a bit for the page to react
            await page.wait_for_timeout(2000) 
            await page.wait_for_load_state("networkidle")
            
        except Exception as e:
            print(f"\n[ERROR] Agent failed during step {step_count}: {e}")
            break
            
    if step_count >= max_steps:
        print("\n[WARNING] Max steps reached without completion.")

if __name__ == "__main__":
    asyncio.run(main())
