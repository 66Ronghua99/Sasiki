import { desktopChannels } from "../../shared/ipc/channels";
import type { DesktopRunEventMessage } from "../../shared/ipc/messages";
import type { DesktopRunEvent } from "../../shared/runs";
import type { RunManager } from "./run-manager";

export interface RunEventSubscriber {
  id: number;
  send(channel: string, payload: DesktopRunEventMessage): void;
  once(event: "destroyed", listener: () => void): void;
  isDestroyed?(): boolean;
}

export class RunEventForwarder {
  private readonly subscriptions = new Map<string, () => void>();

  constructor(
    private readonly runManager: Pick<RunManager, "subscribe" | "eventBus">,
  ) {}

  subscribe(runId: string, subscriber: RunEventSubscriber): boolean {
    const key = this.createKey("run", subscriber.id, runId);
    if (this.subscriptions.has(key)) {
      return false;
    }

    const unsubscribe = this.runManager.subscribe(runId, (event) => {
      this.forwardEvent(runId, event, subscriber);
    });
    this.subscriptions.set(key, unsubscribe);

    subscriber.once("destroyed", () => {
      this.unsubscribe(runId, subscriber.id);
    });

    return true;
  }

  subscribeAll(subscriber: RunEventSubscriber): boolean {
    const key = this.createKey("all", subscriber.id);
    if (this.subscriptions.has(key)) {
      return false;
    }

    const unsubscribe = this.runManager.eventBus.subscribeAll((event) => {
      this.forwardEvent(event.runId, event, subscriber);
    });
    this.subscriptions.set(key, unsubscribe);

    subscriber.once("destroyed", () => {
      this.unsubscribeAll(subscriber.id);
    });

    return true;
  }

  unsubscribe(runId: string, subscriberId: number): void {
    const key = this.createKey("run", subscriberId, runId);
    const unsubscribe = this.subscriptions.get(key);
    if (!unsubscribe) {
      return;
    }
    unsubscribe();
    this.subscriptions.delete(key);
  }

  unsubscribeAll(subscriberId: number): void {
    const key = this.createKey("all", subscriberId);
    const unsubscribe = this.subscriptions.get(key);
    if (!unsubscribe) {
      return;
    }
    unsubscribe();
    this.subscriptions.delete(key);
  }

  private forwardEvent(runId: string, event: DesktopRunEvent, subscriber: RunEventSubscriber): void {
    if (subscriber.isDestroyed?.()) {
      this.unsubscribe(runId, subscriber.id);
      this.unsubscribeAll(subscriber.id);
      return;
    }

    subscriber.send(desktopChannels.runs.events, {
      runId,
      event,
    });
  }

  private createKey(scope: "run" | "all", subscriberId: number, runId?: string): string {
    return scope === "all" ? `${scope}:${subscriberId}` : `${scope}:${subscriberId}:${runId}`;
  }
}
