import asyncio
import os
from sasiki.engine.playwright_env import PlaywrightEnvironment
from sasiki.engine.replay_agent import ReplayAgent
from sasiki.engine.cookie_manager import SessionManager
from sasiki.engine.replay_models import AgentAction

class HistoryAgent(ReplayAgent):
    def __init__(self):
        super().__init__()
        self.history = []

    async def step(self, page, goal: str) -> AgentAction:
        observation = await self.observer.observe(page)
        compressed_tree = observation["compressed_tree"]
        self.current_node_map = observation["node_map"]
        
        # Build prompt with history
        history_text = "\n".join([f"Step {i+1}: {act.action_type} target {act.target_id} (value: {act.value})" for i, act in enumerate(self.history)])
        if not history_text:
            history_text = "None"

        system_prompt = """You are a highly capable web automation agent.
You are given a compressed representation of the current page's Accessibility Tree.
Each interactable or readable node has a unique 'id' (e.g., 12).
Your task is to choose the single next action to take to progress towards the user's goal.
You MUST output your choice in a valid JSON format matching this schema:
{
  "thought": "Reasoning based on DOM, goal, AND PAST HISTORY.",
  "action_type": "click" | "fill" | "hover" | "press" | "extract_text" | "assert_visible" | "ask_human" | "done",
  "target_id": 12, // Optional, required for click/fill/hover
  "value": "text to fill or key to press", // Optional
  "message": "Message to user if asking human or done" // Optional
}
Ensure the output is strictly parseable JSON."""

        import json
        user_prompt = f"""Goal: {goal}

Past Action History:
{history_text}
(Do not repeat actions if they have already been successful. If you just clicked an input, the next logical step is to type/fill it, or press Enter.)

Current Page DOM Snapshot:
{json.dumps(compressed_tree, ensure_ascii=False)}

Choose the next action."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        response_str = await self.llm.complete_async(messages=messages, temperature=0.1, response_format={"type": "json_object"})
        
        try:
            clean_str = response_str.strip()
            if clean_str.startswith("```json"): clean_str = clean_str[7:]
            if clean_str.startswith("```"): clean_str = clean_str[3:]
            if clean_str.endswith("```"): clean_str = clean_str[:-3]
            import json
            action_data = json.loads(clean_str.strip())
            action = AgentAction(**action_data)
            
            # Record in history
            self.history.append(action)
            return action
        except Exception as e:
            raise

async def main():
    print("Launching Playwright...")
    env = PlaywrightEnvironment(user_data_dir="./browser_data", headless=False)
    page = await env.start()
    
    cookie_file = "browser_cookies/xhs.json"
    if os.path.exists(cookie_file):
        await SessionManager.inject_cookies_from_file(env.context, cookie_file)
    
    await page.goto("https://www.xiaohongshu.com")
    await page.wait_for_load_state("networkidle")
    
    agent = HistoryAgent()
    
    goal = """1. Find the search box and fill "AI Agent" into it.
2. Press "Enter" key to search.
3. Click the first resulting article image/title to open it.
4. Finish the task (done)."""

    print(f"Goal:\n{goal}")
    
    for i in range(10):
        print(f"\n--- Step {i+1} ---")
        action = await agent.step(page, goal)
        print(f"Thought: {action.thought}")
        print(f"Action: {action.action_type} (target: {action.target_id}, value: {action.value})")
        
        if action.action_type == "done":
            break
            
        await agent.execute_action(page, action)
        await asyncio.sleep(3)
        await page.wait_for_load_state("networkidle")

if __name__ == "__main__":
    asyncio.run(main())
