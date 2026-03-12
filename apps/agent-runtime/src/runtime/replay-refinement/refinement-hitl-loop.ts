/**
 * Deps: contracts/hitl-controller.ts, contracts/logger.ts, domain/intervention-learning.ts
 * Used By: runtime/replay-refinement/online-refinement-orchestrator.ts
 * Last Updated: 2026-03-12
 */
import type { HitlController } from "../../contracts/hitl-controller.js";
import type { Logger } from "../../contracts/logger.js";
import type { InterventionIssueType } from "../../domain/intervention-learning.js";

export type RefinementResumeMode = "retry_step" | "continue_current_state" | "skip_step" | "abort_run";

export interface RefinementHitlPauseRequest {
  schemaVersion: "refinement_hitl_request.v0";
  pauseId: string;
  runId: string;
  sessionId: string;
  attempt: number;
  issueType: InterventionIssueType;
  operationIntent: string;
  failureReason: string;
  beforeState: string;
  defaultResumeMode?: RefinementResumeMode;
  context: {
    pageId: string;
    stepIndex: number;
    toolCallId: string;
    assistantIntent: string;
    hitlQuestion?: string;
  };
}

export interface RefinementHitlPauseResponse {
  schemaVersion: "refinement_hitl_response.v0";
  pauseId: string;
  humanAction: string;
  resumeMode: RefinementResumeMode;
  resumeInstruction: string;
  nextTimeRule: string;
  resolvedAt: string;
}

export interface RefinementHitlLoopOptions {
  logger: Logger;
  controller?: HitlController;
}

/**
 * v0 HITL adapter:
 * - if controller exists, bridge to legacy HitlController request/response
 * - if missing, return deterministic continue_current_state response
 */
export class RefinementHitlLoop {
  private readonly logger: Logger;
  private readonly controller?: HitlController;

  constructor(options: RefinementHitlLoopOptions) {
    this.logger = options.logger;
    this.controller = options.controller;
  }

  async requestPause(request: RefinementHitlPauseRequest): Promise<RefinementHitlPauseResponse> {
    this.logger.warn("refinement_hitl_pause_requested", {
      pauseId: request.pauseId,
      runId: request.runId,
      sessionId: request.sessionId,
      issueType: request.issueType,
      stepIndex: request.context.stepIndex,
      toolCallId: request.context.toolCallId,
    });

    if (!this.controller) {
      return {
        schemaVersion: "refinement_hitl_response.v0",
        pauseId: request.pauseId,
        humanAction: "HITL controller unavailable.",
        resumeMode: "abort_run",
        resumeInstruction: "Stop run because HITL controller is not configured.",
        nextTimeRule: "Configure HITL controller before enabling refinement mode.",
        resolvedAt: new Date().toISOString(),
      };
    }

    const response = await this.controller.requestIntervention({
      runId: request.runId,
      attempt: request.attempt,
      issueType: request.issueType,
      operationIntent: request.operationIntent,
      failureReason: request.failureReason,
      beforeState: request.beforeState,
      context: {
        pageHint: request.context.pageId,
        elementHint: request.context.toolCallId,
      },
    });

    return {
      schemaVersion: "refinement_hitl_response.v0",
      pauseId: request.pauseId,
      humanAction: response.humanAction,
      resumeMode: this.inferResumeMode(response.resumeInstruction, request.defaultResumeMode),
      resumeInstruction: response.resumeInstruction,
      nextTimeRule: response.nextTimeRule,
      resolvedAt: new Date().toISOString(),
    };
  }

  private inferResumeMode(
    resumeInstruction: string,
    fallback: RefinementResumeMode | undefined,
  ): RefinementResumeMode {
    const normalized = resumeInstruction.trim().toLowerCase();
    if (normalized.includes("abort")) {
      return "abort_run";
    }
    if (normalized.includes("skip")) {
      return "skip_step";
    }
    if (normalized.includes("retry")) {
      return "retry_step";
    }
    return fallback ?? "continue_current_state";
  }
}
