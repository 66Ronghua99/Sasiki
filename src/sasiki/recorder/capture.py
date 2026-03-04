"""Screen recording capture for macOS."""

import threading
import time
from collections.abc import Callable
from datetime import datetime
from queue import Queue

import cv2
import numpy as np
from pynput import keyboard, mouse

from sasiki.config import settings
from sasiki.recorder.events import Event, EventType, RecordingMetadata, RecordingSession
from sasiki.utils.logger import logger


class ScreenRecorder:
    """Records screen activity and user interactions."""

    def __init__(self):
        self.session: RecordingSession | None = None
        self.is_recording = False
        self.is_paused = False

        # Capture thread
        self._capture_thread: threading.Thread | None = None
        self._event_thread: threading.Thread | None = None
        self._stop_event = threading.Event()

        # Event queue
        self._event_queue: Queue = Queue()

        # Frame buffer for deduplication
        self._last_frame: np.ndarray | None = None
        self._last_event_time = 0.0

        # Listeners
        self._mouse_listener: mouse.Listener | None = None
        self._keyboard_listener: keyboard.Listener | None = None

        # Callbacks
        self.on_event: Callable[[Event], None] | None = None
        self.on_frame: Callable[[np.ndarray, float], None] | None = None

        logger.info("screen_recorder_initialized")

    def start_recording(
        self,
        name: str | None = None,
        description: str | None = None
    ) -> RecordingSession:
        """Start a new recording session."""
        if self.is_recording:
            raise RuntimeError("Recording already in progress")

        # Create session
        session_id = RecordingMetadata().id
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        base_path = settings.recordings_dir / f"{timestamp}_{str(session_id)[:8]}"
        base_path.mkdir(parents=True, exist_ok=True)

        screenshots_dir = base_path / "screenshots"
        screenshots_dir.mkdir(exist_ok=True)

        self.session = RecordingSession(
            metadata=RecordingMetadata(
                name=name or f"Recording {timestamp}",
                description=description,
                started_at=datetime.now(),
            ),
            base_path=base_path,
            screenshots_dir=screenshots_dir,
        )

        # Start recording
        self.is_recording = True
        self.is_paused = False
        self._stop_event.clear()

        # Start capture thread
        self._capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._capture_thread.start()

        # Start event processing thread
        self._event_thread = threading.Thread(target=self._process_events, daemon=True)
        self._event_thread.start()

        # Start input listeners
        self._start_listeners()

        # Record start event
        self._record_event(EventType.RECORDING_START)

        logger.info(
            "recording_started",
            session_id=str(self.session.metadata.id),
            path=str(base_path),
        )

        return self.session

    def stop_recording(self) -> RecordingSession:
        """Stop the current recording session."""
        if not self.is_recording:
            raise RuntimeError("No recording in progress")

        # Record stop event
        self._record_event(EventType.RECORDING_STOP)

        # Stop recording
        self.is_recording = False
        self._stop_event.set()

        # Stop listeners
        self._stop_listeners()

        # Wait for threads
        if self._capture_thread:
            self._capture_thread.join(timeout=2.0)
        if self._event_thread:
            self._event_thread.join(timeout=2.0)

        # Finalize session
        self.session.metadata.ended_at = datetime.now()
        duration = (
            self.session.metadata.ended_at - self.session.metadata.started_at
        ).total_seconds()
        self.session.metadata.duration_seconds = duration

        # Save session
        self._save_session()

        logger.info(
            "recording_stopped",
            session_id=str(self.session.metadata.id),
            duration=duration,
            events=self.session.metadata.total_events,
        )

        return self.session

    def pause_recording(self):
        """Pause recording without stopping."""
        if not self.is_recording:
            return
        self.is_paused = True
        self._record_event(EventType.RECORDING_PAUSE, {"action": "pause"})
        logger.info("recording_paused")

    def resume_recording(self):
        """Resume paused recording."""
        if not self.is_recording:
            return
        self.is_paused = False
        self._record_event(EventType.RECORDING_PAUSE, {"action": "resume"})
        logger.info("recording_resumed")

    def _capture_loop(self):
        """Main capture loop - captures frames and detects changes."""
        from PIL import ImageGrab

        frame_interval = settings.frame_sample_rate
        similarity_threshold = settings.similarity_threshold

        while not self._stop_event.is_set():
            if self.is_paused:
                time.sleep(0.1)
                continue

            try:
                # Capture screen
                screenshot = ImageGrab.grab()
                frame = cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2BGR)

                current_time = time.time()

                # Check if significant change from last frame
                should_capture = False
                if self._last_frame is None:
                    should_capture = True
                else:
                    from sasiki.utils.image import calculate_similarity
                    similarity = calculate_similarity(self._last_frame, frame)
                    if similarity < similarity_threshold:
                        should_capture = True

                if should_capture:
                    # Save frame
                    relative_time = current_time - self.session.metadata.started_at.timestamp()
                    filename = f"frame_{int(relative_time * 1000):08d}.jpg"
                    filepath = self.session.screenshots_dir / filename

                    # Resize for storage
                    from sasiki.utils.image import resize_for_llm
                    resized = resize_for_llm(frame, max_width=1536)
                    cv2.imwrite(str(filepath), resized, [cv2.IMWRITE_JPEG_QUALITY, 85])

                    self._last_frame = frame
                    self.session.metadata.total_screenshots += 1

                    if self.on_frame:
                        self.on_frame(frame, relative_time)

                # Sleep until next frame
                time.sleep(frame_interval)

            except Exception as e:
                logger.error("capture_error", error=str(e))
                time.sleep(1)

    def _start_listeners(self):
        """Start mouse and keyboard listeners."""
        # Mouse listener
        self._mouse_listener = mouse.Listener(
            on_click=self._on_mouse_click,
            on_scroll=self._on_mouse_scroll,
        )
        self._mouse_listener.start()

        # Keyboard listener
        self._keyboard_listener = keyboard.Listener(
            on_press=self._on_key_press,
        )
        self._keyboard_listener.start()

    def _stop_listeners(self):
        """Stop input listeners."""
        if self._mouse_listener:
            self._mouse_listener.stop()
        if self._keyboard_listener:
            self._keyboard_listener.stop()

    def _on_mouse_click(self, x, y, button, pressed):
        """Handle mouse click events."""
        if not pressed or not self.is_recording or self.is_paused:
            return

        button_name = str(button).split('.')[-1]  # 'left', 'right', 'middle'

        # Debounce - ignore clicks within 100ms
        current_time = time.time()
        if current_time - self._last_event_time < 0.1:
            return
        self._last_event_time = current_time

        event = Event(
            event_type=EventType.MOUSE_CLICK,
            mouse_x=x,
            mouse_y=y,
            data={"button": button_name},
        )
        self._event_queue.put(event)

    def _on_mouse_scroll(self, x, y, dx, dy):
        """Handle mouse scroll events."""
        if not self.is_recording or self.is_paused:
            return

        # Batch scroll events - only record every 500ms
        current_time = time.time()
        if current_time - self._last_event_time < 0.5:
            return
        self._last_event_time = current_time

        event = Event(
            event_type=EventType.MOUSE_SCROLL,
            mouse_x=x,
            mouse_y=y,
            data={"direction": "up" if dy > 0 else "down", "amount": abs(dy)},
        )
        self._event_queue.put(event)

    def _on_key_press(self, key):
        """Handle keyboard events."""
        if not self.is_recording or self.is_paused:
            return

        try:
            key_char = key.char
            event_type = EventType.KEY_PRESS
            data = {"key": key_char}
        except AttributeError:
            # Special key
            key_name = str(key).split('.')[-1]
            event_type = EventType.KEY_PRESS
            data = {"key": key_name, "special": True}

        event = Event(
            event_type=event_type,
            data=data,
        )
        self._event_queue.put(event)

    def _process_events(self):
        """Process events from the queue."""
        while not self._stop_event.is_set():
            try:
                event = self._event_queue.get(timeout=0.1)
                self._record_event(event.event_type, event.data)
            except Exception:
                continue

    def _record_event(self, event_type: EventType, data: dict = None):
        """Record an event to the session."""
        if not self.session:
            return

        # Get current app/window info (macOS specific)
        app_name, window_title = self._get_active_window_info()

        event = Event(
            event_type=event_type,
            app_name=app_name,
            window_title=window_title,
            data=data or {},
        )

        self.session.add_event(event)

        # Track apps used
        if app_name and app_name not in self.session.metadata.apps_used:
            self.session.metadata.apps_used.append(app_name)

        if self.on_event:
            self.on_event(event)

        logger.debug("event_recorded", type=event_type.value, app=app_name)

    def _get_active_window_info(self) -> tuple[str | None, str | None]:
        """Get the currently active application and window title (macOS)."""
        try:
            from AppKit import NSWorkspace
            workspace = NSWorkspace.sharedWorkspace()
            active_app = workspace.frontmostApplication()
            app_name = active_app.localizedName()

            # Window title is harder to get on macOS without accessibility permissions
            # For now, return None
            window_title = None

            return app_name, window_title
        except Exception as e:
            logger.debug("failed_to_get_window_info", error=str(e))
            return None, None

    def _save_session(self):
        """Save the recording session to disk."""
        if not self.session or not self.session.base_path:
            return

        import json

        # Save metadata
        metadata_path = self.session.base_path / "metadata.json"
        with open(metadata_path, 'w') as f:
            json.dump(self.session.metadata.model_dump(mode='json'), f, indent=2)

        # Save events
        events_path = self.session.base_path / "events.jsonl"
        with open(events_path, 'w') as f:
            for event in self.session.events:
                f.write(json.dumps(event.model_dump(mode='json')) + '\n')

        logger.info("session_saved", path=str(self.session.base_path))
