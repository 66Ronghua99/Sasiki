import type { DesktopRunEvent } from "../../shared/runs";

export type RunEventListener = (event: DesktopRunEvent) => void;

export class RunEventBus {
  private readonly eventsByRun = new Map<string, DesktopRunEvent[]>();
  private readonly listenersByRun = new Map<string, Set<RunEventListener>>();
  private readonly listenersAll = new Set<RunEventListener>();

  publish(runId: string, event: DesktopRunEvent): void {
    const events = this.eventsByRun.get(runId) ?? [];
    events.push(event);
    this.eventsByRun.set(runId, events);

    this.deliver(this.listenersByRun.get(runId), event, (listener) => {
      const listeners = this.listenersByRun.get(runId);
      if (!listeners) {
        return;
      }

      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listenersByRun.delete(runId);
      }
    });

    this.deliver(this.listenersAll, event, (listener) => {
      this.listenersAll.delete(listener);
    });
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

  subscribeAll(listener: RunEventListener): () => void {
    this.listenersAll.add(listener);

    return () => {
      this.listenersAll.delete(listener);
    };
  }

  private deliver(
    listeners: Set<RunEventListener> | undefined,
    event: DesktopRunEvent,
    removeListener: (listener: RunEventListener) => void,
  ): void {
    if (!listeners) {
      return;
    }

    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        removeListener(listener);
      }
    }
  }
}
