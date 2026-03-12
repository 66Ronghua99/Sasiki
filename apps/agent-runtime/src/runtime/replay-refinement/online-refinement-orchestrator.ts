/**
 * Deps: contracts/logger.ts, runtime/replay-refinement/browser-operator-gateway.ts, runtime/replay-refinement/refinement-hitl-loop.ts
 * Used By: runtime/workflow-runtime.ts (future wiring)
 * Last Updated: 2026-03-12
 */
import type { Logger } from "../../contracts/logger.js";
import type {
  BrowserOperatorGateway,
  BrowserOperatorTurnInput,
  BrowserOperatorTurnResult,
} from "./browser-operator-gateway.js";
import type { RefinementHitlLoop } from "./refinement-hitl-loop.js";

export type RefinementState = "INIT" | "OPERATE" | "EVALUATE" | "HITL" | "PROMOTE_OR_HOLD" | "NEXT_PAGE_STEP" | "FINALIZE";

export type RefinementEndReason = "goal_achieved" | "user_stopped" | "max_round_reached" | "hard_failure";

export interface RefinementKnowledgeLoadedEvent {
  event: "refinement_knowledge_loaded.v0";
  runId: string;
  sessionId: string;
  surfaceKey: string;
  taskKey: string;
  knowledge_loaded_count: number;
  knowledge_selected_ids: string[];
  bundle_source: "capability_only" | "capability_plus_knowledge";
}

export interface RefinementEvaluateResult {
  assistantIntent: string;
  outcome: "progress" | "no_progress" | "page_changed" | "info_only" | "blocked";
  relevance: "task_relevant" | "task_irrelevant" | "unknown";
  hitlNeeded: boolean;
  hitlQuestion?: string;
}

export interface RefinementPromoteResult {
  promoteDecision: "promote" | "hold";
  confidence: "high" | "medium" | "low";
  rationale: string;
}

export interface RefinementDecisionEngine {
  evaluate(turn: BrowserOperatorTurnResult): Promise<RefinementEvaluateResult>;
  promote(turn: BrowserOperatorTurnResult, evaluation: RefinementEvaluateResult): Promise<RefinementPromoteResult>;
}

export interface OnlineRefinementRunInput {
  runId: string;
  sessionId: string;
  task: string;
  surfaceKey: string;
  taskKey: string;
  bundleSource: "capability_only" | "capability_plus_knowledge";
  loadedKnowledgeIds: string[];
  consumptionBundle?: Record<string, unknown>;
  maxRounds: number;
}

export interface OnlineRefinementRunResult {
  status: "completed" | "stopped" | "failed";
  endReason: RefinementEndReason;
  rounds: number;
  steps: BrowserOperatorTurnResult[];
}

export interface OnlineRefinementOrchestratorOptions {
  logger: Logger;
  operatorGateway: BrowserOperatorGateway;
  hitlLoop: RefinementHitlLoop;
  decisionEngine: RefinementDecisionEngine;
  isGoalAchieved?: (turn: BrowserOperatorTurnResult, evaluation: RefinementEvaluateResult) => boolean | Promise<boolean>;
}

export class OnlineRefinementOrchestrator {
  private readonly logger: Logger;
  private readonly operatorGateway: BrowserOperatorGateway;
  private readonly hitlLoop: RefinementHitlLoop;
  private readonly decisionEngine: RefinementDecisionEngine;
  private readonly isGoalAchieved?: (
    turn: BrowserOperatorTurnResult,
    evaluation: RefinementEvaluateResult,
  ) => boolean | Promise<boolean>;

  constructor(options: OnlineRefinementOrchestratorOptions) {
    this.logger = options.logger;
    this.operatorGateway = options.operatorGateway;
    this.hitlLoop = options.hitlLoop;
    this.decisionEngine = options.decisionEngine;
    this.isGoalAchieved = options.isGoalAchieved;
  }

  async run(input: OnlineRefinementRunInput): Promise<OnlineRefinementRunResult> {
    let state: RefinementState = "INIT";
    const steps: BrowserOperatorTurnResult[] = [];
    let round = 0;
    let pageStepCounter = 1;

    this.emitKnowledgeLoadedEvent({
      event: "refinement_knowledge_loaded.v0",
      runId: input.runId,
      sessionId: input.sessionId,
      surfaceKey: input.surfaceKey,
      taskKey: input.taskKey,
      knowledge_loaded_count: input.loadedKnowledgeIds.length,
      knowledge_selected_ids: input.loadedKnowledgeIds,
      bundle_source: input.bundleSource,
    });

    while (round < input.maxRounds) {
      round += 1;
      state = "OPERATE";
      const operateInput: BrowserOperatorTurnInput = {
        runId: input.runId,
        sessionId: input.sessionId,
        task: input.task,
        pageStepId: `page_step_${pageStepCounter}`,
        stepIndex: round,
        consumptionBundle: input.consumptionBundle,
        selectedKnowledgeIds: input.loadedKnowledgeIds,
      };

      let turnResult: BrowserOperatorTurnResult;
      try {
        turnResult = await this.operatorGateway.operate(operateInput);
      } catch (error) {
        this.logger.error("refinement_operate_failed", {
          runId: input.runId,
          sessionId: input.sessionId,
          stepIndex: round,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          status: "failed",
          endReason: "hard_failure",
          rounds: round,
          steps,
        };
      }
      steps.push(turnResult);

      state = "EVALUATE";
      const evaluation = await this.decisionEngine.evaluate(turnResult);

      if (evaluation.hitlNeeded || evaluation.outcome === "no_progress") {
        state = "HITL";
        const pauseId = `${input.sessionId}_pause_${round}`;
        const hitlResponse = await this.hitlLoop.requestPause({
          schemaVersion: "refinement_hitl_request.v0",
          pauseId,
          runId: input.runId,
          sessionId: input.sessionId,
          attempt: round,
          issueType: "uncertain_state",
          operationIntent: evaluation.assistantIntent,
          failureReason: turnResult.resultExcerpt,
          beforeState: turnResult.beforeSnapshot?.summary ?? "",
          defaultResumeMode: evaluation.outcome === "no_progress" ? "retry_step" : "continue_current_state",
          context: {
            pageId: turnResult.pageId,
            stepIndex: round,
            toolCallId: turnResult.toolCallId,
            assistantIntent: evaluation.assistantIntent,
            hitlQuestion: evaluation.hitlQuestion,
          },
        });
        turnResult.humanInterventionNote = [
          `humanAction: ${hitlResponse.humanAction}`,
          `resumeInstruction: ${hitlResponse.resumeInstruction}`,
        ];
        if (hitlResponse.resumeMode === "abort_run") {
          return {
            status: "stopped",
            endReason: "user_stopped",
            rounds: round,
            steps,
          };
        }
        if (hitlResponse.resumeMode === "retry_step") {
          round -= 1;
          continue;
        }
        if (hitlResponse.resumeMode === "skip_step") {
          continue;
        }
      }

      state = "PROMOTE_OR_HOLD";
      await this.decisionEngine.promote(turnResult, evaluation);

      if (this.isGoalAchieved && (await this.isGoalAchieved(turnResult, evaluation))) {
        return {
          status: "completed",
          endReason: "goal_achieved",
          rounds: round,
          steps,
        };
      }

      state = "NEXT_PAGE_STEP";
      if (evaluation.outcome === "progress" || evaluation.outcome === "page_changed") {
        pageStepCounter += 1;
      }
    }

    state = "FINALIZE";
    this.logger.info("refinement_orchestrator_finalized", {
      runId: input.runId,
      sessionId: input.sessionId,
      finalState: state,
      rounds: round,
    });
    return {
      status: "completed",
      endReason: "max_round_reached",
      rounds: round,
      steps,
    };
  }

  private emitKnowledgeLoadedEvent(event: RefinementKnowledgeLoadedEvent): void {
    this.logger.info(event.event, {
      runId: event.runId,
      sessionId: event.sessionId,
      surfaceKey: event.surfaceKey,
      taskKey: event.taskKey,
      knowledge_loaded_count: event.knowledge_loaded_count,
      knowledge_selected_ids: event.knowledge_selected_ids,
      bundle_source: event.bundle_source,
    });
  }
}
