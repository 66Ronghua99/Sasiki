"""Action formatter for creating human-readable summaries of browser actions."""

from typing import Any


class ActionFormatter:
    """Formatter for creating human-readable action summaries from rich context."""

    def format_action_text(self, action_detail: dict[str, Any]) -> str:
        """Create human-readable action summary using rich context."""
        action_type = action_detail.get("action_type", "action")
        target_hint = (
            action_detail.get("normalized_target_hint")
            or action_detail.get("target_hint")
            or {}
        )
        target_name = target_hint.get("name")
        url = (action_detail.get("page_context") or {}).get("url")
        value = action_detail.get("value")
        sibling_texts = target_hint.get("sibling_texts", [])

        # Handle fill/type action
        if action_type in {"type", "fill"} and value is not None:
            if target_name and not self._looks_like_id(target_name):
                return f'Fill "{value}" into "{target_name}"'
            return f'Fill "{value}"'

        # Handle navigate action
        if action_type == "navigate":
            nav_url = action_detail.get("url") or url or ""
            if nav_url:
                return f'Navigate to "{nav_url}"'
            return "Navigate to page"

        # For click and other actions, try to build rich description
        element_type = self._infer_element_type(target_hint)

        # Special handling for interaction buttons (like/collect/share)
        # These often have counts in sibling_texts that are meaningful
        if element_type in ["like button", "collect button", "share button"]:
            count_suffix = self._format_count_suffix(sibling_texts)
            return f'{action_type.capitalize()} {element_type}{count_suffix}'

        # Try to get meaningful context from siblings
        meaningful_text = self._extract_meaningful_text(sibling_texts)

        # If target_name looks like an ID, prefer meaningful text from siblings
        if self._looks_like_id(target_name):
            if meaningful_text:
                if element_type == "link":
                    return f'{action_type.capitalize()} link "{meaningful_text}"'
                return f'{action_type.capitalize()} {element_type} "{meaningful_text}"'
            # No meaningful text, use generic element description
            if element_type != "element":
                return f'{action_type.capitalize()} {element_type}'
        else:
            # target_name is meaningful
            if element_type == "link":
                return f'{action_type.capitalize()} link "{target_name}"'
            return f'{action_type.capitalize()} "{target_name}"'

        # Fallbacks
        action_str = str(action_type) if action_type else "action"
        if url:
            return f"{action_str.capitalize()} on page"
        return action_str.capitalize()

    def _looks_like_id(self, text: str | None) -> bool:
        """Check if text looks like an ID (hex string or very long alphanumeric)."""
        if not text or not isinstance(text, str):
            return True
        # Strip quotes and whitespace
        text = text.strip().strip('"')
        if not text:
            return True
        # Check for hex pattern (24+ chars of hex)
        if len(text) >= 24 and all(c in "0123456789abcdefABCDEF" for c in text):
            return True
        # Check for mostly numeric (like "83" as a standalone count)
        return bool(text.isdigit() and len(text) <= 4)

    def _extract_meaningful_text(self, sibling_texts: list[str]) -> str | None:
        """Extract meaningful text from sibling_texts, filtering out IDs and numbers."""
        if not sibling_texts:
            return None
        for text in sibling_texts:
            if not self._looks_like_id(text):
                # Truncate long text
                text = text.strip()
                if len(text) > 50:
                    text = text[:47] + "..."
                return text
        return None

    def _infer_element_type(self, target_hint: dict[str, Any]) -> str:
        """Infer element type from class_name, role, and tag_name."""
        class_name = target_hint.get("class_name", "")
        role = target_hint.get("role", "")
        tag_name = target_hint.get("tag_name", "")

        if not class_name:
            class_name = ""

        # Check for common interaction patterns
        class_lower = class_name.lower()

        if "like" in class_lower or "点赞" in class_lower:
            return "like button"
        if "collect" in class_lower or "收藏" in class_lower:
            return "collect button"
        if "share" in class_lower or "分享" in class_lower:
            return "share button"
        if "comment" in class_lower or "评论" in class_lower:
            return "comment button"
        if "follow" in class_lower or "关注" in class_lower:
            return "follow button"

        # Check role
        if role == "link":
            return "link"
        if role == "button":
            return "button"
        if role == "textbox":
            return "text input"

        # Check tag name
        if tag_name == "a":
            return "link"
        if tag_name == "button":
            return "button"
        if tag_name in ["input", "textarea"]:
            return "text input"
        if tag_name == "svg":
            return "icon"
        if tag_name == "img":
            return "image"

        return "element"

    def _format_count_suffix(self, sibling_texts: list[str]) -> str:
        """Format count suffix from sibling texts (e.g., '83 likes')."""
        if not sibling_texts:
            return ""
        # Find numeric text that could be a count
        for text in sibling_texts:
            text = text.strip()
            # Match patterns like "83", "1万", "1.2k", "2,345"
            if text and (
                text.isdigit()
                or (len(text) <= 5 and any(c in text for c in "万kK,+"))
            ):
                return f" ({text})"
        return ""

    def remove_null_values(self, obj: Any) -> Any:
        """Recursively remove null/empty values from dict/list."""
        if isinstance(obj, dict):
            result_dict: dict[str, Any] = {}
            for k, v in obj.items():
                cleaned = self.remove_null_values(v)
                # Keep only non-null, non-empty values
                if cleaned is not None and cleaned != "" and cleaned != []:
                    result_dict[k] = cleaned
            return result_dict
        elif isinstance(obj, list):
            return [self.remove_null_values(item) for item in obj if item is not None]
        return obj
