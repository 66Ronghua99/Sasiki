/**
 * Deps: core/model-resolver.ts, core/mcp-tool-bridge.ts, contracts/*
 * Used By: runtime/agent-runtime.ts
 * Last Updated: 2026-03-04
 */
import { Agent, type AgentEvent } from "@mariozechner/pi-agent-core";
import { stat } from "node:fs/promises";
import { inspect } from "node:util";

import type { Logger } from "../contracts/logger.js";
import type { ToolClient } from "../contracts/tool-client.js";
import type {
  AgentRunResult,
  AgentRunStatus,
  AgentStepRecord,
  AssistantToolCallRecord,
  AssistantTurnRecord,
  McpCallRecord,
} from "../domain/agent-types.js";
import { ModelResolver } from "./model-resolver.js";
import { McpToolBridge } from "./mcp-tool-bridge.js";

export interface AgentLoopConfig {
  model: string;
  apiKey: string;
  baseUrl?: string;
  thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
}

export interface AgentLoopProgressSnapshot {
  steps: AgentStepRecord[];
  mcpCalls: McpCallRecord[];
  assistantTurns: AssistantTurnRecord[];
}

const SYSTEM_PROMPT = [
  "You are Sasiki Browser Operator, an adaptive web workflow executor.",
  "Your job is to complete user goals end-to-end using available browser tools, while staying robust to UI changes.",
  "Core abilities: observe page state, choose next best action, recover from failures, and verify outcomes with evidence.",
  "Operating loop:",
  "1) Observe first: use snapshot, URL, title, and visible structure to build a current page model.",
  "2) Act with intent: choose one action that most directly advances the goal.",
  "3) Verify after each action: confirm navigation/state change before moving on.",
  "4) Recover adaptively: if a tool call fails, diagnose why and try an alternative approach.",
  "Prefer stable, user-visible cues and semantic refs before broad DOM heuristics.",
  "Use browser_run_code only when normal tools are insufficient, and keep code minimal and focused.",
  "Do not declare completion until all requested outcomes are actually executed and observable.",
].join("\n");

export class AgentLoop {
  private readonly config: AgentLoopConfig;
  private readonly tools: ToolClient;
  private readonly logger: Logger;
  private readonly toolAdapter: McpToolBridge;
  private agent: Agent | null = null;
  private activeProgress: AgentLoopProgressSnapshot | null = null;

  constructor(config: AgentLoopConfig, tools: ToolClient, logger: Logger) {
    this.config = config;
    this.tools = tools;
    this.logger = logger;
    this.toolAdapter = new McpToolBridge(tools);
  }

  async initialize(): Promise<void> {
    await this.tools.connect();

    this.logPotentialModelEndpointMismatch();
    this.logger.info("model_resolution_start", {
      configuredModel: this.config.model,
      configuredBaseUrl: this.config.baseUrl,
      apiKeyPresent: Boolean(this.config.apiKey),
    });
    const model = ModelResolver.resolve({ model: this.config.model, baseUrl: this.config.baseUrl });
    const agentTools = await this.toolAdapter.buildAgentTools();
    const agent = new Agent({
      initialState: {
        model,
      },
      getApiKey: () => (this.config.apiKey ? this.config.apiKey : undefined),
    });
    agent.setSystemPrompt(SYSTEM_PROMPT);
    agent.setThinkingLevel(this.config.thinkingLevel);
    agent.setTools(agentTools);

    this.agent = agent;
    this.logger.info("agent_loop_initialized", {
      model: model.id,
      provider: model.provider,
      api: model.api,
      baseUrl: model.baseUrl,
      compat: this.extractCompatForLog(model),
      thinkingLevel: this.config.thinkingLevel,
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
    const mcpCalls: McpCallRecord[] = [];
    const assistantTurns: AssistantTurnRecord[] = [];
    this.activeProgress = { steps, mcpCalls, assistantTurns };
    const runningCalls = new Map<string, { name: string; args: Record<string, unknown> }>();

    let status: AgentRunStatus = "completed";
    let finishReason = "agent loop completed";
    try {
      const unsubscribe = agent.subscribe((event) => {
        this.collectStepEvent(event, steps, mcpCalls, runningCalls);
        this.collectAssistantTurnEvent(event, assistantTurns);
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

      if (status === "failed" && mcpCalls.length === 0) {
        this.logger.warn("llm_failed_before_mcp", {
          finishReason,
          configuredModel: this.config.model,
          configuredBaseUrl: this.config.baseUrl,
        });
      }

      return {
        task,
        status,
        finishReason,
        steps,
        mcpCalls,
        assistantTurns,
      };
    } finally {
      this.activeProgress = null;
    }
  }

  async captureFinalScreenshot(filePath: string): Promise<string | undefined> {
    const tools = await this.tools.listTools();
    const names = new Set(tools.map((tool) => tool.name));
    const candidates: Array<{ name: string; args: Record<string, unknown>[] }> = [
      {
        name: "browser_take_screenshot",
        args: [{ path: filePath, fullPage: true }, { filename: filePath, fullPage: true }, { filePath, fullPage: true }],
      },
      {
        name: "browser_screenshot",
        args: [{ path: filePath, fullPage: true }, { filename: filePath, fullPage: true }, { filePath, fullPage: true }],
      },
    ];

    for (const candidate of candidates) {
      if (!names.has(candidate.name)) {
        continue;
      }
      for (const args of candidate.args) {
        try {
          await this.tools.callTool(candidate.name, args);
          if (await this.fileExists(filePath)) {
            return filePath;
          }
        } catch (error) {
          this.logger.warn("final_screenshot_attempt_failed", {
            tool: candidate.name,
            args,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    return undefined;
  }

  abort(reason = "manual_interrupt"): void {
    if (!this.agent) {
      return;
    }
    this.logger.warn("agent_abort_requested", { reason });
    this.agent.abort();
  }

  snapshotProgress(): AgentLoopProgressSnapshot {
    if (!this.activeProgress) {
      return { steps: [], mcpCalls: [], assistantTurns: [] };
    }
    return {
      steps: [...this.activeProgress.steps],
      mcpCalls: [...this.activeProgress.mcpCalls],
      assistantTurns: [...this.activeProgress.assistantTurns],
    };
  }

  private logPotentialModelEndpointMismatch(): void {
    const baseUrl = this.config.baseUrl?.trim().toLowerCase();
    const model = this.config.model.trim().toLowerCase();
    if (!baseUrl || !model) {
      return;
    }
    if (baseUrl.includes("dashscope.aliyuncs.com") && model.includes("minimax")) {
      this.logger.warn("model_baseurl_mismatch_possible", {
        configuredModel: this.config.model,
        configuredBaseUrl: this.config.baseUrl,
        hint: "dashscope usually expects qwen models for OpenAI-compatible endpoints",
      });
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const info = await stat(filePath);
      return info.isFile() && info.size > 0;
    } catch {
      return false;
    }
  }

  private requireAgent(): Agent {
    if (!this.agent) {
      throw new Error("agent loop is not initialized");
    }
    return this.agent;
  }

  private collectStepEvent(
    event: AgentEvent,
    steps: AgentStepRecord[],
    mcpCalls: McpCallRecord[],
    runningCalls: Map<string, { name: string; args: Record<string, unknown> }>
  ): void {
    if (event.type === "tool_execution_start") {
      runningCalls.set(event.toolCallId, {
        name: event.toolName,
        args: this.toRecord(event.args),
      });
      mcpCalls.push({
        index: mcpCalls.length + 1,
        timestamp: new Date().toISOString(),
        phase: "start",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
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
    const args = running?.args ?? {};
    const isToolError = this.isToolExecutionError(event.isError, excerpt);

    mcpCalls.push({
      index: mcpCalls.length + 1,
      timestamp: new Date().toISOString(),
      phase: "end",
      toolCallId: event.toolCallId,
      toolName: running?.name ?? event.toolName,
      args,
      isError: isToolError,
      resultExcerpt: excerpt,
    });

    steps.push({
      stepIndex: steps.length + 1,
      action: mappedAction,
      reason: "agent tool execution",
      toolName: running?.name ?? event.toolName,
      toolArguments: args,
      resultExcerpt: excerpt,
      progressed: !isToolError,
      error: isToolError ? excerpt : undefined,
    });
    runningCalls.delete(event.toolCallId);
  }

  private collectAssistantTurnEvent(event: AgentEvent, assistantTurns: AssistantTurnRecord[]): void {
    if (event.type !== "message_end") {
      return;
    }
    if (!this.isRecord(event.message) || event.message.role !== "assistant") {
      return;
    }

    const content = Array.isArray(event.message.content) ? event.message.content : [];
    const textBlocks: string[] = [];
    const thinkingBlocks: string[] = [];
    const toolCalls: AssistantToolCallRecord[] = [];

    for (const block of content) {
      if (!this.isRecord(block)) {
        continue;
      }
      if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
        textBlocks.push(block.text);
      }
      if (block.type === "thinking" && typeof block.thinking === "string" && block.thinking.trim()) {
        thinkingBlocks.push(block.thinking);
      }
      if (block.type === "toolCall" && typeof block.name === "string") {
        toolCalls.push({
          id: typeof block.id === "string" ? block.id : undefined,
          name: block.name,
          arguments: this.toRecord(block.arguments),
        });
      }
    }

    assistantTurns.push({
      index: assistantTurns.length + 1,
      timestamp: new Date().toISOString(),
      stopReason: typeof event.message.stopReason === "string" ? event.message.stopReason : undefined,
      text: textBlocks.join("\n\n"),
      thinking: thinkingBlocks.join("\n\n"),
      toolCalls,
      errorMessage: typeof event.message.errorMessage === "string" ? event.message.errorMessage : undefined,
    });
  }

  private isToolExecutionError(eventIsError: boolean | undefined, excerpt: string): boolean {
    if (eventIsError) {
      return true;
    }
    return /"isError":\s*true/.test(excerpt) || /### Error/.test(excerpt);
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
      this.logger.error("assistant_message_failed", {
        stopReason,
        errorMessage: error,
      });
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
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return inspect(value, {
        depth: null,
        maxArrayLength: null,
        maxStringLength: null,
        compact: false,
      });
    }
  }

  private extractCompatForLog(model: any): Record<string, unknown> | undefined {
    const compat = model?.compat;
    if (!compat || typeof compat !== "object" || Array.isArray(compat)) {
      return undefined;
    }
    const keys = [
      "supportsDeveloperRole",
      "supportsStore",
      "supportsReasoningEffort",
      "maxTokensField",
      "thinkingFormat",
      "supportsStrictMode",
    ];
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in compat) {
        result[key] = compat[key];
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

}
