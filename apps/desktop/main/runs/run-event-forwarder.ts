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

interface SubscriptionState {
  unsubscribe: () => void;
  refCount: number;
}

export class RunEventForwarder {
  private readonly subscriptions = new Map<string, SubscriptionState>();

  constructor(
    private readonly runManager: Pick<RunManager, "subscribe" | "eventBus">,
  ) {}

  subscribe(runId: string, subscriber: RunEventSubscriber): boolean {
    const key = this.createKey("run", subscriber.id, runId);
    const existing = this.subscriptions.get(key);
    if (existing) {
      existing.refCount += 1;
      return true;
    }

    const unsubscribe = this.runManager.subscribe(runId, (event) => {
      this.forwardEvent(runId, event, subscriber);
    });
    this.subscriptions.set(key, { unsubscribe, refCount: 1 });

    subscriber.once("destroyed", () => {
      this.removeSubscription(key);
    });

    return true;
  }

  subscribeAll(subscriber: RunEventSubscriber): boolean {
    const key = this.createKey("all", subscriber.id);
    const existing = this.subscriptions.get(key);
    if (existing) {
      existing.refCount += 1;
      return true;
    }

    const unsubscribe = this.runManager.eventBus.subscribeAll((event) => {
      this.forwardEvent(event.runId, event, subscriber);
    });
    this.subscriptions.set(key, { unsubscribe, refCount: 1 });

    subscriber.once("destroyed", () => {
      this.removeSubscription(key);
    });

    return true;
  }

  unsubscribe(runId: string, subscriberId: number): void {
    const key = this.createKey("run", subscriberId, runId);
    this.releaseSubscription(key);
  }

  unsubscribeAll(subscriberId: number): void {
    const key = this.createKey("all", subscriberId);
    this.releaseSubscription(key);
  }

  private forwardEvent(runId: string, event: DesktopRunEvent, subscriber: RunEventSubscriber): void {
    if (subscriber.isDestroyed?.()) {
      this.removeSubscription(this.createKey("run", subscriber.id, runId));
      this.removeSubscription(this.createKey("all", subscriber.id));
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

  private releaseSubscription(key: string): void {
    const subscription = this.subscriptions.get(key);
    if (!subscription) {
      return;
    }

    subscription.refCount -= 1;
    if (subscription.refCount > 0) {
      return;
    }

    subscription.unsubscribe();
    this.subscriptions.delete(key);
  }

  private removeSubscription(key: string): void {
    const subscription = this.subscriptions.get(key);
    if (!subscription) {
      return;
    }

    subscription.unsubscribe();
    this.subscriptions.delete(key);
  }
}
