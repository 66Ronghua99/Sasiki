import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { RunEventBus } from "../../../main/runs/run-event-bus";
import type { DesktopRunEvent } from "../../../shared/runs";

describe("RunEventBus", () => {
  test("publishing a run event ignores a broken listener and keeps delivering to the rest", () => {
    const bus = new RunEventBus();
    const delivered: DesktopRunEvent[] = [];
    const event = {
      type: "run.log",
      runId: "desktop-observe-1",
      workflow: "observe",
      timestamp: new Date().toISOString(),
      level: "info",
      message: "hello",
    } as const;

    bus.subscribe("desktop-observe-1", () => {
      throw new Error("listener failed");
    });
    bus.subscribe("desktop-observe-1", (candidate) => {
      delivered.push(candidate);
    });

    assert.doesNotThrow(() => {
      bus.publish("desktop-observe-1", event);
    });

    assert.deepEqual(delivered, [event]);
  });
});
