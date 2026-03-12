/**
 * Deps: contracts/logger.ts
 * Used By: runtime/replay-refinement/online-refinement-orchestrator.ts
 * Last Updated: 2026-03-12
 */
import type { Logger } from "../../contracts/logger.js";

export interface BrowserSnapshotRef {
  snapshotId: string;
  path?: string;
  summary: string;
  snapshotHash?: string;
}

export interface BrowserOperatorTurnInput {
  runId: string;
  sessionId: string;
  task: string;
  pageStepId: string;
  stepIndex: number;
  consumptionBundle?: Record<string, unknown>;
  selectedKnowledgeIds?: string[];
}

export interface BrowserOperatorTurnResult {
  pageId: string;
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  resultExcerpt: string;
  outcome: "progress" | "no_progress" | "page_changed" | "info_only" | "blocked";
  beforeSnapshot?: BrowserSnapshotRef;
  afterSnapshot?: BrowserSnapshotRef;
  elementHints?: {
    ref?: string;
    selector?: string;
    text?: string;
    role?: string;
  };
  humanInterventionNote?: string[];
}

export interface BrowserOperatorGateway {
  operate(input: BrowserOperatorTurnInput): Promise<BrowserOperatorTurnResult>;
}

export interface BrowserOperatorGatewayOptions {
  logger: Logger;
  runOperation: (input: BrowserOperatorTurnInput) => Promise<BrowserOperatorTurnResult>;
}

/**
 * Adapter shell around the concrete browser operator implementation.
 * v0 keeps this thin so orchestrator can evolve without coupling to AgentLoop internals.
 */
export class DefaultBrowserOperatorGateway implements BrowserOperatorGateway {
  private readonly logger: Logger;
  private readonly runOperation: (input: BrowserOperatorTurnInput) => Promise<BrowserOperatorTurnResult>;

  constructor(options: BrowserOperatorGatewayOptions) {
    this.logger = options.logger;
    this.runOperation = options.runOperation;
  }

  async operate(input: BrowserOperatorTurnInput): Promise<BrowserOperatorTurnResult> {
    this.logger.info("refinement_operator_turn_start", {
      runId: input.runId,
      sessionId: input.sessionId,
      pageStepId: input.pageStepId,
      stepIndex: input.stepIndex,
    });
    const result = await this.runOperation(input);
    this.logger.info("refinement_operator_turn_end", {
      runId: input.runId,
      sessionId: input.sessionId,
      pageStepId: input.pageStepId,
      stepIndex: input.stepIndex,
      toolName: result.toolName,
      outcome: result.outcome,
    });
    return result;
  }
}
