import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCliArguments,
  parseObserveArguments,
  parseRefineArguments,
  parseSopCompactArguments,
} from "../../src/application/shell/command-router.js";

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
      "--skill=tiktok-customer-service",
      "--resume-run-id=resume-456",
      "hello",
      "world",
    ]),
    {
      command: "refine",
      configPath: "agent.config.json",
      skillName: "tiktok-customer-service",
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
      action: "run",
      configPath: "agent.config.json",
      runId: "run-123",
      semanticMode: "on",
    }
  );
});

test("parseSopCompactArguments supports list grammar", () => {
  assert.deepEqual(parseSopCompactArguments(["list"]), {
    command: "sop-compact",
    action: "list",
    configPath: undefined,
  });
});

test("parseCliArguments rejects archived sop compact commands", () => {
  assert.throws(
    () => parseCliArguments(["sop-compact-hitl"]),
    /sop-compact-hitl is archived and no longer supported\./
  );
});

test("parseCliArguments rejects archived sop compact clarify commands", () => {
  assert.throws(
    () => parseCliArguments(["sop-compact-clarify"]),
    /sop-compact-clarify is archived and no longer supported\./
  );
});

test("parseCliArguments delegates sop compact parsing", () => {
  assert.deepEqual(parseCliArguments(["sop-compact", "--run-id", "run-777"]), {
    command: "sop-compact",
    action: "run",
    configPath: undefined,
    runId: "run-777",
    semanticMode: undefined,
  });
});

test("parseCliArguments delegates sop compact list parsing", () => {
  assert.deepEqual(parseCliArguments(["sop-compact", "list"]), {
    command: "sop-compact",
    action: "list",
    configPath: undefined,
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
    parseCliArguments([
      "refine",
      "--config=agent.config.json",
      "--skill=tiktok-customer-service",
      "--resume-run-id=resume-456",
      "hello",
      "world",
    ]),
    {
      command: "refine",
      configPath: "agent.config.json",
      skillName: "tiktok-customer-service",
      task: "hello world",
      resumeRunId: "resume-456",
    }
  );
});

test("parseCliArguments rejects legacy runtime command grammar explicitly", () => {
  assert.throws(
    () => parseCliArguments(["runtime", "--mode", "observe", "hello"]),
    /legacy runtime command grammar is no longer supported\. use an explicit command: observe, refine, or sop-compact\./
  );
});

test("parseCliArguments rejects legacy mode flags explicitly", () => {
  assert.throws(
    () => parseCliArguments(["--mode", "run", "hello"]),
    /legacy --mode grammar is no longer supported\. use an explicit command: observe, refine, or sop-compact\./
  );
});

test("parseCliArguments rejects bare task invocation as an unknown command", () => {
  assert.throws(
    () => parseCliArguments(["hello", "world"]),
    /unknown command: hello\. use an explicit command: observe, refine, or sop-compact\./
  );
});

test("parseCliArguments rejects empty argv explicitly", () => {
  assert.throws(
    () => parseCliArguments([]),
    /missing command\. use an explicit command: observe, refine, or sop-compact\./
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
    skillName: undefined,
    task: "",
    resumeRunId: "run-1",
  });
});

test("parseRefineArguments preserves empty task when a skill name is provided", () => {
  assert.deepEqual(parseRefineArguments(["--skill", "tiktok-customer-service"]), {
    command: "refine",
    configPath: undefined,
    skillName: "tiktok-customer-service",
    task: "",
    resumeRunId: undefined,
  });
});
