import asyncio
from typing import Any, Dict, List, Optional
from playwright.async_api import Page


class AccessibilityObserver:
    """Observer that extracts and compresses the Accessibility Tree for LLM consumption using CDP."""

    # Node roles that are typically useful for interaction or reading.
    INTERACTIVE_ROLES = {
        "button", "link", "checkbox", "menuitem", "menuitemcheckbox",
        "menuitemradio", "radio", "searchbox", "slider", "spinbutton",
        "switch", "tab", "textbox", "combobox", "option", "treeitem"
    }

    READABLE_ROLES = {
        "text", "heading", "paragraph", "article", "document", "listitem", "StaticText"
    }

    def __init__(self):
        # We assign a simple integer ID to each node we present to the LLM.
        # This helps the LLM specify targets like "Click target_id: 5".
        self.node_counter = 0
        self.node_map: Dict[int, Dict[str, Any]] = {}

    def _should_keep_node(self, node: Dict[str, Any]) -> bool:
        """Decide whether a node should be included in the compressed tree."""
        # CDP ignored nodes usually shouldn't be kept unless they have something vital
        if node.get("ignored"):
            return False

        role = node.get("role", {}).get("value", "")
        name = node.get("name", {}).get("value", "").strip()

        # If it's interactive, we almost always keep it.
        if role in self.INTERACTIVE_ROLES:
            return True

        # If it's readable, we keep it if it actually has text.
        if role in self.READABLE_ROLES and name:
            return True

        # Keep some structural nodes if they have meaningful names (sometimes used as ad-hoc buttons).
        if role in {"generic", "img", "image"} and name:
            return True

        return False

    def _compress_tree(self, node: Dict[str, Any], node_dict: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Recursively compress the accessibility tree from a flat CDP representation."""
        compressed_children = []
        for child_id in node.get("childIds", []):
            if child_id in node_dict:
                compressed_child = self._compress_tree(node_dict[child_id], node_dict)
                if compressed_child:
                    # If the child returned a list (flattened), extend. Otherwise append.
                    if isinstance(compressed_child, list):
                        compressed_children.extend(compressed_child)
                    else:
                        compressed_children.append(compressed_child)

        should_keep = self._should_keep_node(node)

        if should_keep:
            self.node_counter += 1
            node_id = self.node_counter

            role = node.get("role", {}).get("value", "")
            name = node.get("name", {}).get("value", "").strip()

            # Keep only the essential fields to save tokens
            clean_node = {
                "id": node_id,
                "role": role,
            }
            if name:
                clean_node["name"] = name

            # Extract properties like disabled, value, description
            for prop in node.get("properties", []):
                prop_name = prop.get("name")
                prop_val = prop.get("value", {}).get("value")
                if prop_name in ["disabled", "value", "description"] and prop_val:
                    clean_node[prop_name] = prop_val

            # Special case for input values
            if node.get("value", {}).get("value"):
                clean_node["value"] = node.get("value", {}).get("value")
            if node.get("description", {}).get("value"):
                clean_node["description"] = node.get("description", {}).get("value")

            # Store the original path/details in our local map for later execution
            # The LLM only sees the clean_node
            
            # Convert role from CDP internal role (e.g. 'StaticText') to playwright accessible role if possible
            locator_role = role
            if role == "StaticText":
                locator_role = "text"

            self.node_map[node_id] = {
                "clean_node": clean_node,
                "raw_node": node,
                "locator_args": {
                    "role": locator_role,
                    "name": name if name else None
                }
            }

            if compressed_children:
                clean_node["children"] = compressed_children

            return clean_node

        else:
            # If we don't keep this node, but it has kept children, we flatten them up.
            # This removes useless nested wrappers like <div><div><button>...
            if not compressed_children:
                return None
            if len(compressed_children) == 1:
                return compressed_children[0]
            return compressed_children


    async def observe(self, page: Page) -> Dict[str, Any]:
        """
        Capture the accessibility snapshot using CDP and return a highly compressed version
        suitable for LLM prompts, along with the internal mapping.
        """
        self.node_counter = 0
        self.node_map = {}

        # Playwright Python removed page.accessibility.snapshot() in v1.42
        # So we use CDP directly to get the Accessibility tree.
        client = await page.context.new_cdp_session(page)
        try:
            await client.send('Accessibility.enable')
            res = await client.send('Accessibility.getFullAXTree')
        finally:
            await client.send('Accessibility.disable')
            await client.detach()

        nodes = res.get('nodes', [])
        if not nodes:
            return {"compressed_tree": {}, "node_map": {}}

        node_dict = {str(n['nodeId']): n for n in nodes}
        
        # Find the root node (usually the one without a parentId)
        root_node = None
        for n in nodes:
            if 'parentId' not in n:
                root_node = n
                break
        
        if not root_node:
            root_node = nodes[0] # Fallback to first node

        compressed_tree = self._compress_tree(root_node, node_dict)

        return {
            "compressed_tree": compressed_tree,
            "node_map": self.node_map
        }
