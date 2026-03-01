"""Data models for the Replay Agent's actions."""

from typing import Optional, Literal
from pydantic import BaseModel, Field

class AgentAction(BaseModel):
    thought: str = Field(..., description="Reasoning for the chosen action based on the current DOM and goal.")
    action_type: Literal[
        "click", "fill", "hover", "press", "extract_text", 
        "assert_visible", "ask_human", "done"
    ] = Field(..., description="The type of action to perform.")
    target_id: Optional[int] = Field(
        None, 
        description="The integer 'id' of the element from the DOM snapshot to interact with. Required for click, fill, hover, extract_text, assert_visible."
    )
    value: Optional[str] = Field(
        None, 
        description="The value to fill (for 'fill' action) or the key to press (for 'press' action, e.g. 'Enter')."
    )
    message: Optional[str] = Field(
        None, 
        description="Message to show the user if asking for human help (ask_human), or the final result summary (done)."
    )
