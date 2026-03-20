import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { HitlController } from "../../src/contracts/hitl-controller.js";
import type { AgentLoopProgressSnapshot } from "../../src/core/agent-loop.js";
import type { AgentRunResult } from "../../src/domain/agent-types.js";
import { RunExecutor } from "../../src/runtime/run-executor.js";

class StubRuntimeLogger {
  private readonly lines: string[] = [];

  info(event: string, payload?: Record<string, unknown>): void {
    this.lines.push(`INFO ${event} ${JSON.stringify(payload ?? {})}`);
  }

  warn(event: string, payload?: Record<string, unknown>): void {
    this.lines.push(`WARN ${event} ${JSON.stringify(payload ?? {})}`);
  }

  error(event: string, payload?: Record<string, unknown>): void {
    this.lines.push(`ERROR ${event} ${JSON.stringify(payload ?? {})}`);
  }

  toText(): string {
    return this.lines.join("\n");
  }
}

class FakeLoop {
  readonly tasks: string[] = [];
  private readonly results: AgentRunResult[];
  private readonly observationStates: string[];
  private readonly finalScreenshotPath?: string;
  private lastSnapshot: AgentLoopProgressSnapshot = {
    steps: [],
    mcpCalls: [],
    assistantTurns: [],
    highLevelLogs: [],
  };

  constructor(options: {
    results: AgentRunResult[];
    observationStates?: string[];
    finalScreenshotPath?: string;
  }) {
    this.results = [...options.results];
    this.observationStates = options.observationStates ? [...options.observationStates] : ["before", "after"];
    this.finalScreenshotPath = options.finalScreenshotPath;
  }

  async run(task: string): Promise<AgentRunResult> {
    this.tasks.push(task);
    const result = this.results.shift();
    if (!result) {
      throw new Error("no scripted loop result remaining");
    }
    this.lastSnapshot = {
      steps: result.steps,
      mcpCalls: result.mcpCalls,
      assistantTurns: result.assistantTurns,
      highLevelLogs: [],
    };
    return result;
  }

  async captureFinalScreenshot(): Promise<string | undefined> {
    return this.finalScreenshotPath;
  }

  snapshotProgress(): AgentLoopProgressSnapshot {
    return this.lastSnapshot;
  }

  async captureObservationSummary(): Promise<string> {
    return this.observationStates.shift() ?? "steady";
  }

  abort(): void {}
}

class StubHitlController implements HitlController {
  async requestIntervention(): Promise<{ humanAction: string; resumeInstruction: string; nextTimeRule: string }> {
    return {
      humanAction: "human fixed it",
      resumeInstruction: "continue from corrected state",
      nextTimeRule: "reuse this fix next time",
    };
  }
}

function buildLoopResult(
  task: string,
  status: AgentRunResult["status"],
  overrides: Partial<AgentRunResult> = {}
): AgentRunResult {
  return {
    task,
    status,
    finishReason: status === "completed" ? "done" : "needs help",
    steps: [],
    mcpCalls: [],
    assistantTurns: [],
    ...overrides,
  };
}

test("run executor writes fallback consumption metadata when no SOP consumption context is configured", async () => {
  const artifactsDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-run-executor-fallback-"));
  const loop = new FakeLoop({
    results: [buildLoopResult("continue from current browser state", "completed")],
    finalScreenshotPath: path.join(artifactsDir, "fake-final.png"),
  });

  const executor = new RunExecutor({
    loop: loop as never,
    logger: new StubRuntimeLogger(),
    artifactsDir,
    createRunId: () => "fallback_run",
  });

  const result = await executor.execute({
    task: "continue from current browser state",
    sopRunId: "run_42",
  });

  assert.equal(result.status, "completed");
  const record = JSON.parse(await readFile(path.join(result.artifactsDir ?? "", "sop_consumption.json"), "utf-8")) as {
    originalTask: string;
    selectionMode: string;
    pinnedRunId?: string;
    fallbackUsed: boolean;
    fallbackReason?: string;
  };
  assert.equal(record.originalTask, "continue from current browser state");
  assert.equal(record.selectionMode, "pinned");
  assert.equal(record.pinnedRunId, "run_42");
  assert.equal(record.fallbackUsed, true);
  assert.equal(record.fallbackReason, "consumption_not_configured");
});

test("run executor turns completed attempts into failed when final screenshot capture is missing", async () => {
  const artifactsDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-run-executor-final-shot-"));
  const loop = new FakeLoop({
    results: [buildLoopResult("draft note", "completed")],
  });

  const executor = new RunExecutor({
    loop: loop as never,
    logger: new StubRuntimeLogger(),
    artifactsDir,
    createRunId: () => "missing_screenshot_run",
  });

  const result = await executor.execute({
    task: "draft note",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.finishReason, "final screenshot not captured");
});

test("run executor writes intervention learning and resumes from current browser state after HITL", async () => {
  const artifactsDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-run-executor-hitl-"));
  const loop = new FakeLoop({
    results: [
      buildLoopResult("first attempt", "stalled", {
        finishReason: "page did not change",
      }),
      buildLoopResult("second attempt", "completed"),
    ],
    observationStates: ["before state", "after state"],
    finalScreenshotPath: path.join(artifactsDir, "final.png"),
  });

  const executor = new RunExecutor({
    loop: loop as never,
    logger: new StubRuntimeLogger(),
    artifactsDir,
    createRunId: () => "hitl_run",
    hitlController: new StubHitlController(),
    hitlRetryLimit: 0,
    hitlMaxInterventions: 1,
  });

  const result = await executor.execute({
    task: "recover draft flow",
  });

  assert.equal(result.status, "completed");
  assert.equal(loop.tasks.length, 2);
  assert.match(loop.tasks[1] ?? "", /Human intervention 1 completed/);
  assert.match(loop.tasks[1] ?? "", /Resume instruction: continue from corrected state/);

  const learningPath = path.join(result.artifactsDir ?? "", "intervention_learning.jsonl");
  const learningLog = await readFile(learningPath, "utf-8");
  assert.match(learningLog, /"runId":"hitl_run"/);
  assert.match(learningLog, /"resumeInstruction":"continue from corrected state"/);
});
