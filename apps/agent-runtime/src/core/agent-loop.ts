import { createHash } from "node:crypto";

import type { Logger } from "../contracts/logger.js";
import type { Planner } from "../contracts/planner.js";
import type { ToolClient } from "../contracts/tool-client.js";
import type { AgentRunResult, AgentStepRecord, PlannedAction } from "../domain/agent-types.js";
import { LoopPolicy } from "./loop-policy.js";
import { ToolSchemaRegistry } from "./tool-schema-registry.js";

export class AgentLoop {
  private readonly planner: Planner;
  private readonly tools: ToolClient;
  private readonly policy: LoopPolicy;
  private readonly logger: Logger;
  private readonly registry: ToolSchemaRegistry;

  constructor(planner: Planner, tools: ToolClient, policy: LoopPolicy, logger: Logger) {
    this.planner = planner;
    this.tools = tools;
    this.policy = policy;
    this.logger = logger;
    this.registry = new ToolSchemaRegistry();
  }

  async initialize(): Promise<void> {
    await this.tools.connect();
    await this.registry.refresh(this.tools);
    this.logger.info("agent_loop_initialized", {
      toolSchemaCount: this.registry.toOpenAiToolSchemas().length,
    });
  }

  async shutdown(): Promise<void> {
    await this.tools.disconnect();
  }

  async run(task: string): Promise<AgentRunResult> {
    const steps: AgentStepRecord[] = [];
    let failures = 0;
    let stalls = 0;

    let snapshot = await this.captureSnapshot();
    let digest = this.digest(snapshot);

    for (let i = 1; i <= this.policy.maxSteps; i += 1) {
      try {
        const action = await this.planner.planNextAction(
          { task, snapshot, stepIndex: i, maxSteps: this.policy.maxSteps, history: this.historyText(steps) },
          this.registry.toOpenAiToolSchemas()
        );

        if (action.action === "done") {
          steps.push(this.doneStep(i, action));
          return { task, status: "completed", finishReason: action.reason ?? "done", steps };
        }

        const executed = await this.executeAction(i, action);
        const nextSnapshot = await this.captureSnapshot();
        const nextDigest = this.digest(nextSnapshot);
        const progressed = nextDigest !== digest;

        steps.push({ ...executed, progressed, resultExcerpt: this.extractText(executed.resultExcerpt) });
        snapshot = nextSnapshot;
        digest = nextDigest;

        failures = 0;
        stalls = progressed ? 0 : stalls + 1;

        if (this.policy.shouldStopForStalls(stalls)) {
          return { task, status: "stalled", finishReason: "no progress", steps };
        }
      } catch (error) {
        failures += 1;
        stalls += 1;
        steps.push(this.errorStep(i, error));

        if (this.policy.shouldStopForFailures(failures)) {
          return { task, status: "failed", finishReason: "consecutive failures", steps };
        }
      }
    }

    return { task, status: "max_steps", finishReason: "step limit reached", steps };
  }

  private async executeAction(stepIndex: number, action: PlannedAction): Promise<AgentStepRecord> {
    const [toolName, toolArgs] = this.mapAction(action);
    if (!this.registry.hasTool(toolName)) {
      throw new Error(`tool not found in MCP list: ${toolName}`);
    }

    const result = await this.tools.callTool(toolName, toolArgs);
    return {
      stepIndex,
      action: action.action,
      reason: action.reason ?? "",
      toolName,
      toolArguments: toolArgs,
      resultExcerpt: JSON.stringify(result),
      progressed: false,
    };
  }

  private mapAction(action: PlannedAction): [string, Record<string, unknown>] {
    if (action.action === "navigate") {
      return ["browser_navigate", { url: action.url ?? "" }];
    }
    if (action.action === "click") {
      return ["browser_click", { ref: action.ref ?? "" }];
    }
    if (action.action === "type") {
      return ["browser_type", { ref: action.ref ?? "", text: action.text ?? "", submit: Boolean(action.submit) }];
    }
    if (action.action === "press_key") {
      return ["browser_press_key", { key: action.key ?? "Enter" }];
    }
    if (action.action === "wait_for") {
      return ["browser_wait_for", { time: action.seconds ?? 1 }];
    }
    throw new Error(`unsupported action: ${action.action}`);
  }

  private async captureSnapshot(): Promise<string> {
    const result = await this.tools.callTool("browser_snapshot", {});
    return this.extractText(JSON.stringify(result));
  }

  private extractText(raw: string): string {
    return raw.length <= 600 ? raw : `${raw.slice(0, 600)}...<truncated>`;
  }

  private digest(text: string): string {
    return createHash("sha1").update(text).digest("hex");
  }

  private historyText(steps: AgentStepRecord[]): string {
    if (steps.length === 0) {
      return "No previous steps";
    }
    return steps
      .slice(-5)
      .map((s) => `${s.stepIndex}. ${s.action} progressed=${s.progressed} ${s.error ?? ""}`.trim())
      .join("\n");
  }

  private doneStep(stepIndex: number, action: PlannedAction): AgentStepRecord {
    return {
      stepIndex,
      action: "done",
      reason: action.reason ?? "",
      toolArguments: {},
      resultExcerpt: "",
      progressed: true,
    };
  }

  private errorStep(stepIndex: number, error: unknown): AgentStepRecord {
    return {
      stepIndex,
      action: "error",
      reason: "",
      toolArguments: {},
      resultExcerpt: "",
      progressed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
