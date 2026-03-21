import assert from "node:assert/strict";
import test from "node:test";

import { createProcessInterruptHandler } from "../../../src/application/shell/process-interrupt-handler.js";

test("process interrupt handler exits immediately when runtime cannot stop gracefully", async () => {
  const writes: string[] = [];
  const exits: number[] = [];
  const signals: string[] = [];

  const handleInterrupt = createProcessInterruptHandler({
    requestInterrupt: async (signal) => {
      signals.push(signal);
      return false;
    },
    writeStderr: (message) => {
      writes.push(message);
    },
    forceExit: (code) => {
      exits.push(code);
    },
  });

  await handleInterrupt("SIGINT");

  assert.deepEqual(signals, ["SIGINT"]);
  assert.deepEqual(exits, [130]);
  assert.match(writes[0] ?? "", /no graceful stop available/i);
});

test("process interrupt handler escalates to force exit on a repeated signal", async () => {
  const writes: string[] = [];
  const exits: number[] = [];
  let interruptCalls = 0;

  const handleInterrupt = createProcessInterruptHandler({
    requestInterrupt: async () => {
      interruptCalls += 1;
      return true;
    },
    writeStderr: (message) => {
      writes.push(message);
    },
    forceExit: (code) => {
      exits.push(code);
    },
  });

  await handleInterrupt("SIGTERM");
  await handleInterrupt("SIGTERM");

  assert.equal(interruptCalls, 1);
  assert.deepEqual(exits, [130]);
  assert.match(writes[0] ?? "", /requesting graceful stop/i);
  assert.match(writes[1] ?? "", /force exiting after repeated SIGTERM/i);
});
