import type { DesktopRunEvent } from "../../shared/runs";

export type RunEventListener = (event: DesktopRunEvent) => void;

export class RunEventBus {
  private readonly eventsByRun = new Map<string, DesktopRunEvent[]>();
  private readonly listenersByRun = new Map<string, Set<RunEventListener>>();

  publish(runId: string, event: DesktopRunEvent): void {
    const events = this.eventsByRun.get(runId) ?? [];
    events.push(event);
    this.eventsByRun.set(runId, events);

    const listeners = this.listenersByRun.get(runId);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener(event);
    }
  }

  list(runId: string): DesktopRunEvent[] {
    return [...(this.eventsByRun.get(runId) ?? [])];
  }

  subscribe(runId: string, listener: RunEventListener): () => void {
    const listeners = this.listenersByRun.get(runId) ?? new Set<RunEventListener>();
    listeners.add(listener);
    this.listenersByRun.set(runId, listeners);

    return () => {
      const active = this.listenersByRun.get(runId);
      if (!active) {
        return;
      }
      active.delete(listener);
      if (active.size === 0) {
        this.listenersByRun.delete(runId);
      }
    };
  }
}
