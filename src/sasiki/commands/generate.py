"""Command for generating a workflow from a browser recording."""

from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.panel import Panel

from sasiki.workflow.skill_generator import SkillGenerator

app = typer.Typer()
console = Console()


def _print_header() -> None:
    """Print the application header."""
    console.print(Panel.fit(
        "[bold blue]Sasiki[/bold blue] - 工作流摹刻 Agent\n"
        "[dim]观察一次，永久复用[/dim]",
        border_style="blue",
    ))


@app.command()
def generate(
    recording_file: Path = typer.Argument(..., help="Path to JSONL recording file", exists=True),
    name: Optional[str] = typer.Option(None, "--name", "-n", help="Workflow name"),
    description: Optional[str] = typer.Option(None, "--description", "-d", help="Workflow description"),
    preview: bool = typer.Option(False, "--preview", help="Preview LLM input without generating"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Generate but don't save"),
) -> None:
    """Generate a workflow (Skill) from a browser recording.

    Analyzes the recording using LLM to extract a structured, reusable workflow
    with stages, variables, and checkpoints.
    """
    _print_header()

    # Validate recording file
    recording_file = Path(recording_file)
    if not recording_file.exists():
        console.print(f"[red]Recording file not found: {recording_file}[/red]")
        raise typer.Exit(1)

    # Preview mode
    if preview:
        console.print(f"\n[blue]Analyzing recording:[/blue] {recording_file}")

        try:
            generator = SkillGenerator()
            preview_data = generator.preview_generation(recording_file)

            console.print("\n[bold]Recording Metadata:[/bold]")
            console.print(f"  Session: {preview_data['metadata']['session_id']}")
            console.print(f"  Duration: {preview_data['metadata']['duration_seconds']:.1f}s")
            console.print(f"  Actions: {preview_data['action_count']}")

            console.print("\n[bold]Narrative Preview (first 50 lines):[/bold]")
            lines = preview_data['narrative_preview'].split('\n')[:50]
            console.print("\n".join(lines))
            if len(preview_data['narrative_preview'].split('\n')) > 50:
                console.print("\n[dim]... (truncated for preview)[/dim]")

            structured = preview_data.get("structured_preview", {})
            if structured:
                s_meta = structured.get("metadata", {})
                console.print("\n[bold]Structured Preview:[/bold]")
                console.print(
                    "  Selected/Total Actions: "
                    f"{s_meta.get('selected_action_count', 0)}/{s_meta.get('total_action_count', 0)}"
                )
                console.print(f"  Truncated: {s_meta.get('truncated', False)}")
                console.print(f"  Sample Actions: {len(structured.get('actions', []))}")
                console.print(f"  Page Groups: {len(structured.get('page_groups', {}))}")

            stats = preview_data.get("preserved_field_stats", {})
            if stats:
                console.print("\n[bold]Preserved Field Stats:[/bold]")
                console.print(f"  With page_context: {stats.get('actions_with_page_context', 0)}")
                console.print(f"  With target_hint_raw: {stats.get('actions_with_target_hint_raw', 0)}")
                console.print(f"  With DOM context: {stats.get('actions_with_dom_context', 0)}")

            console.print("\n[yellow]Preview complete. Run without --preview to generate workflow.[/yellow]")
            return

        except Exception as e:
            console.print(f"[red]Error analyzing recording: {e}[/red]")
            raise typer.Exit(1)

    # Generation mode
    console.print(f"\n[blue]Generating workflow from:[/blue] {recording_file}")
    console.print("[dim]This may take a moment while the LLM analyzes the recording...[/dim]\n")

    try:
        generator = SkillGenerator()
        workflow = generator.generate_from_recording(
            recording_path=recording_file,
            name=name,
            description=description,
            save=not dry_run,
        )

        # Display results
        if dry_run:
            console.print("[yellow]Dry run mode - workflow not saved[/yellow]")
        else:
            console.print("[green]✓ Workflow generated and saved[/green]")

        console.print(f"\n[bold]Workflow:[/bold] {workflow.name}")
        console.print(f"[dim]{workflow.description}[/dim]")
        console.print(f"\nID: {workflow.id}")

        # Display stages
        console.print(f"\n[bold]Stages ({len(workflow.stages)}):[/bold]")
        for i, stage in enumerate(workflow.stages, 1):
            console.print(f"  {i}. {stage.name} [dim]({len(stage.actions)} actions)[/dim]")

        # Display variables
        if workflow.variables:
            console.print(f"\n[bold]Variables ({len(workflow.variables)}):[/bold]")
            for var in workflow.variables:
                req = "[red]*[/red]" if var.required else ""
                console.print(f"  • {var.name}{req}: {var.description}")
                if var.example:
                    console.print(f"    [dim]Example: {var.example}[/dim]")

        # Display checkpoints
        if workflow.checkpoints:
            console.print(f"\n[bold]Checkpoints ({len(workflow.checkpoints)}):[/bold]")
            for cp in workflow.checkpoints:
                console.print(f"  • After stage {cp.after_stage}: {cp.description}")

        console.print(f"\n[dim]Use 'sasiki show {workflow.id}' to view full details[/dim]")
        console.print(f"[dim]Use 'sasiki run {workflow.id}' to test the workflow[/dim]")

    except FileNotFoundError as e:
        console.print(f"[red]Error: {e}[/red]")
        raise typer.Exit(1)
    except ValueError as e:
        console.print(f"[red]Error parsing LLM response: {e}[/red]")
        console.print("[dim]The LLM may have returned an invalid format. Try again or adjust the recording.[/dim]")
        raise typer.Exit(1)
    except Exception as e:
        console.print(f"[red]Error generating workflow: {e}[/red]")
        raise typer.Exit(1)
