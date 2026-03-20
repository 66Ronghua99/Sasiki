import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCliArguments,
  parseRuntimeArguments,
  parseSopCompactArguments,
} from "../../src/runtime/command-router.js";

test("parseRuntimeArguments preserves current runtime grammar", () => {
  assert.deepEqual(
    parseRuntimeArguments([
      "--config",
      "agent.config.json",
      "--mode=observe",
      "--sop-run-id",
      "sop-123",
      "--resume-run-id=resume-456",
      "hello",
      "world",
    ]),
    {
      command: "runtime",
      configPath: "agent.config.json",
      mode: "observe",
      task: "hello world",
      sopRunId: "sop-123",
      resumeRunId: "resume-456",
    }
  );
});

test("parseSopCompactArguments preserves current compact grammar", () => {
  assert.deepEqual(
    parseSopCompactArguments(["--config=agent.config.json", "--semantic", "on", "run-123"]),
    {
      command: "sop-compact",
      configPath: "agent.config.json",
      runId: "run-123",
      semanticMode: "on",
    }
  );
});

test("parseCliArguments rejects archived sop compact commands", () => {
  assert.throws(
    () => parseCliArguments(["sop-compact-hitl"]),
    /sop-compact-hitl is archived\. use `sop-compact --run-id <run_id>` on the interactive reasoning path instead\./
  );
});

test("parseCliArguments delegates sop compact parsing", () => {
  assert.deepEqual(parseCliArguments(["sop-compact", "--run-id", "run-777"]), {
    command: "sop-compact",
    configPath: undefined,
    runId: "run-777",
    semanticMode: undefined,
  });
});

test("parseRuntimeArguments rejects invalid mode values", () => {
  assert.throws(
    () => parseRuntimeArguments(["--mode", "invalid"]),
    /invalid --mode value: invalid\. expected run\|observe/
  );
});

test("parseSopCompactArguments rejects invalid semantic values", () => {
  assert.throws(
    () => parseSopCompactArguments(["--run-id", "run-1", "--semantic", "invalid"]),
    /invalid --semantic value: invalid\. expected off\|auto\|on/
  );
});

test("parseSopCompactArguments requires a run id", () => {
  assert.throws(
    () => parseSopCompactArguments([]),
    /missing run id\. usage: sop-compact --run-id <run_id>/
  );
});
