"""Analyzes recording sessions to extract workflows."""

from pathlib import Path

import cv2

from sasiki.config import settings
from sasiki.llm.client import LLMClient
from sasiki.recorder.events import EventType, RecordingSession
from sasiki.utils.image import encode_image_base64, get_optimal_resolution, resize_for_llm
from sasiki.utils.logger import logger
from sasiki.workflow.models import Checkpoint, Workflow, WorkflowStage, WorkflowVariable


class SessionAnalyzer:
    """Analyzes a recording session to extract a reusable workflow."""

    def __init__(self):
        self.llm = LLMClient()

    def analyze_session(self, session: RecordingSession) -> Workflow:
        """Analyze a complete recording session and generate a workflow.

        This is the main entry point for offline workflow extraction.
        """
        logger.info(
            "starting_session_analysis",
            session_id=str(session.metadata.id),
            screenshots=session.metadata.total_screenshots,
            events=session.metadata.total_events,
        )

        # Step 1: Load and prepare frames
        frames = self._load_frames(session)
        logger.info("frames_loaded", count=len(frames))

        # Step 2: Analyze frames with VLM (in batches)
        observations = self._analyze_frames_batch(frames)
        logger.info("frame_analysis_complete", observations=len(observations))

        # Step 3: Summarize events
        events_summary = self._summarize_events(session)

        # Step 4: Extract structured workflow
        workflow_data = self.llm.extract_workflow(
            observation="\n\n".join(observations),
            events_summary=events_summary,
        )

        # Step 5: Create Workflow object
        workflow = self._create_workflow(workflow_data, session)

        logger.info(
            "workflow_extraction_complete",
            workflow_name=workflow.name,
            stages=len(workflow.stages),
        )

        return workflow

    def _load_frames(
        self,
        session: RecordingSession,
        max_frames: int | None = None,
    ) -> list[tuple[Path, float]]:
        """Load frame paths and timestamps from session.

        Returns list of (path, timestamp_seconds) tuples.
        """
        if not session.screenshots_dir:
            return []

        frames = []
        for img_path in sorted(session.screenshots_dir.glob("frame_*.jpg")):
            # Parse timestamp from filename: frame_00123456.jpg
            try:
                timestamp_ms = int(img_path.stem.split('_')[1])
                timestamp_sec = timestamp_ms / 1000.0
                frames.append((img_path, timestamp_sec))
            except (IndexError, ValueError):
                continue

        # Smart sampling if too many frames
        max_frames = max_frames or settings.max_frames_per_analysis
        if len(frames) > max_frames:
            # Sample evenly across the timeline
            step = len(frames) / max_frames
            sampled = []
            for i in range(max_frames):
                idx = int(i * step)
                sampled.append(frames[idx])
            frames = sampled
            logger.info("frames_sampled", original=len(frames), sampled=max_frames)

        return frames

    def _analyze_frames_batch(
        self,
        frames: list[tuple[Path, float]],
    ) -> list[str]:
        """Analyze frames in batches using VLM.

        Process frames in groups to avoid token limits and cost.
        """
        observations = []
        batch_size = 10  # Frames per API call

        for i in range(0, len(frames), batch_size):
            batch = frames[i:i + batch_size]

            # Load and encode images
            batch_data = []
            for path, timestamp in batch:
                try:
                    img = cv2.imread(str(path))
                    if img is None:
                        continue

                    # Resize based on content
                    max_width = get_optimal_resolution(img)
                    resized = resize_for_llm(img, max_width=max_width)

                    # Encode
                    b64 = encode_image_base64(resized, quality=85)
                    batch_data.append((b64, timestamp))

                except Exception as e:
                    logger.warning("failed_to_load_frame", path=str(path), error=str(e))
                    continue

            if not batch_data:
                continue

            # Call VLM
            try:
                observation = self.llm.analyze_frames(
                    frames=batch_data,
                    context=f"Batch {i//batch_size + 1}/{(len(frames) + batch_size - 1)//batch_size}"
                )
                observations.append(observation)

                logger.debug(
                    "batch_analyzed",
                    batch=i//batch_size + 1,
                    frames=len(batch_data),
                )

            except Exception as e:
                logger.error("batch_analysis_error", batch=i//batch_size, error=str(e))
                continue

        return observations

    def _summarize_events(self, session: RecordingSession) -> str:
        """Create a text summary of recorded events."""
        lines = []

        # Group events by type
        event_counts = {}
        for event in session.events:
            event_counts[event.event_type.value] = event_counts.get(event.event_type.value, 0) + 1

        lines.append("Event counts:")
        for event_type, count in sorted(event_counts.items()):
            lines.append(f"  {event_type}: {count}")

        # App usage timeline
        lines.append("\nApplication timeline:")
        current_app = None
        app_start_time = None

        for event in session.events:
            if event.app_name and event.app_name != current_app:
                if current_app and app_start_time:
                    lines.append(f"  {current_app}: {app_start_time:.1f}s - {event.timestamp.timestamp():.1f}s")
                current_app = event.app_name
                app_start_time = event.timestamp.timestamp()

        # Key events
        lines.append("\nKey events:")
        for event in session.events[:50]:  # First 50 events
            if event.event_type in [
                EventType.APP_SWITCH,
                EventType.CLIPBOARD_COPY,
                EventType.CLIPBOARD_PASTE,
                EventType.FILE_SAVE,
            ]:
                lines.append(
                    f"  [{event.timestamp.timestamp():.1f}s] {event.event_type.value}"
                    f"{' in ' + event.app_name if event.app_name else ''}"
                    f"{' - ' + str(event.data) if event.data else ''}"
                )

        return "\n".join(lines)

    def _create_workflow(
        self,
        data: dict,
        session: RecordingSession,
    ) -> Workflow:
        """Create a Workflow object from extracted data."""

        stages = [
            WorkflowStage(
                name=stage["name"],
                application=stage.get("application"),
                actions=stage.get("actions", []),
                inputs=stage.get("inputs", []),
                outputs=stage.get("outputs", []),
            )
            for stage in data.get("stages", [])
        ]

        variables = [
            WorkflowVariable(
                name=var["name"],
                description=var.get("description", ""),
                var_type=var.get("type", "text"),
                example=var.get("example"),
            )
            for var in data.get("variables", [])
        ]

        checkpoints = [
            Checkpoint(
                after_stage=cp.get("after_stage", 0),
                description=cp.get("description", ""),
                manual_confirmation=cp.get("manual_confirmation", True),
            )
            for cp in data.get("checkpoints", [])
        ]

        return Workflow(
            name=data.get("workflow_name", "Unnamed Workflow"),
            description=data.get("description", ""),
            source_session_id=session.metadata.id,
            stages=stages,
            variables=variables,
            checkpoints=checkpoints,
            estimated_duration_minutes=data.get("estimated_duration_minutes"),
        )
