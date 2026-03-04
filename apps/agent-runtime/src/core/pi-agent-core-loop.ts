/**
 * Deps: core/model-resolver.ts, core/mcp-tool-adapter.ts, contracts/*
 * Used By: runtime/migration-runtime.ts
 * Last Updated: 2026-03-04
 */
import { Agent, type AgentEvent } from "@mariozechner/pi-agent-core";

import type { Logger } from "../contracts/logger.js";
import type { ToolClient } from "../contracts/tool-client.js";
import type { AgentRunResult, AgentRunStatus, AgentStepRecord } from "../domain/agent-types.js";
import { ModelResolver } from "./model-resolver.js";
import { McpToolAdapter } from "./mcp-tool-adapter.js";

export interface PiAgentCoreLoopConfig {
  model: string;
  apiKey: string;
  baseUrl?: string;
}

const SYSTEM_PROMPT = [
  "You are a browser automation agent for Xiaohongshu.",
  "You must use available MCP tools to execute actions instead of describing actions.",
  "Goal: open website, search target topic, open post, like post, and capture screenshot when requested.",
  "Only mark task done after required actions are actually executed.",
].join("\n");

export class PiAgentCoreLoop {
  private readonly config: PiAgentCoreLoopConfig;
  private readonly tools: ToolClient;
  private readonly logger: Logger;
  private readonly toolAdapter: McpToolAdapter;
  private agent: Agent | null = null;

  constructor(config: PiAgentCoreLoopConfig, tools: ToolClient, logger: Logger) {
    this.config = config;
    this.tools = tools;
    this.logger = logger;
    this.toolAdapter = new McpToolAdapter(tools);
  }

  async initialize(): Promise<void> {
    await this.tools.connect();

    const model = ModelResolver.resolve({ model: this.config.model, baseUrl: this.config.baseUrl });
    const agentTools = await this.toolAdapter.buildAgentTools();
    const agent = new Agent({
      initialState: {
        model,
      },
      getApiKey: () => (this.config.apiKey ? this.config.apiKey : undefined),
    });
    agent.setSystemPrompt(SYSTEM_PROMPT);
    agent.setTools(agentTools);

    this.agent = agent;
    this.logger.info("pi_agent_core_initialized", {
      model: model.id,
      provider: model.provider,
      toolCount: agentTools.length,
    });
  }

  async shutdown(): Promise<void> {
    await this.tools.disconnect();
    this.agent = null;
  }

  async run(task: string): Promise<AgentRunResult> {
    const agent = this.requireAgent();
    const steps: AgentStepRecord[] = [];
    const runningCalls = new Map<string, { name: string; args: Record<string, unknown> }>();

    let status: AgentRunStatus = "completed";
    let finishReason = "agent loop completed";
    const unsubscribe = agent.subscribe((event) => {
      this.collectStepEvent(event, steps, runningCalls);
      const failure = this.detectFailure(event);
      if (!failure) {
        return;
      }
      status = "failed";
      finishReason = failure;
    });

    try {
      await agent.prompt(task);
      await agent.waitForIdle();
    } finally {
      unsubscribe();
    }

    if (status === "completed") {
      const stateError = agent.state.error;
      if (stateError) {
        status = "failed";
        finishReason = stateError;
      }
    }

    return { task, status, finishReason, steps };
  }

  private requireAgent(): Agent {
    if (!this.agent) {
      throw new Error("pi-agent-core loop is not initialized");
    }
    return this.agent;
  }

  private collectStepEvent(
    event: AgentEvent,
    steps: AgentStepRecord[],
    runningCalls: Map<string, { name: string; args: Record<string, unknown> }>
  ): void {
    if (event.type === "tool_execution_start") {
      runningCalls.set(event.toolCallId, {
        name: event.toolName,
        args: this.toRecord(event.args),
      });
      return;
    }
    if (event.type !== "tool_execution_end") {
      return;
    }

    const running = runningCalls.get(event.toolCallId);
    const mappedAction = this.mapToolNameToAction(running?.name ?? event.toolName);
    const excerpt = this.extractText(event.result);
    steps.push({
      stepIndex: steps.length + 1,
      action: mappedAction,
      reason: "pi-agent-core tool execution",
      toolName: running?.name ?? event.toolName,
      toolArguments: running?.args ?? {},
      resultExcerpt: excerpt,
      progressed: !event.isError,
      error: event.isError ? excerpt : undefined,
    });
    runningCalls.delete(event.toolCallId);
  }

  private detectFailure(event: AgentEvent): string | null {
    if (event.type !== "message_end") {
      return null;
    }
    if (!this.isRecord(event.message)) {
      return null;
    }
    if (event.message.role !== "assistant") {
      return null;
    }
    const stopReason = event.message.stopReason;
    if (stopReason === "error" || stopReason === "aborted") {
      const error = event.message.errorMessage;
      return typeof error === "string" && error ? error : String(stopReason);
    }
    if (stopReason === "length") {
      return "assistant stopped because of token length limit";
    }
    return null;
  }

  private mapToolNameToAction(toolName: string): string {
    const mapped = {
      browser_navigate: "navigate",
      browser_click: "click",
      browser_type: "type",
      browser_press_key: "press_key",
      browser_wait_for: "wait_for",
    }[toolName];
    return mapped ?? toolName;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (this.isRecord(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private extractText(value: unknown): string {
    const raw = (() => {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })();
    return raw.length <= 600 ? raw : `${raw.slice(0, 600)}...<truncated>`;
  }
}
