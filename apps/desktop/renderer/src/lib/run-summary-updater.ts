import type { DesktopRunEvent, DesktopRunSummary } from "../../../shared/runs";

export function mergeRunSummaries(
  runs: DesktopRunSummary[],
  events: DesktopRunEvent[],
): DesktopRunSummary[] {
  if (events.length === 0) {
    return runs;
  }

  const nextRuns = new Map(runs.map((run) => [run.runId, run] as const));

  for (const event of events) {
    const current = nextRuns.get(event.runId);
    if (!current) {
      continue;
    }

    nextRuns.set(event.runId, updateRunSummary(current, event));
  }

  return [...nextRuns.values()];
}

export function updateRunSummary(
  run: DesktopRunSummary,
  event: DesktopRunEvent,
): DesktopRunSummary {
  if (event.type === "run.log") {
    return {
      ...run,
      updatedAt: event.timestamp,
    };
  }

  if (event.type === "run.started") {
    return {
      ...run,
      status: "running",
      updatedAt: event.timestamp,
    };
  }

  if (event.type === "run.queued") {
    return {
      ...run,
      status: event.status,
      updatedAt: event.timestamp,
    };
  }

  if (event.type === "run.interrupted") {
    return {
      ...run,
      status: "interrupted",
      updatedAt: event.timestamp,
    };
  }

  if (event.type === "run.finished") {
    if (run.status === "interrupted") {
      return {
        ...run,
        updatedAt: event.timestamp,
      };
    }

    return {
      ...run,
      status: event.status,
      updatedAt: event.timestamp,
    };
  }

  return run;
}
