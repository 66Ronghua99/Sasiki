/**
 * Deps: node:fs/promises, node:path, domain/sop-compact-artifacts.ts, domain/sop-compact-artifacts-v1.ts, runtime/sop-compact.ts, runtime/sop-semantic-runner.ts
 * Used By: index.ts
 * Last Updated: 2026-03-09
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { IntentResolution } from "../domain/sop-compact-artifacts.js";
import type {
  ClarificationPriority,
  ClarificationQuestionV1,
  ClarificationQuestionsV1,
  ExecutionGuideStatus,
  ExecutionGuideUnresolvedQuestion,
  ExecutionGuideV1,
} from "../domain/sop-compact-artifacts-v1.js";
import { SopCompactService, type SopCompactResult } from "./sop-compact.js";
import type { SopCompactSemanticOptions } from "./sop-semantic-runner.js";

const DEFAULT_MAX_ROUNDS = 2;

export type ClarificationExitReason =
  | "resolved"
  | "remaining_blockers"
  | "user_deferred"
  | "round_limit_reached"
  | "no_progress"
  | "recompile_error";

export type ClarificationResultStatus =
  | Extract<ExecutionGuideStatus, "ready_for_replay" | "needs_clarification">
  | "recompile_failed";

export interface SopCompactClarificationQuestion {
  questionId: string;
  prompt: string;
  reason: string;
  priority: ClarificationPriority;
  sourceKey: string;
}

export interface SopCompactClarificationRequest {
  kind: "clarification_request";
  runId: string;
  runDir: string;
  status: "needs_clarification";
  round: number;
  maxRounds: number;
  questions: SopCompactClarificationQuestion[];
  remainingBlockingKeys: string[];
  intentResolutionPath?: string;
  compactResult?: SopCompactResult;
}

export interface SopCompactClarificationAnswer {
  questionId: string;
  answer?: string;
  notes?: string;
  decision?: "answer" | "skip" | "defer";
}

export interface SopCompactClarificationStartInput {
  runId: string;
  compactFirst?: boolean;
  round?: number;
  maxRounds?: number;
}

export interface SopCompactClarificationSubmitInput {
  runId: string;
  round: number;
  maxRounds?: number;
  answers: SopCompactClarificationAnswer[];
}

export interface SopCompactClarificationResult {
  kind: "clarification_result";
  runId: string;
  runDir: string;
  status: ClarificationResultStatus;
  exitReason: ClarificationExitReason;
  round: number;
  maxRounds: number;
  replayReady: boolean;
  remainingBlockingKeys: string[];
  answeredQuestionIds: string[];
  skippedQuestionIds: string[];
  deferredQuestionId?: string;
  intentResolutionPath?: string;
  compactResult?: SopCompactResult;
  clarificationRequest?: SopCompactClarificationRequest;
  errorSummary?: string;
}

export class SopCompactClarificationService {
  private readonly artifactsDir: string;
  private readonly semanticOptions: SopCompactSemanticOptions;

  constructor(artifactsDir: string, semanticOptions: SopCompactSemanticOptions) {
    this.artifactsDir = path.resolve(artifactsDir);
    this.semanticOptions = semanticOptions;
  }

  async start(
    input: SopCompactClarificationStartInput
  ): Promise<SopCompactClarificationRequest | SopCompactClarificationResult> {
    const round = input.round ?? 1;
    const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;
    let compactResult: SopCompactResult | undefined;
    if (input.compactFirst !== false) {
      try {
        compactResult = await this.compact(input.runId);
      } catch (error) {
        return this.buildFailedResult({
          runId: input.runId,
          round,
          maxRounds,
          errorSummary: this.formatError(error),
        });
      }
    }
    return this.buildOutcomeFromCurrentState(input.runId, round, maxRounds, compactResult);
  }

  async submitAnswers(input: SopCompactClarificationSubmitInput): Promise<SopCompactClarificationResult> {
    const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;
    const request = await this.buildClarificationRequest(input.runId, input.round, maxRounds);
    if (!request) {
      const outcome = await this.buildOutcomeFromCurrentState(input.runId, input.round, maxRounds);
      if (outcome.kind === "clarification_result") {
        return outcome;
      }
      throw new Error("clarification request unexpectedly remained pending while submitting answers");
    }

    const questionById = new Map(request.questions.map((question) => [question.questionId, question]));
    const answeredQuestionIds: string[] = [];
    const skippedQuestionIds: string[] = [];
    const noteFragments: string[] = [];
    const resolvedFields: Record<string, string> = {};
    let deferredQuestionId: string | undefined;

    for (const item of input.answers) {
      const question = questionById.get(item.questionId);
      if (!question) {
        throw new Error(`unknown clarification question id: ${item.questionId}`);
      }
      const normalizedNote = item.notes?.trim();
      if (normalizedNote) {
        noteFragments.push(normalizedNote);
      }
      const decision = this.normalizeAnswerDecision(item);
      if (decision === "defer") {
        deferredQuestionId = item.questionId;
        break;
      }
      if (decision === "skip") {
        skippedQuestionIds.push(item.questionId);
        continue;
      }
      const normalizedAnswer = item.answer?.trim();
      if (!normalizedAnswer) {
        skippedQuestionIds.push(item.questionId);
        continue;
      }
      answeredQuestionIds.push(item.questionId);
      resolvedFields[question.sourceKey] = normalizedAnswer;
    }

    if (answeredQuestionIds.length === 0) {
      return {
        kind: "clarification_result",
        runId: input.runId,
        runDir: request.runDir,
        status: "needs_clarification",
        exitReason: "user_deferred",
        round: input.round,
        maxRounds,
        replayReady: false,
        remainingBlockingKeys: request.remainingBlockingKeys,
        answeredQuestionIds,
        skippedQuestionIds,
        deferredQuestionId,
        intentResolutionPath: request.intentResolutionPath,
        clarificationRequest: request,
      };
    }

    const intentResolutionPath = await this.writeIntentResolution(input.runId, resolvedFields, noteFragments);
    let compactResult: SopCompactResult;
    try {
      compactResult = await this.compact(input.runId);
    } catch (error) {
      return this.buildFailedResult({
        runId: input.runId,
        round: input.round,
        maxRounds,
        answeredQuestionIds,
        skippedQuestionIds,
        deferredQuestionId,
        intentResolutionPath,
        errorSummary: this.formatError(error),
      });
    }

    if (compactResult.status === "rejected") {
      return this.buildFailedResult({
        runId: input.runId,
        round: input.round,
        maxRounds,
        answeredQuestionIds,
        skippedQuestionIds,
        deferredQuestionId,
        intentResolutionPath,
        compactResult,
        errorSummary: "sop-compact recompile returned rejected; see runtime.log for semantic failure details.",
      });
    }

    const nextOutcome = await this.buildOutcomeFromCurrentState(input.runId, input.round + 1, maxRounds, compactResult);
    if (nextOutcome.kind === "clarification_request") {
      const beforeCount = request.remainingBlockingKeys.length;
      const afterCount = nextOutcome.remainingBlockingKeys.length;
      if (afterCount >= beforeCount) {
        return {
          kind: "clarification_result",
          runId: input.runId,
          runDir: nextOutcome.runDir,
          status: "needs_clarification",
          exitReason: "no_progress",
          round: input.round,
          maxRounds,
          replayReady: false,
          remainingBlockingKeys: nextOutcome.remainingBlockingKeys,
          answeredQuestionIds,
          skippedQuestionIds,
          deferredQuestionId,
          intentResolutionPath,
          compactResult,
          clarificationRequest: nextOutcome,
        };
      }
      if (input.round >= maxRounds) {
        return {
          kind: "clarification_result",
          runId: input.runId,
          runDir: nextOutcome.runDir,
          status: "needs_clarification",
          exitReason: "round_limit_reached",
          round: input.round,
          maxRounds,
          replayReady: false,
          remainingBlockingKeys: nextOutcome.remainingBlockingKeys,
          answeredQuestionIds,
          skippedQuestionIds,
          deferredQuestionId,
          intentResolutionPath,
          compactResult,
          clarificationRequest: nextOutcome,
        };
      }
      return {
        kind: "clarification_result",
        runId: input.runId,
        runDir: nextOutcome.runDir,
        status: "needs_clarification",
        exitReason: "remaining_blockers",
        round: input.round,
        maxRounds,
        replayReady: false,
        remainingBlockingKeys: nextOutcome.remainingBlockingKeys,
        answeredQuestionIds,
        skippedQuestionIds,
        deferredQuestionId,
        intentResolutionPath,
        compactResult,
        clarificationRequest: nextOutcome,
      };
    }

    return {
      ...nextOutcome,
      round: input.round,
      maxRounds,
      answeredQuestionIds,
      skippedQuestionIds,
      deferredQuestionId,
      intentResolutionPath,
      compactResult,
    };
  }

  private async buildOutcomeFromCurrentState(
    runId: string,
    round: number,
    maxRounds: number,
    compactResult?: SopCompactResult
  ): Promise<SopCompactClarificationRequest | SopCompactClarificationResult> {
    const request = await this.buildClarificationRequest(runId, round, maxRounds, compactResult);
    if (request) {
      if (round > maxRounds) {
        return {
          kind: "clarification_result",
          runId,
          runDir: request.runDir,
          status: "needs_clarification",
          exitReason: "round_limit_reached",
          round: round - 1,
          maxRounds,
          replayReady: false,
          remainingBlockingKeys: request.remainingBlockingKeys,
          answeredQuestionIds: [],
          skippedQuestionIds: [],
          intentResolutionPath: request.intentResolutionPath,
          compactResult,
          clarificationRequest: request,
        };
      }
      return request;
    }

    const runDir = this.resolveRunDir(runId);
    const executionGuide = await this.readExecutionGuide(runDir);
    const intentResolutionPath = await this.resolveExistingIntentResolution(runDir);
    if (executionGuide.status === "ready_for_replay" && executionGuide.replayReady) {
      return {
        kind: "clarification_result",
        runId,
        runDir,
        status: "ready_for_replay",
        exitReason: "resolved",
        round: Math.max(1, round - 1),
        maxRounds,
        replayReady: true,
        remainingBlockingKeys: [],
        answeredQuestionIds: [],
        skippedQuestionIds: [],
        intentResolutionPath,
        compactResult,
      };
    }

    return this.buildFailedResult({
      runId,
      round: Math.max(1, round - 1),
      maxRounds,
      intentResolutionPath,
      compactResult,
      errorSummary: `compact status is ${executionGuide.status}; clarification loop cannot continue.`,
    });
  }

  private async buildClarificationRequest(
    runId: string,
    round: number,
    maxRounds: number,
    compactResult?: SopCompactResult
  ): Promise<SopCompactClarificationRequest | undefined> {
    const runDir = this.resolveRunDir(runId);
    const executionGuide = await this.readExecutionGuide(runDir);
    if (executionGuide.status !== "needs_clarification") {
      return undefined;
    }
    const clarificationQuestions = await this.readClarificationQuestions(runDir);
    const intentResolutionPath = await this.resolveExistingIntentResolution(runDir);
    const questions = this.mergeQuestions(
      executionGuide.detailContext.unresolvedQuestions,
      clarificationQuestions?.questions ?? []
    );
    return {
      kind: "clarification_request",
      runId,
      runDir,
      status: "needs_clarification",
      round,
      maxRounds,
      questions,
      remainingBlockingKeys: questions.map((item) => item.sourceKey),
      intentResolutionPath,
      compactResult,
    };
  }

  private mergeQuestions(
    unresolvedQuestions: ExecutionGuideUnresolvedQuestion[],
    clarificationQuestions: ClarificationQuestionV1[]
  ): SopCompactClarificationQuestion[] {
    const phrasingByField = new Map<string, ClarificationQuestionV1>();
    for (const question of clarificationQuestions) {
      if (!question.targetsSemanticField || phrasingByField.has(question.targetsSemanticField)) {
        continue;
      }
      phrasingByField.set(question.targetsSemanticField, question);
    }
    const seenFields = new Set<string>();
    const usedIds = new Set<string>();
    const merged: SopCompactClarificationQuestion[] = [];
    for (const unresolved of unresolvedQuestions) {
      if (!unresolved.field || seenFields.has(unresolved.field)) {
        continue;
      }
      seenFields.add(unresolved.field);
      const phrasing = phrasingByField.get(unresolved.field);
      const prompt = phrasing?.question?.trim() || unresolved.question?.trim() || unresolved.reason.trim();
      const baseId = phrasing?.id?.trim() || `clarify_${this.slugify(unresolved.field)}`;
      merged.push({
        questionId: this.makeUniqueQuestionId(baseId, usedIds),
        prompt,
        reason: unresolved.reason.trim(),
        priority: unresolved.priority ?? phrasing?.priority ?? this.priorityFromSeverity(unresolved.severity),
        sourceKey: unresolved.field,
      });
    }
    return merged;
  }

  private normalizeAnswerDecision(answer: SopCompactClarificationAnswer): "answer" | "skip" | "defer" {
    if (answer.decision === "skip" || answer.decision === "defer") {
      return answer.decision;
    }
    return answer.answer?.trim() ? "answer" : "skip";
  }

  private priorityFromSeverity(severity: ExecutionGuideUnresolvedQuestion["severity"]): ClarificationPriority {
    return severity === "high" ? "high" : "medium";
  }

  private makeUniqueQuestionId(baseId: string, usedIds: Set<string>): string {
    let candidate = baseId;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${baseId}_${suffix}`;
      suffix += 1;
    }
    usedIds.add(candidate);
    return candidate;
  }

  private slugify(value: string): string {
    return value
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
  }

  private async compact(runId: string): Promise<SopCompactResult> {
    return new SopCompactService(this.artifactsDir, {
      semantic: this.semanticOptions,
    }).compact(runId);
  }

  private async writeIntentResolution(
    runId: string,
    resolvedFields: Record<string, string>,
    notes: string[]
  ): Promise<string> {
    const runDir = this.resolveRunDir(runId);
    const previousResolution = await this.readIntentResolution(runDir);
    const intentResolution: IntentResolution = {
      schemaVersion: "intent_resolution.v0",
      resolvedFields: {
        ...(previousResolution?.resolvedFields ?? {}),
        ...resolvedFields,
      },
      notes: [...(previousResolution?.notes ?? []), ...notes],
      resolvedAt: new Date().toISOString(),
    };
    const intentResolutionPath = path.join(runDir, "intent_resolution.json");
    await writeFile(intentResolutionPath, `${JSON.stringify(intentResolution, null, 2)}\n`, "utf-8");
    return intentResolutionPath;
  }

  private buildFailedResult(input: {
    runId: string;
    round: number;
    maxRounds: number;
    answeredQuestionIds?: string[];
    skippedQuestionIds?: string[];
    deferredQuestionId?: string;
    intentResolutionPath?: string;
    compactResult?: SopCompactResult;
    errorSummary: string;
  }): SopCompactClarificationResult {
    return {
      kind: "clarification_result",
      runId: input.runId,
      runDir: this.resolveRunDir(input.runId),
      status: "recompile_failed",
      exitReason: "recompile_error",
      round: input.round,
      maxRounds: input.maxRounds,
      replayReady: false,
      remainingBlockingKeys: [],
      answeredQuestionIds: input.answeredQuestionIds ?? [],
      skippedQuestionIds: input.skippedQuestionIds ?? [],
      deferredQuestionId: input.deferredQuestionId,
      intentResolutionPath: input.intentResolutionPath,
      compactResult: input.compactResult,
      errorSummary: input.errorSummary,
    };
  }

  private formatError(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message.trim();
    }
    return "unknown clarification error";
  }

  private resolveRunDir(runId: string): string {
    return path.join(this.artifactsDir, runId);
  }

  private async readExecutionGuide(runDir: string): Promise<ExecutionGuideV1> {
    const raw = await readFile(path.join(runDir, "execution_guide.json"), "utf-8");
    return JSON.parse(raw) as ExecutionGuideV1;
  }

  private async readClarificationQuestions(runDir: string): Promise<ClarificationQuestionsV1 | undefined> {
    try {
      const raw = await readFile(path.join(runDir, "clarification_questions.json"), "utf-8");
      return JSON.parse(raw) as ClarificationQuestionsV1;
    } catch {
      return undefined;
    }
  }

  private async readIntentResolution(runDir: string): Promise<IntentResolution | undefined> {
    try {
      const raw = await readFile(path.join(runDir, "intent_resolution.json"), "utf-8");
      return JSON.parse(raw) as IntentResolution;
    } catch {
      return undefined;
    }
  }

  private async resolveExistingIntentResolution(runDir: string): Promise<string | undefined> {
    try {
      await readFile(path.join(runDir, "intent_resolution.json"), "utf-8");
      return path.join(runDir, "intent_resolution.json");
    } catch {
      return undefined;
    }
  }
}
