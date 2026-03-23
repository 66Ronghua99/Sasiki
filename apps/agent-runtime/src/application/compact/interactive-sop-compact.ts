import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CompactHumanLoopTool } from "../../contracts/compact-human-loop-tool.js";
import type {
  RuntimeEvent,
  RuntimeRunTelemetry,
  RuntimeRunTelemetryScope,
  RuntimeTelemetryRegistry,
} from "../../contracts/runtime-telemetry.js";
import type {
  CompactCapabilityOutput,
  CompactConvergenceStatus,
  CompactHumanLoopEvent,
  CompactSessionState,
} from "../../domain/compact-reasoning.js";
import type { LlmThinkingLevel } from "../../domain/llm-thinking.js";
import type { SopTrace } from "../../domain/sop-trace.js";
import { validateSopTrace } from "../../domain/sop-trace.js";
import type { RuntimeSemanticMode } from "../config/runtime-config.js";
import { applyCompactSessionPatch, buildInitialCompactSessionState, type CompactTraceSummary } from "./compact-session-machine.js";
import { normalizeCompactTurnOutput } from "./compact-turn-normalizer.js";
import {
  FINALIZE_SYSTEM_PROMPT,
  REASONER_SYSTEM_PROMPT,
  SUMMARIZE_SYSTEM_PROMPT,
} from "./interactive-sop-compact-prompts.js";
import {
  buildCompactAgentTurnEvent,
  buildCompactAssistantEvent,
  buildCompactClarificationRequestEvent,
  buildCompactSessionStatusEvent,
  normalizeCompactCapabilityOutput,
} from "./compact-runtime-support.js";
import { SopRuleCompactBuilder } from "./sop-rule-compact-builder.js";

interface CompactSemanticOptions {
  mode: RuntimeSemanticMode;
  timeoutMs: number;
  model: string;
  apiKey: string;
  baseUrl?: string;
  thinkingLevel: LlmThinkingLevel;
}

export interface CompactModelClient {
  completeText(systemPrompt: string, userPrompt: string): Promise<{ rawText: string; stopReason: string }>;
  completeObject<T extends Record<string, unknown>>(
    systemPrompt: string,
    userPrompt: string
  ): Promise<{ payload: T; rawText: string; stopReason: string }>;
}

export interface CompactArtifactsWriter {
  readonly runId: string;
  readonly runDir: string;
  ensureDir(): Promise<void>;
  resetCompactSessionArtifacts(sessionId: string): Promise<void>;
  writeCompactSessionState(state: CompactSessionState, sessionId?: string): Promise<void>;
  appendCompactHumanLoop(event: CompactHumanLoopEvent, sessionId?: string): Promise<void>;
  writeCompactCapabilityOutput(output: CompactCapabilityOutput, sessionId?: string): Promise<void>;
  compactSessionDir(sessionId: string): string;
}

interface InteractiveSopCompactOptions {
  semantic: CompactSemanticOptions;
  hardLimit?: number;
  humanLoopTool: CompactHumanLoopTool;
  modelClient: CompactModelClient;
  createArtifactsWriter: (runId: string) => CompactArtifactsWriter;
  telemetryRegistry: RuntimeTelemetryRegistry;
}

export interface InteractiveSopCompactResult {
  runId: string;
  sessionId: string;
  sessionDir: string;
  runDir: string;
  sourceTracePath: string;
  sessionStatePath: string;
  humanLoopPath: string;
  capabilityOutputPath: string;
  status: CompactConvergenceStatus;
  roundsCompleted: number;
  remainingOpenDecisions: string[];
}

export class InteractiveSopCompactService {
  private readonly artifactsDir: string;
  private readonly semanticOptions: CompactSemanticOptions;
  private readonly hardLimit: number;
  private readonly humanLoopTool: CompactHumanLoopTool;
  private readonly modelClient: CompactModelClient;
  private readonly createArtifactsWriter: (runId: string) => CompactArtifactsWriter;
  private readonly telemetryRegistry: RuntimeTelemetryRegistry;
  private readonly ruleBuilder = new SopRuleCompactBuilder();

  constructor(artifactsDir: string, options: InteractiveSopCompactOptions) {
    this.artifactsDir = path.resolve(artifactsDir);
    this.semanticOptions = options.semantic;
    this.hardLimit = options.hardLimit ?? 6;
    this.humanLoopTool = options.humanLoopTool;
    this.modelClient = options.modelClient;
    this.createArtifactsWriter = options.createArtifactsWriter;
    this.telemetryRegistry = options.telemetryRegistry;
  }

  async compact(runId: string): Promise<InteractiveSopCompactResult> {
    if (this.semanticOptions.mode === "off") {
      throw new Error("interactive sop-compact requires semantic mode on or auto");
    }

    const runDir = path.join(this.artifactsDir, runId);
    const sessionId = this.buildSessionId(runId);
    const sourceTracePath = path.join(runDir, "demonstration_trace.json");
    const writer = this.createArtifactsWriter(runId);
    await writer.ensureDir();
    await writer.resetCompactSessionArtifacts(sessionId);
    const telemetry = this.createTelemetry({ workflow: "compact", runId, artifactsDir: runDir });

    try {
      await this.emitTelemetry(telemetry, {
        timestamp: new Date().toISOString(),
        workflow: "compact",
        runId,
        eventType: "workflow.lifecycle",
        payload: {
          phase: "started",
          artifactsDir: runDir,
        },
      });

      const trace = await this.readTrace(sourceTracePath);
      const summary = this.buildTraceSummary(runId, trace);
      let state = buildInitialCompactSessionState(runId, sessionId, summary);
      let latestHumanReply: string | undefined;

      await writer.writeCompactSessionState(state, sessionId);

      while (true) {
        if (state.roundIndex >= this.hardLimit) {
          state = {
            ...state,
            convergence: {
              status: "max_round_reached",
              reason: `hard limit ${this.hardLimit} reached`,
            },
          };
          await writer.writeCompactSessionState(state, sessionId);
          await writer.appendCompactHumanLoop(buildCompactSessionStatusEvent(state.roundIndex, state.convergence), sessionId);
          break;
        }

        const roundNumber = state.roundIndex + 1;
        const turn = await this.reasonRound(summary, state, latestHumanReply);
        await this.emitTelemetry(
          telemetry,
          buildCompactAgentTurnEvent({
            runId,
            roundIndex: roundNumber,
            assistantResponse: turn.assistantResponse,
            convergenceStatus: turn.patch.convergenceNext.status,
          })
        );
        await writer.appendCompactHumanLoop(buildCompactAssistantEvent(roundNumber, turn.assistantResponse), sessionId);

        state = applyCompactSessionPatch(state, turn.patch);
        await writer.writeCompactSessionState(state, sessionId);
        await writer.appendCompactHumanLoop(buildCompactSessionStatusEvent(state.roundIndex, state.convergence), sessionId);
        await this.emitTelemetry(telemetry, {
          timestamp: new Date().toISOString(),
          workflow: "compact",
          runId,
          eventType: "workflow.lifecycle",
          payload: {
            phase: "round_completed",
            sessionId,
            roundIndex: state.roundIndex,
            convergenceStatus: state.convergence.status,
            artifactsDir: runDir,
          },
        });

        if (state.convergence.status !== "continue") {
          latestHumanReply = undefined;
          break;
        }

        if (!turn.humanLoopRequest) {
          latestHumanReply = undefined;
          continue;
        }

        await writer.appendCompactHumanLoop(
          buildCompactClarificationRequestEvent(state.roundIndex, turn.humanLoopRequest),
          sessionId
        );
        const humanResponse = await this.humanLoopTool.requestClarification(turn.humanLoopRequest);
        await writer.appendCompactHumanLoop(
          {
            timestamp: new Date().toISOString(),
            roundIndex: state.roundIndex,
            role: "human",
            eventType: "human_reply",
            payload: {
              interaction_status: humanResponse.interaction_status,
              human_reply: humanResponse.human_reply,
            },
          },
          sessionId
        );

        if (humanResponse.interaction_status === "defer" || humanResponse.interaction_status === "stop") {
          state = {
            ...state,
            convergence: {
              status: "user_stopped",
              reason:
                humanResponse.interaction_status === "stop"
                  ? "user explicitly stopped compact session"
                  : "user deferred clarification",
            },
          };
          await writer.writeCompactSessionState(state, sessionId);
          await writer.appendCompactHumanLoop(buildCompactSessionStatusEvent(state.roundIndex, state.convergence), sessionId);
          break;
        }

        latestHumanReply = humanResponse.human_reply.trim();
        state = {
          ...state,
          humanFeedbackMemory: uniqueStrings([...state.humanFeedbackMemory, latestHumanReply]),
        };
        await writer.writeCompactSessionState(state, sessionId);
      }

      const capabilityOutput = await this.finalize(summary, state);
      await writer.writeCompactCapabilityOutput(capabilityOutput, sessionId);
      await this.emitTelemetry(telemetry, {
        timestamp: new Date().toISOString(),
        workflow: "compact",
        runId,
        eventType: "workflow.lifecycle",
        payload: {
          phase: "finished",
          sessionId,
          convergenceStatus: state.convergence.status,
          roundsCompleted: state.roundIndex,
          artifactsDir: runDir,
        },
      });

      return {
        runId,
        sessionId,
        sessionDir: writer.compactSessionDir(sessionId),
        runDir,
        sourceTracePath,
        sessionStatePath: path.join(writer.compactSessionDir(sessionId), "compact_session_state.json"),
        humanLoopPath: path.join(writer.compactSessionDir(sessionId), "compact_human_loop.jsonl"),
        capabilityOutputPath: path.join(writer.compactSessionDir(sessionId), "compact_capability_output.json"),
        status: state.convergence.status,
        roundsCompleted: state.roundIndex,
        remainingOpenDecisions: [...state.openDecisions],
      };
    } catch (error) {
      await this.emitTelemetry(telemetry, {
        timestamp: new Date().toISOString(),
        workflow: "compact",
        runId,
        eventType: "workflow.lifecycle",
        payload: {
          phase: "failed",
          error: error instanceof Error ? error.message : String(error),
          artifactsDir: runDir,
        },
      });
      throw error;
    } finally {
      await telemetry?.dispose();
    }
  }

  private async readTrace(tracePath: string): Promise<SopTrace> {
    const raw = await readFile(tracePath, "utf-8");
    const trace = JSON.parse(raw) as SopTrace;
    validateSopTrace(trace);
    return trace;
  }

  private buildTraceSummary(runId: string, trace: SopTrace): CompactTraceSummary {
    const built = this.ruleBuilder.build(trace);
    const actionSummary: Record<string, number> = {};
    const urlSamples: string[] = [];
    const seenUrls = new Set<string>();

    for (const step of trace.steps) {
      actionSummary[step.action] = (actionSummary[step.action] ?? 0) + 1;
      for (const candidate of [step.page.urlBefore, step.page.urlAfter]) {
        const normalized = candidate.trim();
        if (!normalized || seenUrls.has(normalized)) {
          continue;
        }
        seenUrls.add(normalized);
        urlSamples.push(normalized);
        if (urlSamples.length >= 8) {
          break;
        }
      }
      if (urlSamples.length >= 8) {
        break;
      }
    }

    return {
      runId,
      traceId: trace.traceId,
      site: trace.site,
      taskHint: trace.taskHint,
      totalSteps: trace.steps.length,
      tabs: built.tabs,
      highLevelSteps: built.highSteps.slice(0, 24),
      urlSamples,
      actionSummary,
    };
  }

  private buildSessionId(runId: string): string {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
    return `${runId}_compact_${stamp}`;
  }

  private async reasonRound(
    summary: CompactTraceSummary,
    state: CompactSessionState,
    latestHumanReply: string | undefined
  ) {
    const assistantResponse = await this.reasonRoundText(summary, state, latestHumanReply);
    const result = await this.modelClient.completeObject<Record<string, unknown>>(
      SUMMARIZE_SYSTEM_PROMPT,
      this.buildSummarizePrompt(state, latestHumanReply, assistantResponse)
    );
    return normalizeCompactTurnOutput(result.payload, state, assistantResponse);
  }

  private async reasonRoundText(
    summary: CompactTraceSummary,
    state: CompactSessionState,
    latestHumanReply: string | undefined
  ): Promise<string> {
    const result = await this.modelClient.completeText(
      REASONER_SYSTEM_PROMPT,
      this.buildReasonerPrompt(summary, state, latestHumanReply)
    );
    return result.rawText.trim();
  }

  private buildReasonerPrompt(
    summary: CompactTraceSummary,
    state: CompactSessionState,
    latestHumanReply: string | undefined
  ): string {
    return [
      "You are in round-based compact reasoning.",
      "",
      "Trace Summary JSON:",
      JSON.stringify(summary, null, 2),
      "",
      "Current Session State JSON:",
      JSON.stringify(state, null, 2),
      "",
      "Latest Human Reply:",
      latestHumanReply ? latestHumanReply : "(none)",
      "",
      "Instructions:",
      "1) Continue from the current session state instead of restarting analysis from scratch.",
      "2) Explain your updated understanding of the reusable workflow capability in natural language.",
      "3) Prioritize whether the task goal, action policy, stop condition, or reuse boundary still needs clarification.",
      "4) If a human question is needed, ask exactly one focused question in natural language.",
      "5) If no human question is needed, say that the workflow now seems sufficiently understood for reuse.",
      "6) Keep the wording usable for a human conversation; do not emit JSON.",
    ].join("\n");
  }

  private buildSummarizePrompt(
    state: CompactSessionState,
    latestHumanReply: string | undefined,
    assistantResponse: string
  ): string {
    return [
      "Convert the reasoning turn below into a compact session patch.",
      "",
      "Current Session State JSON:",
      JSON.stringify(state, null, 2),
      "",
      "Latest Human Reply:",
      latestHumanReply ? latestHumanReply : "(none)",
      "",
      "Freeform Reasoning Turn:",
      assistantResponse,
      "",
      "Instructions:",
      "1) taskUnderstandingNext must represent the latest full understanding after this turn.",
      "2) openDecisionsNext must list only unresolved decisions that still affect workflow reuse.",
      "3) absorbedHumanFeedback must contain concise canonical memories only when the latest human reply adds useful signal.",
      "4) If the reasoning asks the human a focused question, populate humanLoopRequest and keep convergenceNext.status as continue.",
      "5) If the reasoning says the workflow is sufficiently understood and no focused question remains, use ready_to_finalize.",
    ].join("\n");
  }

  private async finalize(
    summary: CompactTraceSummary,
    state: CompactSessionState
  ): Promise<CompactCapabilityOutput> {
    const result = await this.modelClient.completeObject<Record<string, unknown>>(
      FINALIZE_SYSTEM_PROMPT,
      this.buildFinalizePrompt(summary, state)
    );
    return this.normalizeCapabilityOutput(result.payload, state);
  }

  private buildFinalizePrompt(summary: CompactTraceSummary, state: CompactSessionState): string {
    return [
      "Finalize the compact capability output from this session.",
      "",
      "Trace Summary JSON:",
      JSON.stringify(summary, null, 2),
      "",
      "Final Session State JSON:",
      JSON.stringify(state, null, 2),
      "",
      "Rules:",
      "1) workflowSkeleton must reflect stableSteps only.",
      "2) If stop policy or action policy is not truly clear, keep it conservative and surface uncertainty.",
      "3) remainingUncertainties should include openDecisions and any still-important uncertain steps.",
    ].join("\n");
  }

  private normalizeCapabilityOutput(
    payload: Record<string, unknown>,
    state: CompactSessionState
  ): CompactCapabilityOutput {
    return normalizeCompactCapabilityOutput(payload, state);
  }

  private async emitTelemetry(telemetry: RuntimeRunTelemetry | null, event: RuntimeEvent): Promise<void> {
    if (!telemetry) {
      return;
    }
    try {
      await telemetry.eventBus.emit(event);
    } catch {
      // lifecycle telemetry is best-effort for compact runs
    }
  }

  private createTelemetry(scope: RuntimeRunTelemetryScope): RuntimeRunTelemetry | null {
    try {
      return this.telemetryRegistry.createRunTelemetry(scope);
    } catch {
      return null;
    }
  }
}

function uniqueStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const normalized = raw.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
