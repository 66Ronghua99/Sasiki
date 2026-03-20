/**
 * Deps: infrastructure/llm/model-resolver.ts, kernel/mcp-tool-bridge.ts, contracts/*
 * Used By: runtime/agent-execution-runtime.ts, runtime/runtime-composition-root.ts, runtime/replay-refinement/react-refinement-run-executor.ts
 * Last Updated: 2026-03-06
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
import type { HighLevelLogEntry, HighLevelLogStatus } from "../domain/high-level-log.js";
import type { ToolCallHookContext } from "../domain/refinement-session.js";
import { ModelResolver } from "../infrastructure/llm/model-resolver.js";
import { McpToolBridge, type McpToolCallHookObserver } from "./mcp-tool-bridge.js";

export interface AgentLoopConfig {
  model: string;
  apiKey: string;
  baseUrl?: string;
  thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  systemPrompt?: string;
}

export interface AgentLoopProgressSnapshot {
  steps: AgentStepRecord[];
  mcpCalls: McpCallRecord[];
  assistantTurns: AssistantTurnRecord[];
  highLevelLogs: HighLevelLogEntry[];
}

export interface AgentLoopSnapshotOptions {
  includeLastSnapshot?: boolean;
}

export interface AgentLoopRunOptions {
  stopAfterFirstToolExecutionEnd?: boolean;
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
  private latestProgress: AgentLoopProgressSnapshot = this.emptyProgressSnapshot();

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
    agent.setSystemPrompt(this.config.systemPrompt ?? SYSTEM_PROMPT);
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

  setToolHookObserver(observer: McpToolCallHookObserver | null): void {
    this.toolAdapter.setHookObserver(observer);
  }

  setToolHookContext(context: Partial<ToolCallHookContext>): void {
    this.toolAdapter.setHookContext(context);
  }

  async run(task: string, options?: AgentLoopRunOptions): Promise<AgentRunResult> {
    const agent = this.requireAgent();
    const steps: AgentStepRecord[] = [];
    const mcpCalls: McpCallRecord[] = [];
    const assistantTurns: AssistantTurnRecord[] = [];
    const highLevelLogs: HighLevelLogEntry[] = [];
    this.activeProgress = { steps, mcpCalls, assistantTurns, highLevelLogs };
    this.latestProgress = this.activeProgress;
    const runningCalls = new Map<string, { name: string; args: Record<string, unknown> }>();
    const toolCallTurnIndexes = new Map<string, number>();
    const singleStepStop = {
      enabled: options?.stopAfterFirstToolExecutionEnd === true,
      requested: false,
      matchedToolCallId: undefined as string | undefined,
      matchedToolName: undefined as string | undefined,
      matchedStepIndex: undefined as number | undefined,
    };

    if (singleStepStop.enabled) {
      this.logger.info("agent_single_step_mode_enabled", {
        stopAfterFirstToolExecutionEnd: true,
      });
    }

    let status: AgentRunStatus = "completed";
    let finishReason = "agent loop completed";
    try {
      const unsubscribe = agent.subscribe((event) => {
        this.collectStepEvent(event, steps, mcpCalls, runningCalls, highLevelLogs, toolCallTurnIndexes);
        this.collectAssistantTurnEvent(event, assistantTurns, highLevelLogs, toolCallTurnIndexes);
        if (singleStepStop.enabled && event.type === "tool_execution_end" && !singleStepStop.requested) {
          singleStepStop.requested = true;
          singleStepStop.matchedToolCallId = event.toolCallId;
          singleStepStop.matchedToolName = event.toolName;
          singleStepStop.matchedStepIndex = steps.length;
          this.logger.info("agent_single_step_stop_requested", {
            stopAfterFirstToolExecutionEnd: true,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            stepIndex: steps.length,
            mcpEndCount: mcpCalls.filter((call) => call.phase === "end").length,
          });
          agent.abort();
        }
        const failure = this.detectFailure(event, singleStepStop.requested);
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
        if (singleStepStop.requested) {
          finishReason = "planned_single_step_stop_after_tool_execution_end";
          this.logger.info("agent_single_step_stop_completed", {
            stopAfterFirstToolExecutionEnd: true,
            finishReason,
            toolCallId: singleStepStop.matchedToolCallId,
            toolName: singleStepStop.matchedToolName,
            stepIndex: singleStepStop.matchedStepIndex,
            stepCount: steps.length,
            mcpCallCount: mcpCalls.length,
          });
        } else {
          const stateError = agent.state.error;
          if (stateError) {
            status = "failed";
            finishReason = stateError;
          }
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
      this.latestProgress = this.cloneProgressSnapshot({ steps, mcpCalls, assistantTurns, highLevelLogs });
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

  async captureObservationSummary(): Promise<string> {
    const tools = await this.tools.listTools();
    const names = new Set(tools.map((tool) => tool.name));
    const candidates: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: "browser_snapshot", args: {} },
      { name: "browser_tabs", args: { action: "list" } },
    ];

    for (const candidate of candidates) {
      if (!names.has(candidate.name)) {
        continue;
      }
      try {
        const result = await this.tools.callTool(candidate.name, candidate.args);
        const summary = this.extractToolResultSummary(result);
        if (summary) {
          return summary;
        }
      } catch (error) {
        this.logger.warn("observation_capture_failed", {
          tool: candidate.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return "";
  }

  abort(reason = "manual_interrupt"): void {
    if (!this.agent) {
      return;
    }
    this.logger.warn("agent_abort_requested", { reason });
    this.agent.abort();
  }

  snapshotProgress(options?: AgentLoopSnapshotOptions): AgentLoopProgressSnapshot {
    if (!this.activeProgress) {
      if (options?.includeLastSnapshot) {
        return this.cloneProgressSnapshot(this.latestProgress);
      }
      return this.emptyProgressSnapshot();
    }
    return this.cloneProgressSnapshot(this.activeProgress);
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
    runningCalls: Map<string, { name: string; args: Record<string, unknown> }>,
    highLevelLogs: HighLevelLogEntry[],
    toolCallTurnIndexes: Map<string, number>
  ): void {
    if (event.type === "tool_execution_start") {
      const args = this.toRecord(event.args);
      runningCalls.set(event.toolCallId, {
        name: event.toolName,
        args,
      });
      mcpCalls.push({
        index: mcpCalls.length + 1,
        timestamp: new Date().toISOString(),
        phase: "start",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args,
      });
      highLevelLogs.push(
        this.createHighLevelLog({
          stage: "action",
          status: "info",
          source: "tool",
          summary: `Execute ${this.mapToolNameToAction(event.toolName)} via ${event.toolName}`,
          turnIndex: toolCallTurnIndexes.get(event.toolCallId),
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          actionName: this.mapToolNameToAction(event.toolName),
          data: { args },
        })
      );
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
    const stepIndex = steps.length + 1;

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
      stepIndex,
      action: mappedAction,
      reason: "agent tool execution",
      toolName: running?.name ?? event.toolName,
      toolArguments: args,
      resultExcerpt: excerpt,
      progressed: !isToolError,
      error: isToolError ? excerpt : undefined,
    });
    highLevelLogs.push(
      this.createHighLevelLog({
        stage: "result",
        status: isToolError ? "error" : "info",
        source: "tool",
        summary: isToolError
          ? `${mappedAction} failed via ${running?.name ?? event.toolName}`
          : `${mappedAction} completed via ${running?.name ?? event.toolName}`,
        detail: this.summarizeText(excerpt, 400),
        turnIndex: toolCallTurnIndexes.get(event.toolCallId),
        stepIndex,
        toolName: running?.name ?? event.toolName,
        toolCallId: event.toolCallId,
        actionName: mappedAction,
        progressed: !isToolError,
        data: {
          args,
          isError: isToolError,
        },
      })
    );
    runningCalls.delete(event.toolCallId);
  }

  private collectAssistantTurnEvent(
    event: AgentEvent,
    assistantTurns: AssistantTurnRecord[],
    highLevelLogs: HighLevelLogEntry[],
    toolCallTurnIndexes: Map<string, number>
  ): void {
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

    const turnRecord: AssistantTurnRecord = {
      index: assistantTurns.length + 1,
      timestamp: new Date().toISOString(),
      stopReason: typeof event.message.stopReason === "string" ? event.message.stopReason : undefined,
      text: textBlocks.join("\n\n"),
      thinking: thinkingBlocks.join("\n\n"),
      toolCalls,
      errorMessage: typeof event.message.errorMessage === "string" ? event.message.errorMessage : undefined,
    };
    assistantTurns.push(turnRecord);
    for (const toolCall of toolCalls) {
      if (toolCall.id) {
        toolCallTurnIndexes.set(toolCall.id, turnRecord.index);
      }
    }
    this.collectAssistantHighLevelLogs(turnRecord, highLevelLogs);
  }

  private isToolExecutionError(eventIsError: boolean | undefined, excerpt: string): boolean {
    if (eventIsError) {
      return true;
    }
    return /"isError":\s*true/.test(excerpt) || /### Error/.test(excerpt);
  }

  private detectFailure(event: AgentEvent, allowAbortedStop: boolean): string | null {
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
      if (stopReason === "aborted" && allowAbortedStop) {
        this.logger.info("assistant_message_aborted_planned_single_step", {
          stopReason,
          errorMessage: event.message.errorMessage,
        });
        return null;
      }
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

  private extractToolResultSummary(result: Record<string, unknown>): string {
    const content = Array.isArray(result.content) ? result.content : [];
    const textParts: string[] = [];
    for (const item of content) {
      if (!this.isRecord(item)) {
        continue;
      }
      if (item.type === "text" && typeof item.text === "string" && item.text.trim()) {
        textParts.push(item.text);
      }
    }
    const preferred = textParts.join("\n\n").trim();
    if (preferred) {
      return this.summarizeText(preferred, 1200);
    }
    return this.summarizeText(this.extractText(result), 1200);
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

  private collectAssistantHighLevelLogs(
    turn: AssistantTurnRecord,
    highLevelLogs: HighLevelLogEntry[]
  ): void {
    const readSource = turn.thinking.trim() || turn.text.trim();
    if (readSource) {
      highLevelLogs.push(
        this.createHighLevelLog({
          stage: "read",
          status: "info",
          source: "assistant",
          summary: this.toSentence("Observed/considered", readSource, 220),
          detail: this.summarizeText(readSource, 500),
          turnIndex: turn.index,
          data: {
            stopReason: turn.stopReason,
            hasThinking: Boolean(turn.thinking.trim()),
            hasText: Boolean(turn.text.trim()),
          },
        })
      );
    }

    const plannedTools = this.uniqueToolNames(turn.toolCalls);
    const judgeStatus = this.resolveAssistantJudgeStatus(turn);
    const judgeSummary = plannedTools.length > 0
      ? `Planned next action: ${plannedTools.map((name) => this.mapToolNameToAction(name)).join(", ")}`
      : turn.errorMessage
        ? `Assistant turn failed: ${this.summarizeText(turn.errorMessage, 180)}`
        : turn.text.trim()
          ? this.toSentence("Assistant conclusion", turn.text, 220)
          : `Assistant turn finished with stop reason ${turn.stopReason ?? "unknown"}`;
    highLevelLogs.push(
      this.createHighLevelLog({
        stage: "judge",
        status: judgeStatus,
        source: "assistant",
        summary: judgeSummary,
        detail: this.buildJudgeDetail(turn, plannedTools),
        turnIndex: turn.index,
        data: {
          stopReason: turn.stopReason,
          toolCallCount: turn.toolCalls.length,
          toolNames: plannedTools,
          errorMessage: turn.errorMessage,
        },
      })
    );
  }

  private resolveAssistantJudgeStatus(turn: AssistantTurnRecord): HighLevelLogStatus {
    if (turn.errorMessage || turn.stopReason === "error" || turn.stopReason === "aborted") {
      return "error";
    }
    if (turn.toolCalls.length === 0 && !turn.text.trim()) {
      return "warning";
    }
    return "info";
  }

  private buildJudgeDetail(turn: AssistantTurnRecord, plannedTools: string[]): string | undefined {
    if (plannedTools.length > 0) {
      return `toolCalls=${plannedTools.join(", ")}`;
    }
    if (turn.text.trim()) {
      return this.summarizeText(turn.text, 400);
    }
    if (turn.errorMessage) {
      return this.summarizeText(turn.errorMessage, 400);
    }
    return undefined;
  }

  private uniqueToolNames(toolCalls: AssistantToolCallRecord[]): string[] {
    return [...new Set(toolCalls.map((toolCall) => toolCall.name).filter(Boolean))];
  }

  private createHighLevelLog(
    input: Omit<HighLevelLogEntry, "index" | "timestamp">
  ): HighLevelLogEntry {
    return {
      index: 0,
      timestamp: new Date().toISOString(),
      ...input,
    };
  }

  private summarizeText(value: string, maxLength: number): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  private toSentence(prefix: string, value: string, maxLength: number): string {
    const summary = this.summarizeText(value, maxLength);
    if (!summary) {
      return prefix;
    }
    return `${prefix}: ${summary}`;
  }

  private emptyProgressSnapshot(): AgentLoopProgressSnapshot {
    return {
      steps: [],
      mcpCalls: [],
      assistantTurns: [],
      highLevelLogs: [],
    };
  }

  private cloneProgressSnapshot(snapshot: AgentLoopProgressSnapshot): AgentLoopProgressSnapshot {
    return {
      steps: [...snapshot.steps],
      mcpCalls: [...snapshot.mcpCalls],
      assistantTurns: [...snapshot.assistantTurns],
      highLevelLogs: [...snapshot.highLevelLogs],
    };
  }

}
