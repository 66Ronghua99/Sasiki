import { useEffect, useRef, useState } from "react";
import type { SasikiDesktopApi } from "../../../shared/ipc/contracts";
import type { DesktopRunEvent } from "../../../shared/runs";
import { resolveDesktopClient } from "./desktop-client";

const EMPTY_EVENTS: DesktopRunEvent[] = [];

export function useRunSubscription(
  runId: string | null,
  client?: SasikiDesktopApi,
  initialEvents: DesktopRunEvent[] = EMPTY_EVENTS,
) {
  const desktopClient = resolveDesktopClient(client);
  const [events, setEvents] = useState<DesktopRunEvent[]>(() => initialEvents);
  const previousRunId = useRef<string | null>(runId);
  const initialEventsRef = useRef(initialEvents);

  initialEventsRef.current = initialEvents;

  useEffect(() => {
    if (previousRunId.current !== runId) {
      previousRunId.current = runId;
      setEvents(initialEventsRef.current);
    }

    if (!runId || !desktopClient) {
      return;
    }

    return desktopClient.runs.subscribe(runId, (event) => {
      setEvents((current) => [...current, event]);
    });
  }, [desktopClient, runId]);

  return events;
}
