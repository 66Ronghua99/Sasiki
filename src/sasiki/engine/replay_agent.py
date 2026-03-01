"""The Replay Agent that executes tasks by observing the DOM and asking the LLM."""

import json
from typing import Any, Dict, Optional
from playwright.async_api import Page

from sasiki.engine.page_observer import AccessibilityObserver
from sasiki.engine.replay_models import AgentAction
from sasiki.llm.client import LLMClient
from sasiki.utils.logger import logger

class ReplayAgent:
    def __init__(self):
        self.observer = AccessibilityObserver()
        self.llm = LLMClient()

    async def _get_element_center(self, page: Page, backend_node_id: int) -> tuple[float, float]:
        """Gets the center coordinates of an element using CDP."""
        client = await page.context.new_cdp_session(page)
        try:
            res = await client.send("DOM.getBoxModel", {"backendNodeId": backend_node_id})
            quad = res["model"]["border"]
            # quad is [x1, y1, x2, y2, x3, y3, x4, y4]
            # typical order: top-left, top-right, bottom-right, bottom-left
            x = sum([quad[i] for i in range(0, 8, 2)]) / 4
            y = sum([quad[i] for i in range(1, 8, 2)]) / 4
            return x, y
        finally:
            await client.detach()

    async def step(self, page: Page, goal: str) -> AgentAction:
        """Takes a single step towards the goal."""
        
        logger.info("replay_agent_step_start", goal=goal)
        
        # 1. Observe the page
        observation = await self.observer.observe(page)
        compressed_tree = observation["compressed_tree"]
        self.current_node_map = observation["node_map"]
        
        # 2. Build the prompt
        system_prompt = """You are a highly capable web automation agent.
You are given a compressed representation of the current page's Accessibility Tree.
Each interactable or readable node has a unique 'id' (e.g., 12).
Your task is to choose the single next action to take to progress towards the user's goal.
You MUST output your choice in a valid JSON format matching this schema:
{
  "thought": "Reasoning based on DOM and goal",
  "action_type": "click" | "fill" | "hover" | "press" | "extract_text" | "assert_visible" | "ask_human" | "done",
  "target_id": 12, // Optional, required for click/fill/hover
  "value": "text to fill or key to press", // Optional
  "message": "Message to user if asking human or done" // Optional
}
Ensure the output is strictly parseable JSON."""

        user_prompt = f"""Goal: {goal}

Current Page DOM Snapshot:
{json.dumps(compressed_tree, ensure_ascii=False)}

Choose the next action."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        # 3. Call LLM
        response_str = await self.llm.complete_async(
            messages=messages,
            temperature=0.1,
            # Force JSON format if supported by OpenRouter/DashScope
            response_format={"type": "json_object"}
        )
        
        # 4. Parse output
        try:
            # Clean up potential markdown formatting from LLM
            clean_str = response_str.strip()
            if clean_str.startswith("```json"):
                clean_str = clean_str[7:]
            if clean_str.startswith("```"):
                clean_str = clean_str[3:]
            if clean_str.endswith("```"):
                clean_str = clean_str[:-3]
                
            action_data = json.loads(clean_str.strip())
            action = AgentAction(**action_data)
            logger.info("replay_agent_action_decided", action=action.model_dump())
            return action
        except Exception as e:
            logger.error("Failed to parse LLM action", error=str(e), response=response_str)
            raise

    async def execute_action(self, page: Page, action: AgentAction) -> Any:
        """Executes the chosen action using Playwright."""
        
        # Actions that don't require a target
        if action.action_type == "done":
            logger.info("replay_agent_done", message=action.message)
            return action.message
            
        if action.action_type == "ask_human":
            logger.info("replay_agent_ask_human", message=action.message)
            # In a real CLI, we would use prompt/input here.
            # For now, we simulate pausing.
            print(f"\n[Agent Asks Human]: {action.message}")
            return "paused_for_human"
            
        if action.action_type == "press":
            if not action.value:
                raise ValueError("Action 'press' requires a 'value'")
            await page.keyboard.press(action.value)
            return True

        # Actions that DO require a target
        if not action.target_id:
            raise ValueError(f"Action {action.action_type} requires a target_id")
            
        if action.target_id not in self.current_node_map:
            raise ValueError(f"Target ID {action.target_id} not found in node map")
            
        node_info = self.current_node_map[action.target_id]
        raw_node = node_info["raw_node"]
        backend_node_id = raw_node.get("backendDOMNodeId")
        
        if not backend_node_id:
            raise ValueError(f"Target ID {action.target_id} has no backendDOMNodeId")

        # Execute based on geometry
        x, y = await self._get_element_center(page, backend_node_id)
        
        if action.action_type == "click":
            await page.mouse.click(x, y)
        elif action.action_type == "hover":
            await page.mouse.move(x, y)
        elif action.action_type == "fill":
            if not action.value:
                raise ValueError("Action 'fill' requires a 'value'")
            # To fill, we click to focus, then type.
            await page.mouse.click(x, y)
            # Clear existing text first (simple heuristic: cmd+a, backspace)
            await page.keyboard.press("Meta+A") # Mac
            await page.keyboard.press("Control+A") # Windows/Linux
            await page.keyboard.press("Backspace")
            await page.keyboard.type(action.value)
        elif action.action_type == "extract_text":
            return raw_node.get("name", {}).get("value", "")
        elif action.action_type == "assert_visible":
            return True # If it's in the accessibility tree, it's generally visible
            
        return True
