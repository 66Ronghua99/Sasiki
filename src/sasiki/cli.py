"""Command-line interface for Sasiki."""

import typer

from sasiki.commands.generate import generate
from sasiki.commands.record import record
from sasiki.commands.refine import refine
from sasiki.commands.run import run
from sasiki.commands.server import server
from sasiki.commands.workflows import delete_workflow, list_workflows, show_workflow
from sasiki.config import get_settings
from sasiki.utils.logger import configure_logging

# Configure logging and directories at CLI startup
configure_logging()
get_settings().ensure_directories()

app = typer.Typer(
    name="sasiki",
    help="观察用户操作，自动生成可复用的工作流 Agent",
    no_args_is_help=True,
)

# Register commands from modules
app.command(name="list")(list_workflows)
app.command(name="show")(show_workflow)
app.command(name="delete")(delete_workflow)
app.command(name="generate")(generate)
app.command(name="run")(run)
app.command(name="refine")(refine)
app.command(name="record")(record)
app.command(name="server")(server)


def main() -> None:
    """Entry point for the CLI."""
    app()


if __name__ == "__main__":
    main()
