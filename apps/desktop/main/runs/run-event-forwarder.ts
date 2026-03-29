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
  subscriberId: number;
}

export class RunEventForwarder {
  private readonly subscriptions = new Map<string, SubscriptionState>();
  private readonly subscriptionKeysBySubscriber = new Map<number, Set<string>>();
  private readonly destroyListenersRegistered = new Set<number>();

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
    this.subscriptions.set(key, { unsubscribe, refCount: 1, subscriberId: subscriber.id });
    this.trackSubscriptionKey(subscriber.id, key);
    this.ensureDestroyListener(subscriber);

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
    this.subscriptions.set(key, { unsubscribe, refCount: 1, subscriberId: subscriber.id });
    this.trackSubscriptionKey(subscriber.id, key);
    this.ensureDestroyListener(subscriber);

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
      this.removeSubscriptionsForSubscriber(subscriber.id);
      return;
    }

    try {
      subscriber.send(desktopChannels.runs.events, {
        runId,
        event,
      });
    } catch {
      this.removeSubscriptionsForSubscriber(subscriber.id);
    }
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
    this.untrackSubscriptionKey(subscription.subscriberId, key);
  }

  private removeSubscription(key: string): void {
    const subscription = this.subscriptions.get(key);
    if (!subscription) {
      return;
    }

    subscription.unsubscribe();
    this.subscriptions.delete(key);
    this.untrackSubscriptionKey(subscription.subscriberId, key);
  }

  private removeSubscriptionsForSubscriber(subscriberId: number): void {
    const keys = [...(this.subscriptionKeysBySubscriber.get(subscriberId) ?? [])];
    for (const key of keys) {
      this.removeSubscription(key);
    }
  }

  private trackSubscriptionKey(subscriberId: number, key: string): void {
    const keys = this.subscriptionKeysBySubscriber.get(subscriberId) ?? new Set<string>();
    keys.add(key);
    this.subscriptionKeysBySubscriber.set(subscriberId, keys);
  }

  private untrackSubscriptionKey(subscriberId: number, key: string): void {
    const keys = this.subscriptionKeysBySubscriber.get(subscriberId);
    if (!keys) {
      return;
    }

    keys.delete(key);
    if (keys.size === 0) {
      this.subscriptionKeysBySubscriber.delete(subscriberId);
    }
  }

  private ensureDestroyListener(subscriber: RunEventSubscriber): void {
    if (this.destroyListenersRegistered.has(subscriber.id)) {
      return;
    }

    this.destroyListenersRegistered.add(subscriber.id);
    subscriber.once("destroyed", () => {
      this.removeSubscriptionsForSubscriber(subscriber.id);
    });
  }
}
