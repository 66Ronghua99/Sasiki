import type { CompactHumanLoopTool } from "../../contracts/compact-human-loop-tool.js";
import type { RuntimeEvent } from "../../contracts/runtime-telemetry.js";
import type {
  CompactHumanLoopEvent,
  CompactReasoningTurnOutput,
  CompactSessionState,
} from "../../domain/compact-reasoning.js";
import { applyCompactSessionPatch, buildInitialCompactSessionState, type CompactTraceSummary } from "./compact-session-machine.js";
import {
  buildCompactAgentTurnEvent,
  buildCompactAssistantEvent,
  buildCompactClarificationRequestEvent,
  buildCompactSessionStatusEvent,
} from "./compact-runtime-support.js";

interface CompactSessionArtifacts {
  writeCompactSessionState(state: CompactSessionState, sessionId?: string): Promise<void>;
  appendCompactHumanLoop(event: CompactHumanLoopEvent, sessionId?: string): Promise<void>;
}

interface RunInteractiveCompactSessionOptions {
  runId: string;
  sessionId: string;
  artifactsDir: string;
  hardLimit: number;
  summary: CompactTraceSummary;
  writer: CompactSessionArtifacts;
  humanLoopTool: CompactHumanLoopTool;
  reasonRound: (
    summary: CompactTraceSummary,
    state: CompactSessionState,
    latestHumanReply: string | undefined
  ) => Promise<CompactReasoningTurnOutput>;
  emitTelemetry: (event: RuntimeEvent) => Promise<void>;
}

export async function runInteractiveCompactSession(
  options: RunInteractiveCompactSessionOptions
): Promise<CompactSessionState> {
  let state = buildInitialCompactSessionState(options.runId, options.sessionId, options.summary);
  let latestHumanReply: string | undefined;

  await options.writer.writeCompactSessionState(state, options.sessionId);

  while (true) {
    if (state.roundIndex >= options.hardLimit) {
      state = {
        ...state,
        convergence: {
          status: "max_round_reached",
          reason: `hard limit ${options.hardLimit} reached`,
        },
      };
      await options.writer.writeCompactSessionState(state, options.sessionId);
      await options.writer.appendCompactHumanLoop(
        buildCompactSessionStatusEvent(state.roundIndex, state.convergence),
        options.sessionId
      );
      break;
    }

    const roundNumber = state.roundIndex + 1;
    const turn = await options.reasonRound(options.summary, state, latestHumanReply);
    await options.emitTelemetry(
      buildCompactAgentTurnEvent({
        runId: options.runId,
        roundIndex: roundNumber,
        assistantResponse: turn.assistantResponse,
        convergenceStatus: turn.patch.convergenceNext.status,
      })
    );
    await options.writer.appendCompactHumanLoop(
      buildCompactAssistantEvent(roundNumber, turn.assistantResponse),
      options.sessionId
    );

    state = applyCompactSessionPatch(state, turn.patch);
    await options.writer.writeCompactSessionState(state, options.sessionId);
    await options.writer.appendCompactHumanLoop(
      buildCompactSessionStatusEvent(state.roundIndex, state.convergence),
      options.sessionId
    );
    await options.emitTelemetry({
      timestamp: new Date().toISOString(),
      workflow: "compact",
      runId: options.runId,
      eventType: "workflow.lifecycle",
      payload: {
        phase: "round_completed",
        sessionId: options.sessionId,
        roundIndex: state.roundIndex,
        convergenceStatus: state.convergence.status,
        artifactsDir: options.artifactsDir,
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

    await options.writer.appendCompactHumanLoop(
      buildCompactClarificationRequestEvent(state.roundIndex, turn.humanLoopRequest),
      options.sessionId
    );
    const humanResponse = await options.humanLoopTool.requestClarification(turn.humanLoopRequest);
    await options.writer.appendCompactHumanLoop(
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
      options.sessionId
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
      await options.writer.writeCompactSessionState(state, options.sessionId);
      await options.writer.appendCompactHumanLoop(
        buildCompactSessionStatusEvent(state.roundIndex, state.convergence),
        options.sessionId
      );
      break;
    }

    latestHumanReply = humanResponse.human_reply.trim();
    state = {
      ...state,
      humanFeedbackMemory: uniqueStrings([...state.humanFeedbackMemory, latestHumanReply]),
    };
    await options.writer.writeCompactSessionState(state, options.sessionId);
  }

  return state;
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
