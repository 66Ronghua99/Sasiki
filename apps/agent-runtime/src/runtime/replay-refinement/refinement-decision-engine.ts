/**
 * Deps: contracts/logger.ts, core/json-model-client.ts, domain/refinement-knowledge.ts, runtime/replay-refinement/*
 * Used By: runtime/replay-refinement/online-refinement-run-executor.ts
 * Last Updated: 2026-03-13
 */
import type { Logger } from "../../contracts/logger.js";
import { JsonModelClient } from "../../core/json-model-client.js";
import type { RefinementKnowledgeType } from "../../domain/refinement-knowledge.js";
import type { BrowserOperatorTurnResult } from "./browser-operator-gateway.js";
import type {
  RefinementDecisionEngine,
  RefinementEvaluateResult,
  RefinementPromoteResult,
} from "./online-refinement-orchestrator.js";

const EVALUATE_OUTCOME_VALUES = ["progress", "no_progress", "page_changed", "info_only", "blocked"] as const;
const EVALUATE_RELEVANCE_VALUES = ["task_relevant", "task_irrelevant", "unknown"] as const;
const PROMOTE_DECISION_VALUES = ["promote", "hold"] as const;
const PROMOTE_CONFIDENCE_VALUES = ["high", "medium", "low"] as const;
const KNOWLEDGE_TYPE_VALUES = [
  "element_affordance",
  "branch_guard",
  "completion_signal",
  "recovery_rule",
  "noise_pattern",
] as const;

const EVALUATE_SYSTEM_PROMPT = `
你是 replay-refinement 的评估代理。你只输出一个 JSON object，不要输出 markdown 或解释文本。

目标：
1) 判断当前工具调用是否推动任务（outcome）。
2) 判断与任务相关性（relevance）。
3) 判断是否需要人工介入（hitlNeeded/hitlQuestion）。
4) 提取候选可复用知识（candidateKnowledge）。

约束：
- 适配通用网页任务，不允许写死站点规则。
- 信息不足时，优先保守：relevance="unknown"，outcome 可用 "no_progress"。
- candidateKnowledge 仅保留通用可复用经验，避免页面一次性细节。

输出 schema（必须完整）：
{
  "schemaVersion": "refine_evaluate.v0",
  "assistantIntent": "string",
  "outcome": "progress|no_progress|page_changed|info_only|blocked",
  "relevance": "task_relevant|task_irrelevant|unknown",
  "why": "string",
  "hitlNeeded": true,
  "hitlQuestion": "string|null",
  "candidateKnowledge": [
    {
      "knowledgeType": "element_affordance|branch_guard|completion_signal|recovery_rule|noise_pattern",
      "instruction": "string",
      "surfaceKey": "string",
      "taskKey": "string"
    }
  ]
}
`.trim();

const CRITIC_SYSTEM_PROMPT = `
你是 replay-refinement 的 critic。你只输出一个 JSON object，不要输出 markdown 或解释文本。

目标：
- 审查候选知识与晋升理由，提出最关键的反例与风险。
- 重点找过拟合、短期偶然性、与任务目标不一致的问题。

输出 schema：
{
  "schemaVersion": "refine_critic.v0",
  "challenges": [
    {
      "targetInstruction": "string",
      "risk": "string",
      "counterExample": "string"
    }
  ]
}
`.trim();

const FINALIZE_SYSTEM_PROMPT = `
你是 replay-refinement 的最终决策代理。你只输出一个 JSON object，不要输出 markdown 或解释文本。

目标：
- 综合 evaluate 结果与 critic 挑战，输出最终晋升决策。
- 信息不足时采用保守策略：promoteDecision="hold"，confidence="low"。

输出 schema：
{
  "schemaVersion": "refine_finalize.v0",
  "promoteDecision": "promote|hold",
  "confidence": "high|medium|low",
  "rationale": "string",
  "finalKnowledge": [
    {
      "knowledgeType": "element_affordance|branch_guard|completion_signal|recovery_rule|noise_pattern",
      "surfaceKey": "string",
      "taskKey": "string",
      "instruction": "string"
    }
  ]
}
`.trim();

type EvaluateOutcome = RefinementEvaluateResult["outcome"];
type EvaluateRelevance = RefinementEvaluateResult["relevance"];
type PromoteDecision = RefinementPromoteResult["promoteDecision"];
type PromoteConfidence = RefinementPromoteResult["confidence"];

interface RefineEvaluatePayload extends Record<string, unknown> {
  schemaVersion?: unknown;
  assistantIntent?: unknown;
  outcome?: unknown;
  relevance?: unknown;
  why?: unknown;
  hitlNeeded?: unknown;
  hitlQuestion?: unknown;
  candidateKnowledge?: unknown;
}

interface RefineCriticPayload extends Record<string, unknown> {
  schemaVersion?: unknown;
  challenges?: unknown;
}

interface RefineFinalizePayload extends Record<string, unknown> {
  schemaVersion?: unknown;
  promoteDecision?: unknown;
  confidence?: unknown;
  rationale?: unknown;
  finalKnowledge?: unknown;
}

interface DecisionModelTrace {
  model: string;
  provider: string;
  stopReason: string;
  rawText: string;
}

export interface RefinementKnowledgeCandidate {
  knowledgeType: RefinementKnowledgeType;
  surfaceKey: string;
  taskKey: string;
  instruction: string;
}

export interface DecisionEvaluateAudit {
  result: RefinementEvaluateResult;
  rationale: string;
  candidateKnowledge: RefinementKnowledgeCandidate[];
  fallbackUsed: boolean;
  modelTrace?: DecisionModelTrace;
}

export interface DecisionPromoteAudit {
  result: RefinementPromoteResult;
  finalKnowledge: RefinementKnowledgeCandidate[];
  fallbackUsed: boolean;
  modelTrace?: DecisionModelTrace;
}

export interface RefinementDecisionAudit {
  toolCallId: string;
  pageId: string;
  toolName: string;
  evaluate?: DecisionEvaluateAudit;
  criticChallenge: string[];
  promote?: DecisionPromoteAudit;
  updatedAt: string;
}

export interface RefinementDecisionEngineOptions {
  logger: Logger;
  modelClient: JsonModelClient;
  maxExcerptChars?: number;
}

export class DefaultRefinementDecisionEngine implements RefinementDecisionEngine {
  private readonly logger: Logger;
  private readonly modelClient: JsonModelClient;
  private readonly maxExcerptChars: number;
  private readonly auditByToolCallId = new Map<string, RefinementDecisionAudit>();
  private readonly auditOrder: string[] = [];

  constructor(options: RefinementDecisionEngineOptions) {
    this.logger = options.logger;
    this.modelClient = options.modelClient;
    this.maxExcerptChars = options.maxExcerptChars ?? 1200;
  }

  async evaluate(turn: BrowserOperatorTurnResult): Promise<RefinementEvaluateResult> {
    const audit = this.ensureAudit(turn);
    const fallback = this.buildEvaluateFallback(turn, "evaluate llm unavailable");

    try {
      const response = await this.modelClient.completeObject<RefineEvaluatePayload>(
        EVALUATE_SYSTEM_PROMPT,
        this.buildEvaluateUserPrompt(turn)
      );

      const normalized = this.normalizeEvaluatePayload(response.payload, turn);
      const result: RefinementEvaluateResult = {
        assistantIntent: normalized.assistantIntent,
        outcome: normalized.outcome,
        relevance: normalized.relevance,
        hitlNeeded: normalized.hitlNeeded,
        hitlQuestion: normalized.hitlQuestion,
      };

      audit.evaluate = {
        result,
        rationale: normalized.why,
        candidateKnowledge: normalized.candidateKnowledge,
        fallbackUsed: false,
        modelTrace: this.toModelTrace(response),
      };
      audit.updatedAt = new Date().toISOString();

      this.logger.info("refinement_decision_evaluate_succeeded", {
        toolCallId: turn.toolCallId,
        outcome: result.outcome,
        relevance: result.relevance,
        hitlNeeded: result.hitlNeeded,
        candidateKnowledgeCount: normalized.candidateKnowledge.length,
      });
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      audit.evaluate = {
        result: fallback.result,
        rationale: reason,
        candidateKnowledge: [],
        fallbackUsed: true,
      };
      audit.updatedAt = new Date().toISOString();
      this.logger.warn("refinement_decision_evaluate_fallback", {
        toolCallId: turn.toolCallId,
        reason,
      });
      return fallback.result;
    }
  }

  async promote(turn: BrowserOperatorTurnResult, evaluation: RefinementEvaluateResult): Promise<RefinementPromoteResult> {
    const audit = this.ensureAudit(turn);
    const candidateKnowledge = audit.evaluate?.candidateKnowledge ?? [];
    const critic = await this.runCriticPass(turn, evaluation, candidateKnowledge);
    audit.criticChallenge = critic.challenges;

    try {
      const response = await this.modelClient.completeObject<RefineFinalizePayload>(
        FINALIZE_SYSTEM_PROMPT,
        this.buildFinalizeUserPrompt(turn, evaluation, candidateKnowledge, critic.challenges)
      );
      const normalized = this.normalizeFinalizePayload(response.payload);
      const result: RefinementPromoteResult = {
        promoteDecision: normalized.promoteDecision,
        confidence: normalized.confidence,
        rationale: normalized.rationale,
      };

      audit.promote = {
        result,
        finalKnowledge: normalized.finalKnowledge,
        fallbackUsed: false,
        modelTrace: this.toModelTrace(response),
      };
      audit.updatedAt = new Date().toISOString();

      this.logger.info("refinement_decision_promote_succeeded", {
        toolCallId: turn.toolCallId,
        promoteDecision: result.promoteDecision,
        confidence: result.confidence,
        criticChallengeCount: critic.challenges.length,
        finalKnowledgeCount: normalized.finalKnowledge.length,
      });
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const fallback = this.buildPromoteFallback(
        critic.challenges.length > 0
          ? `finalize llm unavailable; critic_challenge_present=${critic.challenges.length}; ${reason}`
          : `finalize llm unavailable; ${reason}`
      );
      audit.promote = {
        result: fallback.result,
        finalKnowledge: [],
        fallbackUsed: true,
      };
      audit.updatedAt = new Date().toISOString();

      this.logger.warn("refinement_decision_promote_fallback", {
        toolCallId: turn.toolCallId,
        reason,
        criticChallengeCount: critic.challenges.length,
      });
      return fallback.result;
    }
  }

  getDecisionAudit(toolCallId: string): RefinementDecisionAudit | undefined {
    const existing = this.auditByToolCallId.get(toolCallId.trim());
    if (!existing) {
      return undefined;
    }
    return this.cloneAudit(existing);
  }

  listDecisionAudits(): RefinementDecisionAudit[] {
    return this.auditOrder
      .map((toolCallId) => this.auditByToolCallId.get(toolCallId))
      .filter((item): item is RefinementDecisionAudit => Boolean(item))
      .map((item) => this.cloneAudit(item));
  }

  private async runCriticPass(
    turn: BrowserOperatorTurnResult,
    evaluation: RefinementEvaluateResult,
    candidateKnowledge: RefinementKnowledgeCandidate[]
  ): Promise<{ challenges: string[] }> {
    try {
      const response = await this.modelClient.completeObject<RefineCriticPayload>(
        CRITIC_SYSTEM_PROMPT,
        this.buildCriticUserPrompt(turn, evaluation, candidateKnowledge)
      );
      return {
        challenges: this.normalizeCriticChallenges(response.payload.challenges),
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn("refinement_decision_critic_fallback", {
        toolCallId: turn.toolCallId,
        reason,
      });
      return { challenges: [] };
    }
  }

  private buildEvaluateUserPrompt(turn: BrowserOperatorTurnResult): string {
    const observation = this.toPromptTurn(turn);
    return [
      "请基于以下工具调用观测输出结构化评估。",
      "输入：",
      JSON.stringify(
        {
          schemaVersion: "refine_evaluate_input.v0",
          turn: observation,
        },
        null,
        2
      ),
    ].join("\n");
  }

  private buildCriticUserPrompt(
    turn: BrowserOperatorTurnResult,
    evaluation: RefinementEvaluateResult,
    candidateKnowledge: RefinementKnowledgeCandidate[]
  ): string {
    return [
      "请对本轮候选知识与推进判断做风险挑战。",
      "输入：",
      JSON.stringify(
        {
          schemaVersion: "refine_critic_input.v0",
          turn: this.toPromptTurn(turn),
          evaluation,
          candidateKnowledge,
        },
        null,
        2
      ),
    ].join("\n");
  }

  private buildFinalizeUserPrompt(
    turn: BrowserOperatorTurnResult,
    evaluation: RefinementEvaluateResult,
    candidateKnowledge: RefinementKnowledgeCandidate[],
    criticChallenge: string[]
  ): string {
    return [
      "请综合评估与挑战，给出最终 promote/hold 决策。",
      "输入：",
      JSON.stringify(
        {
          schemaVersion: "refine_finalize_input.v0",
          turn: this.toPromptTurn(turn),
          evaluation,
          candidateKnowledge,
          criticChallenge,
        },
        null,
        2
      ),
    ].join("\n");
  }

  private toPromptTurn(turn: BrowserOperatorTurnResult): Record<string, unknown> {
    const toolArgs = JSON.stringify(turn.toolArgs);
    return {
      pageId: turn.pageId,
      toolCallId: turn.toolCallId,
      toolName: turn.toolName,
      toolArgs: this.truncateText(toolArgs, this.maxExcerptChars),
      resultExcerpt: this.truncateText(turn.resultExcerpt, this.maxExcerptChars),
      outcomeHint: turn.outcome,
      beforeSnapshot: {
        summary: this.truncateText(turn.beforeSnapshot?.summary, 400),
        snapshotId: turn.beforeSnapshot?.snapshotId ?? "",
        snapshotHash: turn.beforeSnapshot?.snapshotHash ?? "",
      },
      afterSnapshot: {
        summary: this.truncateText(turn.afterSnapshot?.summary, 400),
        snapshotId: turn.afterSnapshot?.snapshotId ?? "",
        snapshotHash: turn.afterSnapshot?.snapshotHash ?? "",
      },
      elementHints: turn.elementHints ?? {},
      humanInterventionNote: Array.isArray(turn.humanInterventionNote) ? turn.humanInterventionNote : [],
    };
  }

  private normalizeEvaluatePayload(
    payload: RefineEvaluatePayload,
    turn: BrowserOperatorTurnResult
  ): {
    assistantIntent: string;
    outcome: EvaluateOutcome;
    relevance: EvaluateRelevance;
    why: string;
    hitlNeeded: boolean;
    hitlQuestion?: string;
    candidateKnowledge: RefinementKnowledgeCandidate[];
  } {
    const assistantIntent = this.readString(payload.assistantIntent) ?? `continue_from_${turn.toolName}`;
    const outcome = this.readEnum<EvaluateOutcome>(payload.outcome, EVALUATE_OUTCOME_VALUES, turn.outcome);
    const relevance = this.readEnum<EvaluateRelevance>(payload.relevance, EVALUATE_RELEVANCE_VALUES, "unknown");
    const why = this.readString(payload.why) ?? "";
    const candidateKnowledge = this.normalizeKnowledgeCandidates(payload.candidateKnowledge);
    const hitlNeeded =
      typeof payload.hitlNeeded === "boolean"
        ? payload.hitlNeeded
        : outcome === "blocked" || (outcome === "no_progress" && relevance !== "task_irrelevant");
    const hitlQuestion = this.readString(payload.hitlQuestion);

    return {
      assistantIntent,
      outcome,
      relevance,
      why,
      hitlNeeded,
      hitlQuestion,
      candidateKnowledge,
    };
  }

  private normalizeFinalizePayload(payload: RefineFinalizePayload): {
    promoteDecision: PromoteDecision;
    confidence: PromoteConfidence;
    rationale: string;
    finalKnowledge: RefinementKnowledgeCandidate[];
  } {
    const promoteDecision = this.readEnum<PromoteDecision>(payload.promoteDecision, PROMOTE_DECISION_VALUES, "hold");
    const confidence = this.readEnum<PromoteConfidence>(payload.confidence, PROMOTE_CONFIDENCE_VALUES, "low");
    const rationale =
      this.readString(payload.rationale) ??
      (promoteDecision === "promote"
        ? "promote by model final decision"
        : "hold by model final decision due to insufficient confidence");
    const finalKnowledge = this.normalizeKnowledgeCandidates(payload.finalKnowledge);
    return {
      promoteDecision,
      confidence,
      rationale,
      finalKnowledge,
    };
  }

  private normalizeKnowledgeCandidates(raw: unknown): RefinementKnowledgeCandidate[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const accepted = new Set<string>();
    const output: RefinementKnowledgeCandidate[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const record = item as Record<string, unknown>;
      const knowledgeType = this.readEnum<RefinementKnowledgeType>(
        record.knowledgeType,
        KNOWLEDGE_TYPE_VALUES,
        undefined
      );
      const instruction = this.readString(record.instruction);
      if (!knowledgeType || !instruction) {
        continue;
      }
      const surfaceKey = this.readString(record.surfaceKey) ?? "";
      const taskKey = this.readString(record.taskKey) ?? "";
      const identity = `${knowledgeType}|${surfaceKey}|${taskKey}|${instruction.toLowerCase()}`;
      if (accepted.has(identity)) {
        continue;
      }
      accepted.add(identity);
      output.push({
        knowledgeType,
        surfaceKey,
        taskKey,
        instruction,
      });
    }
    return output;
  }

  private normalizeCriticChallenges(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const output: string[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const challenge = item as Record<string, unknown>;
      const target = this.readString(challenge.targetInstruction);
      const risk = this.readString(challenge.risk);
      const counterExample = this.readString(challenge.counterExample);
      const assembled = [target ? `target=${target}` : "", risk ? `risk=${risk}` : "", counterExample ? `counterExample=${counterExample}` : ""]
        .filter(Boolean)
        .join("; ");
      if (!assembled || seen.has(assembled)) {
        continue;
      }
      seen.add(assembled);
      output.push(assembled);
    }
    return output;
  }

  private buildEvaluateFallback(
    turn: BrowserOperatorTurnResult,
    reason: string
  ): {
    result: RefinementEvaluateResult;
    rationale: string;
  } {
    return {
      result: {
        assistantIntent: `recover_after_${turn.toolName}`,
        outcome: "no_progress",
        relevance: "unknown",
        hitlNeeded: false,
      },
      rationale: reason,
    };
  }

  private buildPromoteFallback(reason: string): { result: RefinementPromoteResult } {
    return {
      result: {
        promoteDecision: "hold",
        confidence: "low",
        rationale: reason,
      },
    };
  }

  private ensureAudit(turn: BrowserOperatorTurnResult): RefinementDecisionAudit {
    const existing = this.auditByToolCallId.get(turn.toolCallId);
    if (existing) {
      return existing;
    }
    const created: RefinementDecisionAudit = {
      toolCallId: turn.toolCallId,
      pageId: turn.pageId,
      toolName: turn.toolName,
      criticChallenge: [],
      updatedAt: new Date().toISOString(),
    };
    this.auditByToolCallId.set(turn.toolCallId, created);
    this.auditOrder.push(turn.toolCallId);
    return created;
  }

  private cloneAudit(audit: RefinementDecisionAudit): RefinementDecisionAudit {
    return JSON.parse(JSON.stringify(audit)) as RefinementDecisionAudit;
  }

  private toModelTrace(result: {
    rawText: string;
    model: string;
    provider: string;
    stopReason: string;
  }): DecisionModelTrace {
    return {
      model: result.model,
      provider: result.provider,
      stopReason: result.stopReason,
      rawText: result.rawText,
    };
  }

  private readString(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T;
  private readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback?: T): T | undefined;
  private readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback?: T): T | undefined {
    if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
      return value as T;
    }
    return fallback;
  }

  private truncateText(value: string | undefined, maxChars: number): string {
    if (!value) {
      return "";
    }
    if (value.length <= maxChars) {
      return value;
    }
    return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
  }
}
