import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { RunEventBus } from "../../../main/runs/run-event-bus";
import { RunEventForwarder } from "../../../main/runs/run-event-forwarder";
import { RunManager, createRunsIpcHandlers } from "../../../main/runs/run-manager";
import type { DesktopRuntimeService } from "../../../main/runs/run-manager";
import { desktopChannels } from "../../../shared/ipc/channels";

function createRuntimeStub(): DesktopRuntimeService {
  return {
    async runObserve(request, hooks = {}) {
      hooks.onEvent?.({
        type: "run.started",
        workflow: "observe",
        status: "running",
        timestamp: new Date().toISOString(),
      });
      hooks.onEvent?.({
        type: "run.log",
        workflow: "observe",
        level: "info",
        message: `observe:${request.task}`,
        timestamp: new Date().toISOString(),
      });
      hooks.onEvent?.({
        type: "run.finished",
        workflow: "observe",
        status: "completed",
        timestamp: new Date().toISOString(),
      });
      return {
        mode: "observe",
        runId: "observe-run",
        taskHint: request.task,
        status: "completed",
        finishReason: "observe_timeout_reached",
        artifactsDir: "/tmp/observe-run",
      };
    },
    async runCompact() {
      throw new Error("not implemented");
    },
    async runRefine() {
      throw new Error("not implemented");
    },
    async requestInterrupt() {
      return true;
    },
    async stop() {
      // no-op
    },
  };
}

function createSubscriber(id: number) {
  const messages: Array<{ channel: string; payload: unknown }> = [];
  let destroyedListener: (() => void) | null = null;
  let destroyed = false;

  return {
    id,
    messages,
    send(channel: string, payload: unknown) {
      messages.push({ channel, payload });
    },
    once(_event: "destroyed", listener: () => void) {
      destroyedListener = listener;
    },
    isDestroyed() {
      return destroyed;
    },
    destroy() {
      destroyed = true;
      destroyedListener?.();
    },
  };
}

describe("Run event forwarding", () => {
  test("forwarder delivers live run events onto the desktop event channel", async () => {
    const eventBus = new RunEventBus();
    const runManager = new RunManager({
      createRuntime: createRuntimeStub,
      events: eventBus,
      createRunId: () => "desktop-observe-1",
    });
    const forwarder = new RunEventForwarder(runManager);
    const handlers = createRunsIpcHandlers(runManager, { forwarder });
    const subscriber = createSubscriber(7);

    await handlers.subscribe({ runId: "desktop-observe-1" }, { sender: subscriber });
    await runManager.startObserve({ task: "record a baidu search" });

    assert.equal(subscriber.messages.length > 0, true);
    assert.equal(subscriber.messages[0]?.channel, desktopChannels.runs.events);
  });

  test("forwarder deduplicates repeat subscriptions and cleans up on destroy", async () => {
    const eventBus = new RunEventBus();
    const runManager = new RunManager({
      createRuntime: createRuntimeStub,
      events: eventBus,
      createRunId: () => "desktop-observe-1",
    });
    const forwarder = new RunEventForwarder(runManager);
    const handlers = createRunsIpcHandlers(runManager, { forwarder });
    const subscriber = createSubscriber(9);

    await handlers.subscribe({ runId: "desktop-observe-1" }, { sender: subscriber });
    await handlers.subscribe({ runId: "desktop-observe-1" }, { sender: subscriber });
    await runManager.startObserve({ task: "record a baidu search" });

    const firstMessageCount = subscriber.messages.length;
    subscriber.destroy();
    eventBus.publish("desktop-observe-1", {
      type: "run.log",
      runId: "desktop-observe-1",
      workflow: "observe",
      timestamp: new Date().toISOString(),
      level: "info",
      message: "after destroy",
    });

    assert.equal(firstMessageCount > 0, true);
    assert.equal(subscriber.messages.length, firstMessageCount);
  });

  test("forwarder removes a run subscription when the preload cleanup unsubscribes it", async () => {
    const eventBus = new RunEventBus();
    const runManager = new RunManager({
      createRuntime: createRuntimeStub,
      events: eventBus,
      createRunId: () => "desktop-observe-1",
    });
    const forwarder = new RunEventForwarder(runManager);
    const handlers = createRunsIpcHandlers(runManager, { forwarder }) as {
      subscribe(
        request: { runId: string },
        context: { sender: ReturnType<typeof createSubscriber> },
      ): Promise<{ subscribed: boolean; eventChannel: string }>;
      unsubscribe(
        request: { runId: string },
        context: { sender: ReturnType<typeof createSubscriber> },
      ): Promise<{ unsubscribed: boolean }>;
    };
    const subscriber = createSubscriber(13);

    await handlers.subscribe({ runId: "desktop-observe-1" }, { sender: subscriber });
    await handlers.unsubscribe({ runId: "desktop-observe-1" }, { sender: subscriber });
    await runManager.startObserve({ task: "record a baidu search" });

    assert.equal(subscriber.messages.length, 0);
  });

  test("forwarder streams every run event through the global subscription path", async () => {
    const eventBus = new RunEventBus();
    const runManager = new RunManager({
      createRuntime: createRuntimeStub,
      events: eventBus,
      createRunId: () => "desktop-observe-1",
    });
    const forwarder = new RunEventForwarder(runManager);
    const handlers = createRunsIpcHandlers(runManager, { forwarder });
    const subscriber = createSubscriber(11);

    await handlers.subscribeAll({}, { sender: subscriber });
    eventBus.publish("desktop-observe-1", {
      type: "run.log",
      runId: "desktop-observe-1",
      workflow: "observe",
      timestamp: new Date().toISOString(),
      level: "info",
      message: "global event",
    });

    const firstMessageCount = subscriber.messages.length;

    subscriber.destroy();
    eventBus.publish("desktop-observe-2", {
      type: "run.log",
      runId: "desktop-observe-2",
      workflow: "refine",
      timestamp: new Date().toISOString(),
      level: "warning",
      message: "after destroy",
    });

    assert.equal(firstMessageCount > 0, true);
    assert.equal(
      subscriber.messages.some((entry) => entry.payload && typeof entry.payload === "object"),
      true,
    );
    assert.equal(subscriber.messages.length, firstMessageCount);
  });
});
