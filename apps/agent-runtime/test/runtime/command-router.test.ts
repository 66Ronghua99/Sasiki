import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCliArguments,
  parseObserveArguments,
  parseRefineArguments,
  parseSopCompactArguments,
} from "../../src/runtime/command-router.js";

test("parseObserveArguments preserves explicit observe grammar", () => {
  assert.deepEqual(
    parseObserveArguments([
      "--config",
      "agent.config.json",
      "hello",
      "world",
    ]),
    {
      command: "observe",
      configPath: "agent.config.json",
      task: "hello world",
    }
  );
});

test("parseRefineArguments preserves explicit refine grammar including resume", () => {
  assert.deepEqual(
    parseRefineArguments([
      "--config=agent.config.json",
      "--resume-run-id=resume-456",
      "hello",
      "world",
    ]),
    {
      command: "refine",
      configPath: "agent.config.json",
      task: "hello world",
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

test("parseCliArguments delegates explicit observe parsing", () => {
  assert.deepEqual(parseCliArguments(["observe", "--config", "agent.config.json", "hello", "world"]), {
    command: "observe",
    configPath: "agent.config.json",
    task: "hello world",
  });
});

test("parseCliArguments delegates explicit refine parsing", () => {
  assert.deepEqual(
    parseCliArguments(["refine", "--config=agent.config.json", "--resume-run-id=resume-456", "hello", "world"]),
    {
      command: "refine",
      configPath: "agent.config.json",
      task: "hello world",
      resumeRunId: "resume-456",
    }
  );
});

test("parseCliArguments rejects legacy runtime command with upgrade guidance", () => {
  assert.throws(
    () => parseCliArguments(["runtime", "--mode", "observe", "hello"]),
    /legacy runtime CLI has been retired\. use `observe "task"`, `refine "task"`, or `sop-compact --run-id <run_id>` instead\./
  );
});

test("parseCliArguments rejects legacy mode flags with upgrade guidance", () => {
  assert.throws(
    () => parseCliArguments(["--mode", "run", "hello"]),
    /legacy runtime CLI has been retired\. use `observe "task"`, `refine "task"`, or `sop-compact --run-id <run_id>` instead\./
  );
});

test("parseCliArguments rejects implicit legacy runtime grammar with upgrade guidance", () => {
  assert.throws(
    () => parseCliArguments(["hello", "world"]),
    /legacy runtime CLI has been retired\. use `observe "task"`, `refine "task"`, or `sop-compact --run-id <run_id>` instead\./
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

test("parseRefineArguments preserves empty task when resume id is provided", () => {
  assert.deepEqual(parseRefineArguments(["--resume-run-id", "run-1"]), {
    command: "refine",
    configPath: undefined,
    task: "",
    resumeRunId: "run-1",
  });
});
