import { useEffect, useRef, useState } from "react";
import type { SasikiDesktopApi } from "../../../shared/ipc/contracts";
import type { DesktopRunEvent } from "../../../shared/runs";
import { createDesktopClient } from "./desktop-client";

const EMPTY_EVENTS: DesktopRunEvent[] = [];

export function useRunSubscription(
  runId: string | null,
  client: SasikiDesktopApi = createDesktopClient(),
  initialEvents: DesktopRunEvent[] = EMPTY_EVENTS,
) {
  const [events, setEvents] = useState<DesktopRunEvent[]>(() => initialEvents);
  const previousRunId = useRef<string | null>(runId);
  const initialEventsRef = useRef(initialEvents);

  initialEventsRef.current = initialEvents;

  useEffect(() => {
    if (previousRunId.current !== runId) {
      previousRunId.current = runId;
      setEvents(initialEventsRef.current);
    }

    if (!runId) {
      return;
    }

    return client.runs.subscribe(runId, (event) => {
      setEvents((current) => [...current, event]);
    });
  }, [client, runId]);

  return events;
}
