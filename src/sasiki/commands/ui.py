"""UI helpers for CLI commands.

Provides common UI utilities like header printing to avoid duplication
across command modules.
"""

from typing import TYPE_CHECKING

from rich.console import Console
from rich.panel import Panel

if TYPE_CHECKING:
    from sasiki.workflow.models import Workflow

_console = Console()


def print_header(
    title: str = "Sasiki",
    subtitle: str = "工作流摹刻 Agent",
    tagline: str = "观察一次，永久复用",
    border_style: str = "blue",
    console: Console | None = None,
) -> None:
    """Print the application header.

    Args:
        title: The main title to display (bold)
        subtitle: The subtitle/description
        tagline: Additional tagline (dimmed)
        border_style: Color/style for the panel border
        console: Optional console instance (uses default if not provided)
    """
    console = console or _console

    # Build title with Rich markup using format to avoid f-string bracket conflicts
    title_markup = "[bold {style}]{text}[/bold {style}]".format(
        style=border_style, text=title
    )
    content_parts = [title_markup]
    if subtitle:
        content_parts.append(f" - {subtitle}")
    if tagline:
        content_parts.append(f"\n[dim]{tagline}[/dim]")

    console.print(Panel.fit(
        "".join(content_parts),
        border_style=border_style,
    ))


def print_workflow_panel(
    workflow: "Workflow",
    console: Console | None = None,
    border_style: str = "blue",
) -> None:
    """Print a workflow info panel.

    Args:
        workflow: The workflow object to display
        console: Optional console instance (uses default if not provided)
        border_style: Color/style for the panel border
    """
    console = console or _console

    console.print(Panel.fit(
        f"[bold]{workflow.name}[/bold]\n"
        f"[dim]{workflow.description}[/dim]\n"
        f"\nStages: {len(workflow.stages)} | Variables: {len(workflow.variables)}",
        title="Workflow",
        border_style=border_style,
    ))
