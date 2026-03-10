import { readFile, appendFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { JsonModelClient } from "../core/json-model-client.js";
import type { CompactHumanLoopTool } from "../contracts/compact-human-loop-tool.js";
import type {
  CompactCapabilityOutput,
  CompactConvergenceState,
  CompactConvergenceStatus,
  CompactHumanLoopEvent,
  CompactHumanLoopRequest,
  CompactReasoningTurnOutput,
  CompactSessionPatch,
  CompactSessionState,
} from "../domain/compact-reasoning.js";
import type { SopTrace } from "../domain/sop-trace.js";
import { validateSopTrace } from "../domain/sop-trace.js";
import { TerminalCompactHumanLoopTool } from "../infrastructure/hitl/terminal-compact-human-loop-tool.js";
import { ArtifactsWriter } from "./artifacts-writer.js";
import { SopRuleCompactBuilder, type BuiltCompact } from "./sop-rule-compact-builder.js";
import type { SopCompactSemanticOptions } from "./sop-semantic-runner.js";

const REASONER_SYSTEM_PROMPT = [
  "You are the SOP compact reasoning agent for browser workflow demonstrations.",
  "Your job is to iteratively learn a reusable workflow capability from one trace together with a human.",
  "Write natural-language reasoning for the human, not JSON.",
  "Prioritize clarifying task goal, action policy, stop condition, and reuse boundary before noise cleanup or selector detail.",
  "Ask at most one focused human question only when the answer would materially change workflow skeleton, action policy, stop policy, or reuse boundary.",
  "If you need human input, end the reply with one direct question or one clearly-marked question section.",
  "Prefer reusable workflow language over selector-level or URL-level detail.",
  "If the workflow is already sufficiently understood for reuse, say so plainly instead of asking another question.",
  "Do not invent facts not supported by the trace summary, current session state, or latest human reply.",
  "Do not wrap the answer in code fences.",
].join("\n");

const SUMMARIZE_SYSTEM_PROMPT = [
  "You convert one freeform compact reasoning turn into a machine-readable state update.",
  "Return one RFC8259 JSON object and nothing else.",
  "All strings must stay on a single line.",
  "Use this JSON shape exactly: {\"patch\":{\"schemaVersion\":\"compact_session_patch.v0\",\"workflowUpdates\":{\"addStableSteps\":[],\"removeStableSteps\":[],\"addUncertainSteps\":[],\"removeUncertainSteps\":[],\"addNoiseNotes\":[]},\"taskUnderstandingNext\":\"...\",\"openDecisionsNext\":[],\"absorbedHumanFeedback\":[],\"convergenceNext\":{\"status\":\"continue|ready_to_finalize\",\"reason\":\"...\"}},\"humanLoopRequest\":null|{\"reason_for_clarification\":\"...\",\"current_understanding\":\"...\",\"focus_question\":\"...\",\"why_this_matters\":\"...\"}}",
  "The patch must reflect the latest freeform reasoning turn, not invent a separate interpretation.",
  "Keep only currently unresolved decisions in openDecisionsNext; do not accumulate stale issues.",
  "If humanLoopRequest is present, convergenceNext.status must be continue.",
  "Only use ready_to_finalize when the reasoning clearly says the capability is sufficiently understood for reuse and no focused human question remains.",
  "Prefer short reusable workflow steps over selector-level detail.",
].join("\n");

const FINALIZE_SYSTEM_PROMPT = [
  "You are finalizing a reusable SOP compact capability from an already-completed session.",
  "Do not invent new conclusions.",
  "Use stable steps as the workflow skeleton.",
  "If something is still unresolved, keep it in remainingUncertainties instead of guessing.",
  "Return one RFC8259 JSON object and nothing else.",
  "All strings must stay on a single line.",
  "Use this JSON shape exactly: {\"schemaVersion\":\"compact_capability_output.v0\",\"runId\":\"...\",\"taskUnderstanding\":\"...\",\"workflowSkeleton\":[],\"decisionStrategy\":[],\"actionPolicy\":{\"requiredActions\":[],\"optionalActions\":[],\"conditionalActions\":[],\"nonCoreActions\":[]},\"stopPolicy\":[],\"reuseBoundary\":{\"applicableWhen\":[],\"notApplicableWhen\":[],\"contextDependencies\":[]},\"remainingUncertainties\":[]}",
].join("\n");

interface CompactTraceSummary {
  runId: string;
  traceId: string;
  site: string;
  taskHint: string;
  totalSteps: number;
  tabs: string[];
  highLevelSteps: string[];
  urlSamples: string[];
  actionSummary: Record<string, number>;
}

interface InteractiveSopCompactOptions {
  semantic: SopCompactSemanticOptions;
  hardLimit?: number;
  humanLoopTool?: CompactHumanLoopTool;
}

export interface InteractiveSopCompactResult {
  runId: string;
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
  private readonly semanticOptions: SopCompactSemanticOptions;
  private readonly hardLimit: number;
  private readonly humanLoopTool: CompactHumanLoopTool;
  private readonly modelClient: JsonModelClient;
  private readonly ruleBuilder = new SopRuleCompactBuilder();

  constructor(artifactsDir: string, options: InteractiveSopCompactOptions) {
    this.artifactsDir = path.resolve(artifactsDir);
    this.semanticOptions = options.semantic;
    this.hardLimit = options.hardLimit ?? 6;
    this.humanLoopTool = options.humanLoopTool ?? new TerminalCompactHumanLoopTool();
    this.modelClient = new JsonModelClient({
      model: options.semantic.model,
      apiKey: options.semantic.apiKey,
      baseUrl: options.semantic.baseUrl,
      timeoutMs: options.semantic.timeoutMs,
      thinkingLevel: options.semantic.thinkingLevel,
    });
  }

  async compact(runId: string): Promise<InteractiveSopCompactResult> {
    if (this.semanticOptions.mode === "off") {
      throw new Error("interactive sop-compact requires semantic mode on or auto");
    }

    const runDir = path.join(this.artifactsDir, runId);
    const sourceTracePath = path.join(runDir, "demonstration_trace.json");
    const writer = new ArtifactsWriter(this.artifactsDir, runId);
    await writer.ensureDir();

    const trace = await this.readTrace(sourceTracePath);
    const summary = this.buildTraceSummary(runId, trace);
    let state = this.buildInitialSessionState(runId, summary);
    let latestHumanReply: string | undefined;

    await writer.writeCompactSessionState(state);
    await this.appendRuntimeLog(runDir, "INFO", "interactive_sop_compact_started", {
      runId,
      hardLimit: this.hardLimit,
      totalSteps: summary.totalSteps,
      totalHighLevelSteps: summary.highLevelSteps.length,
    });

    while (true) {
      if (state.roundIndex >= this.hardLimit) {
        state = {
          ...state,
          convergence: {
            status: "max_round_reached",
            reason: `hard limit ${this.hardLimit} reached`,
          },
        };
        await writer.writeCompactSessionState(state);
        await writer.appendCompactHumanLoop(this.buildSessionStatusEvent(state.roundIndex, state.convergence));
        break;
      }

      const roundNumber = state.roundIndex + 1;
      const turn = await this.reasonRound(summary, state, latestHumanReply);
      this.printAssistantResponse(roundNumber, turn.assistantResponse);
      await writer.appendCompactHumanLoop(this.buildAssistantEvent(roundNumber, turn.assistantResponse));

      state = this.applyPatch(state, turn.patch);
      await writer.writeCompactSessionState(state);
      await writer.appendCompactHumanLoop(this.buildSessionStatusEvent(state.roundIndex, state.convergence));
      await this.appendRuntimeLog(runDir, "INFO", "interactive_sop_compact_round_applied", {
        runId,
        round: state.roundIndex,
        convergenceStatus: state.convergence.status,
        remainingOpenDecisions: state.openDecisions.length,
      });

      if (state.convergence.status !== "continue") {
        latestHumanReply = undefined;
        break;
      }

      if (!turn.humanLoopRequest) {
        latestHumanReply = undefined;
        continue;
      }

      await writer.appendCompactHumanLoop(this.buildClarificationRequestEvent(state.roundIndex, turn.humanLoopRequest));
      const humanResponse = await this.humanLoopTool.requestClarification(turn.humanLoopRequest);
      await writer.appendCompactHumanLoop({
        timestamp: new Date().toISOString(),
        roundIndex: state.roundIndex,
        role: "human",
        eventType: "human_reply",
        payload: {
          interaction_status: humanResponse.interaction_status,
          human_reply: humanResponse.human_reply,
        },
      });

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
        await writer.writeCompactSessionState(state);
        await writer.appendCompactHumanLoop(this.buildSessionStatusEvent(state.roundIndex, state.convergence));
        break;
      }

      latestHumanReply = humanResponse.human_reply.trim();
    }

    const capabilityOutput = await this.finalize(summary, state);
    await writer.writeCompactCapabilityOutput(capabilityOutput);
    await this.appendRuntimeLog(runDir, "INFO", "interactive_sop_compact_finalized", {
      runId,
      convergenceStatus: state.convergence.status,
      roundsCompleted: state.roundIndex,
    });

    return {
      runId,
      runDir,
      sourceTracePath,
      sessionStatePath: path.join(runDir, "compact_session_state.json"),
      humanLoopPath: path.join(runDir, "compact_human_loop.jsonl"),
      capabilityOutputPath: path.join(runDir, "compact_capability_output.json"),
      status: state.convergence.status,
      roundsCompleted: state.roundIndex,
      remainingOpenDecisions: [...state.openDecisions],
    };
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

  private buildInitialSessionState(runId: string, summary: CompactTraceSummary): CompactSessionState {
    const initialTaskUnderstanding = summary.taskHint
      ? `当前已知这是一条与“${summary.taskHint}”相关的浏览器示教，具体目标和动作策略仍待通过多轮推理收敛。`
      : `当前已知这是 ${summary.site} 上的一条浏览器示教，具体目标和动作策略仍待通过多轮推理收敛。`;
    const noiseNotes =
      summary.tabs.length > 1
        ? [`示教涉及 ${summary.tabs.length} 个标签页，需警惕前置页面或跨 tab 噪音。`]
        : [];
    return {
      schemaVersion: "compact_session_state.v0",
      sessionId: `${runId}_compact_session`,
      runId,
      roundIndex: 0,
      workflowSkeleton: {
        stableSteps: [],
        uncertainSteps: summary.highLevelSteps,
        noiseNotes,
      },
      taskUnderstanding: initialTaskUnderstanding,
      openDecisions: [
        "这条流程真正想复用的目标是什么？",
        "对象动作是必做、可选还是按情况触发？",
        "什么条件下算这条流程完成？",
      ],
      humanFeedbackMemory: [],
      convergence: {
        status: "continue",
        reason: "initial reasoning pending",
      },
    };
  }

  private async reasonRound(
    summary: CompactTraceSummary,
    state: CompactSessionState,
    latestHumanReply: string | undefined
  ): Promise<CompactReasoningTurnOutput> {
    const assistantResponse = await this.reasonRoundText(summary, state, latestHumanReply);
    const result = await this.modelClient.completeObject<Record<string, unknown>>(
      SUMMARIZE_SYSTEM_PROMPT,
      this.buildSummarizePrompt(state, latestHumanReply, assistantResponse)
    );
    return this.normalizeTurnOutput(result.payload, state, assistantResponse);
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

  private normalizeTurnOutput(
    payload: Record<string, unknown>,
    state: CompactSessionState,
    assistantResponse: string
  ): CompactReasoningTurnOutput {
    const patchRecord = this.readRecord(payload.patch);
    const workflowUpdates = this.readRecord(patchRecord?.workflowUpdates);
    const taskUnderstandingNext = this.readString(patchRecord?.taskUnderstandingNext) ?? state.taskUnderstanding;
    const requestedConvergence = this.normalizeConvergence(
      this.readRecord(patchRecord?.convergenceNext),
      state.convergence
    );
    const explicitOpenDecisions = this.readStringArray(patchRecord?.openDecisionsNext);
    const openDecisionsNext =
      explicitOpenDecisions.length > 0
        ? explicitOpenDecisions
        : this.deriveFallbackOpenDecisions(assistantResponse, requestedConvergence, state.openDecisions);

    const humanLoopRequest =
      this.normalizeHumanLoopRequest(payload.humanLoopRequest, assistantResponse) ??
      this.deriveHumanLoopRequestFromAssistantResponse(
        taskUnderstandingNext,
        openDecisionsNext,
        requestedConvergence
      );
    const effectiveConvergence =
      requestedConvergence.status === "ready_to_finalize" && humanLoopRequest
        ? { status: "continue" as const, reason: "human clarification still requested" }
        : requestedConvergence;

    return {
      assistantResponse,
      patch: {
        schemaVersion: "compact_session_patch.v0",
        workflowUpdates: {
          addStableSteps: this.readStringArray(workflowUpdates?.addStableSteps),
          removeStableSteps: this.readStringArray(workflowUpdates?.removeStableSteps),
          addUncertainSteps: this.readStringArray(workflowUpdates?.addUncertainSteps),
          removeUncertainSteps: this.readStringArray(workflowUpdates?.removeUncertainSteps),
          addNoiseNotes: this.readStringArray(workflowUpdates?.addNoiseNotes),
        },
        taskUnderstandingNext,
        openDecisionsNext,
        absorbedHumanFeedback: this.readStringArray(patchRecord?.absorbedHumanFeedback),
        convergenceNext: effectiveConvergence,
      },
      humanLoopRequest: effectiveConvergence.status === "continue" ? humanLoopRequest : undefined,
    };
  }

  private deriveFallbackOpenDecisions(
    assistantResponse: string,
    requestedConvergence: CompactConvergenceState,
    fallback: string[]
  ): string[] {
    if (requestedConvergence.status !== "continue") {
      return [];
    }

    const extractedQuestion = this.extractLastQuestionLine(assistantResponse);
    if (extractedQuestion) {
      return [extractedQuestion];
    }

    const reason = requestedConvergence.reason.trim();
    if (reason) {
      return [reason];
    }

    return [...fallback];
  }

  private applyPatch(state: CompactSessionState, patch: CompactSessionPatch): CompactSessionState {
    const stableSteps = this.mergeOrderedStrings(
      state.workflowSkeleton.stableSteps,
      patch.workflowUpdates.removeStableSteps,
      patch.workflowUpdates.addStableSteps
    );
    let uncertainSteps = this.mergeOrderedStrings(
      state.workflowSkeleton.uncertainSteps,
      patch.workflowUpdates.removeUncertainSteps,
      patch.workflowUpdates.addUncertainSteps
    ).filter((step) => !stableSteps.includes(step));

    for (const step of patch.workflowUpdates.addStableSteps) {
      uncertainSteps = uncertainSteps.filter((candidate) => candidate !== step);
    }

    const nextState: CompactSessionState = {
      ...state,
      roundIndex: state.roundIndex + 1,
      workflowSkeleton: {
        stableSteps,
        uncertainSteps,
        noiseNotes: this.mergeOrderedStrings(state.workflowSkeleton.noiseNotes, [], patch.workflowUpdates.addNoiseNotes),
      },
      taskUnderstanding: patch.taskUnderstandingNext.trim() || state.taskUnderstanding,
      openDecisions: this.readStringArray(patch.openDecisionsNext, state.openDecisions),
      humanFeedbackMemory: this.mergeOrderedStrings(state.humanFeedbackMemory, [], patch.absorbedHumanFeedback),
      convergence: patch.convergenceNext,
    };

    if (
      nextState.convergence.status === "ready_to_finalize" &&
      state.humanFeedbackMemory.length === 0 &&
      state.openDecisions.length > 0 &&
      nextState.openDecisions.length === 0
    ) {
      return {
        ...nextState,
        openDecisions: state.openDecisions,
        convergence: {
          status: "continue",
          reason: "cannot finalize before any human clarification when critical open decisions still existed",
        },
      };
    }

    return nextState;
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
    const actionPolicy = this.readRecord(payload.actionPolicy);
    const reuseBoundary = this.readRecord(payload.reuseBoundary);
    const remainingUncertainties = [
      ...this.readStringArray(payload.remainingUncertainties),
      ...state.openDecisions,
      ...state.workflowSkeleton.uncertainSteps,
    ];

    return {
      schemaVersion: "compact_capability_output.v0",
      runId: state.runId,
      taskUnderstanding: this.readString(payload.taskUnderstanding) ?? state.taskUnderstanding,
      workflowSkeleton: this.readStringArray(payload.workflowSkeleton, state.workflowSkeleton.stableSteps),
      decisionStrategy: this.readStringArray(payload.decisionStrategy),
      actionPolicy: {
        requiredActions: this.readStringArray(actionPolicy?.requiredActions),
        optionalActions: this.readStringArray(actionPolicy?.optionalActions),
        conditionalActions: this.readStringArray(actionPolicy?.conditionalActions),
        nonCoreActions: this.readStringArray(actionPolicy?.nonCoreActions),
      },
      stopPolicy: this.readStringArray(payload.stopPolicy),
      reuseBoundary: {
        applicableWhen: this.readStringArray(reuseBoundary?.applicableWhen),
        notApplicableWhen: this.readStringArray(reuseBoundary?.notApplicableWhen),
        contextDependencies: this.readStringArray(reuseBoundary?.contextDependencies),
      },
      remainingUncertainties: this.uniqueStrings(remainingUncertainties),
    };
  }

  private buildAssistantEvent(roundIndex: number, assistantResponse: string): CompactHumanLoopEvent {
    return {
      timestamp: new Date().toISOString(),
      roundIndex,
      role: "agent",
      eventType: "assistant_response",
      payload: {
        message: assistantResponse,
      },
    };
  }

  private buildClarificationRequestEvent(roundIndex: number, request: CompactHumanLoopRequest): CompactHumanLoopEvent {
    return {
      timestamp: new Date().toISOString(),
      roundIndex,
      role: "agent",
      eventType: "clarification_request",
      payload: {
        reason_for_clarification: request.reason_for_clarification,
        current_understanding: request.current_understanding,
        focus_question: request.focus_question,
        why_this_matters: request.why_this_matters,
      },
    };
  }

  private buildSessionStatusEvent(roundIndex: number, convergence: CompactConvergenceState): CompactHumanLoopEvent {
    return {
      timestamp: new Date().toISOString(),
      roundIndex,
      role: "system",
      eventType: "session_status",
      payload: {
        status: convergence.status,
        reason: convergence.reason,
      },
    };
  }

  private normalizeConvergence(
    value: Record<string, unknown> | undefined,
    fallback: CompactConvergenceState
  ): CompactConvergenceState {
    const status = this.readString(value?.status);
    if (status === "ready_to_finalize") {
      return {
        status,
        reason: this.readString(value?.reason) ?? fallback.reason,
      };
    }
    return {
      status: "continue",
      reason: this.readString(value?.reason) ?? fallback.reason,
    };
  }

  private normalizeHumanLoopRequest(
    value: unknown,
    assistantResponse: string
  ): CompactHumanLoopRequest | undefined {
    const record = this.readRecord(value);
    if (!record) {
      return undefined;
    }
    const focusQuestion = this.readString(record.focus_question);
    if (!focusQuestion) {
      return undefined;
    }
    return {
      reason_for_clarification: this.readString(record.reason_for_clarification) ?? "critical ambiguity remains",
      current_understanding: this.readString(record.current_understanding) ?? assistantResponse,
      focus_question: focusQuestion,
      why_this_matters:
        this.readString(record.why_this_matters) ?? "The answer will change how this workflow should be reused.",
    };
  }

  private deriveHumanLoopRequestFromAssistantResponse(
    taskUnderstandingNext: string,
    openDecisionsNext: string[],
    requestedConvergence: CompactConvergenceState
  ): CompactHumanLoopRequest | undefined {
    if (requestedConvergence.status !== "continue" || openDecisionsNext.length === 0) {
      return undefined;
    }

    return {
      reason_for_clarification: requestedConvergence.reason || "critical ambiguity remains",
      current_understanding: taskUnderstandingNext,
      focus_question: openDecisionsNext[0],
      why_this_matters: "The answer will change the reusable boundary or action policy of this workflow.",
    };
  }

  private extractLastQuestionLine(message: string): string | undefined {
    const lines = message
      .split(/\r?\n/)
      .map((line) => this.stripFormatting(line))
      .filter((line) => line.length > 0);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (/[？?]\s*$/.test(lines[index])) {
        return lines[index];
      }
    }

    return undefined;
  }

  private stripFormatting(line: string): string {
    return line
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .trim();
  }

  private mergeOrderedStrings(base: string[], removals: string[], additions: string[]): string[] {
    const removalSet = new Set(removals.map((item) => item.trim()).filter(Boolean));
    const merged = base.filter((item) => !removalSet.has(item.trim()));
    for (const item of additions) {
      if (!item.trim() || merged.includes(item)) {
        continue;
      }
      merged.push(item);
    }
    return this.uniqueStrings(merged);
  }

  private uniqueStrings(values: string[]): string[] {
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

  private readString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  }

  private readStringArray(value: unknown, fallback: string[] = []): string[] {
    if (!Array.isArray(value)) {
      return [...fallback];
    }
    return this.uniqueStrings(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
    );
  }

  private readRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  }

  private printAssistantResponse(roundNumber: number, message: string): void {
    if (!process.stdout.isTTY || !message.trim()) {
      return;
    }
    process.stdout.write(`\n--- compact round ${roundNumber} ---\n${message}\n`);
  }

  private async appendRuntimeLog(
    runDir: string,
    level: "INFO" | "WARN" | "ERROR",
    event: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const line = `${new Date().toISOString()} ${level} ${event} ${JSON.stringify(data)}\n`;
    await appendFile(path.join(runDir, "runtime.log"), line, "utf-8");
  }
}
