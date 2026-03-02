from typing import Any

from playwright.async_api import Page
from pydantic import BaseModel, ConfigDict, Field


class CompressedNode(BaseModel):
    """A compressed accessibility node suitable for LLM consumption.

    This model represents a single node in the compressed accessibility tree,
    containing only essential fields to minimize token usage while preserving
    the information needed for interaction decisions.
    """

    model_config = ConfigDict(extra="ignore")

    node_id: int = Field(..., description="Sequential ID assigned for LLM reference")
    role: str = Field(..., description="Accessibility role (button, link, textbox, etc.)")
    name: str | None = Field(default=None, description="Accessible name/text content")
    disabled: bool | None = Field(default=None, description="Whether the node is disabled")
    value: str | None = Field(default=None, description="Current value for input fields")
    description: str | None = Field(default=None, description="Additional description")
    children: list["CompressedNode"] = Field(default_factory=list, description="Child nodes")


class LocatorInfo(BaseModel):
    """Locator information for finding this node via Playwright."""

    role: str = Field(..., description="Playwright accessible role")
    name: str | None = Field(None, description="Name to match")


class NodeMapping(BaseModel):
    """Internal mapping between compressed node ID and full node details."""

    clean_node: CompressedNode = Field(..., description="The compressed representation")
    raw_node: dict[str, Any] = Field(..., description="Original CDP node data")
    locator_args: LocatorInfo = Field(..., description="Playwright locator arguments")


class ObservationResult(BaseModel):
    """Result from observing a page's accessibility tree."""

    compressed_tree: CompressedNode | list[CompressedNode] | None = Field(
        None, description="Compressed tree root or list of roots"
    )
    node_map: dict[int, NodeMapping] = Field(default_factory=dict, description="ID to node mapping")


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

    def __init__(self) -> None:
        # We assign a simple integer ID to each node we present to the LLM.
        # This helps the LLM specify targets like "Click target_id: 5".
        self.node_counter = 0
        self.node_map: dict[int, NodeMapping] = {}

    def _should_keep_node(self, node: dict[str, Any]) -> bool:
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
        return bool(role in {"generic", "img", "image"} and name)

    def _compress_tree(
        self,
        node: dict[str, Any],
        node_dict: dict[str, Any],
    ) -> CompressedNode | None:
        """Recursively compress the accessibility tree from a flat CDP representation.

        Returns a CompressedNode if this node or its descendants should be kept,
        or None if neither this node nor any descendants are relevant.
        """
        # Collect compressed children first
        compressed_children: list[CompressedNode] = []
        for child_id in node.get("childIds", []):
            if child_id in node_dict:
                compressed_child = self._compress_tree(node_dict[child_id], node_dict)
                if compressed_child is not None:
                    compressed_children.append(compressed_child)

        should_keep = self._should_keep_node(node)

        if should_keep:
            self.node_counter += 1
            node_id = self.node_counter

            role = node.get("role", {}).get("value", "")
            name = node.get("name", {}).get("value", "").strip()

            # Build the compressed node with essential fields only
            clean_node = CompressedNode(
                node_id=node_id,
                role=role,
                name=name if name else None,
                children=compressed_children if compressed_children else [],
            )

            # Extract properties like disabled, value, description
            for prop in node.get("properties", []):
                prop_name = prop.get("name")
                prop_val = prop.get("value", {}).get("value")
                if prop_name == "disabled" and prop_val:
                    clean_node.disabled = bool(prop_val)
                elif prop_name == "value" and prop_val:
                    clean_node.value = str(prop_val)
                elif prop_name == "description" and prop_val:
                    clean_node.description = str(prop_val)

            # Special case for input values from different location
            if node.get("value", {}).get("value"):
                clean_node.value = node.get("value", {}).get("value")
            if node.get("description", {}).get("value"):
                clean_node.description = node.get("description", {}).get("value")

            # Convert role from CDP internal role to playwright accessible role
            locator_role = role
            if role == "StaticText":
                locator_role = "text"

            # Store the mapping for later execution
            self.node_map[node_id] = NodeMapping(
                clean_node=clean_node,
                raw_node=node,
                locator_args=LocatorInfo(
                    role=locator_role,
                    name=name if name else None,
                ),
            )

            return clean_node

        # Not keeping this node - return children if any (flattening)
        if not compressed_children:
            return None
        if len(compressed_children) == 1:
            return compressed_children[0]
        # When there are multiple children but parent is not kept,
        # we return the first child. This maintains type consistency
        # while still providing useful information.
        # Alternative: could create a wrapper group node here.
        return compressed_children[0]

    async def observe(self, page: Page) -> ObservationResult:
        """Capture the accessibility snapshot using CDP.

        Returns a highly compressed version suitable for LLM prompts,
        along with the internal mapping for element interaction.
        """
        self.node_counter = 0
        self.node_map = {}

        # Playwright Python removed page.accessibility.snapshot() in v1.42
        # So we use CDP directly to get the Accessibility tree.
        client = await page.context.new_cdp_session(page)
        try:
            await client.send("Accessibility.enable")
            res = await client.send("Accessibility.getFullAXTree")
        finally:
            await client.send("Accessibility.disable")
            await client.detach()

        nodes = res.get("nodes", [])
        if not nodes:
            return ObservationResult(compressed_tree=None, node_map={})

        node_dict = {str(n["nodeId"]): n for n in nodes}

        # Find the root node (usually the one without a parentId)
        root_node = None
        for n in nodes:
            if "parentId" not in n:
                root_node = n
                break

        if not root_node:
            root_node = nodes[0]  # Fallback to first node

        compressed_tree = self._compress_tree(root_node, node_dict)

        return ObservationResult(
            compressed_tree=compressed_tree,
            node_map=self.node_map,
        )
