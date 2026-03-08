/**
 * Deps: domain/sop-compact-artifacts.ts, domain/sop-trace.ts, runtime/sop-rule-compact-builder.ts
 * Used By: runtime/sop-compact.ts
 * Last Updated: 2026-03-08
 */
import type {
  AbstractionInput,
  AbstractionSignal,
  ClarificationQuestion,
  ClarificationQuestions,
  CompactManifest,
  CompactManifestStatus,
  DecisionModel,
  DecisionRuleEntry,
  ExampleCandidate,
  ExecutionGuide,
  GoalType,
  IntentResolution,
  IntentSeed,
  ObservedExample,
  ObservedExamples,
  RuleConfidence,
  RuleSource,
  TargetEntity,
  UncertainField,
  WorkflowGuide,
  WorkflowGuideStep,
  WorkflowStepKind,
} from "../domain/sop-compact-artifacts.js";
import type {
  BehaviorEvidence,
  BehaviorExampleCandidate,
  BehaviorPrimitive,
  BehaviorStepEvidence,
  BehaviorWorkflow,
  BehaviorWorkflowStep,
} from "../domain/sop-compact-artifacts-v1.js";
import type { SopTrace, SopTraceStep } from "../domain/sop-trace.js";
import type { BuiltCompact } from "./sop-rule-compact-builder.js";
import { serializeCompactHint } from "./sop-rule-compact-builder.js";

interface BuildSopIntentArtifactsInput {
  runId: string;
  trace: SopTrace;
  built: BuiltCompact;
  generatedAt: string;
  intentResolution?: IntentResolution;
  agentDraft?: StructuredAbstractionDraft;
}

export interface StructuredAbstractionDraft {
  workflowGuide?: Partial<WorkflowGuide>;
  decisionModel?: Partial<DecisionModel>;
  observedExamples?: Partial<ObservedExamples>;
  clarificationQuestions?: Partial<ClarificationQuestions>;
}

interface BuildSopIntentArtifactsResult {
  intentSeed: IntentSeed;
  abstractionInput: AbstractionInput;
  workflowGuide: WorkflowGuide;
  workflowGuideMarkdown: string;
  decisionModel: DecisionModel;
  observedExamples: ObservedExamples;
  clarificationQuestions?: ClarificationQuestions;
  executionGuide: ExecutionGuide;
  manifest: CompactManifest;
}

interface BuildBehaviorArtifactsResult {
  behaviorEvidence: BehaviorEvidence;
  behaviorWorkflow: BehaviorWorkflow;
}

const SUBMIT_KEYWORDS = ["submit", "send", "save", "publish", "confirm", "提交", "发送", "保存", "发布", "确认"];
const SEARCH_KEYWORDS = ["search", "filter", "query", "keyword", "搜索", "筛选", "查询"];
const SUCCESS_KEYWORDS = ["success", "completed", "done", "saved", "sent", "成功", "完成", "已发送", "已保存"];
const EXAMPLE_MAX = 8;
const QUESTION_MAX = 5;
const MAX_TEXT = 160;

export class SopIntentAbstractionBuilder {
  buildEvidenceInput(runId: string, trace: SopTrace, built: BuiltCompact, generatedAt: string): {
    intentSeed: IntentSeed;
    abstractionInput: AbstractionInput;
  } {
    const surface = this.inferSurface(trace);
    const intentSeed: IntentSeed = {
      schemaVersion: "intent_seed.v0",
      runId,
      rawTask: trace.taskHint,
      site: trace.site,
      surface,
      capturedAt: generatedAt,
    };
    const abstractionInput = this.buildAbstractionInput(runId, trace, built, intentSeed);
    return { intentSeed, abstractionInput };
  }

  buildBehaviorArtifactsFromEvidence(abstractionInput: AbstractionInput, trace: SopTrace): BuildBehaviorArtifactsResult {
    const behaviorEvidence: BehaviorEvidence = {
      schemaVersion: "behavior_evidence.v1",
      runId: abstractionInput.runId,
      traceId: abstractionInput.traceId,
      site: abstractionInput.site,
      surface: abstractionInput.surface,
      rawTask: abstractionInput.rawTask,
      actionSummary: { ...abstractionInput.actionSummary },
      phaseSignals: abstractionInput.phaseSignals.map((signal) => ({
        id: signal.id,
        primitive: this.toBehaviorPrimitive(signal.kind),
        evidence: [...signal.evidence],
        confidence: signal.confidence,
      })),
      stepEvidence: trace.steps.map((step) => this.toBehaviorStepEvidence(step)),
      exampleCandidates: abstractionInput.exampleCandidates.map((candidate) => this.toBehaviorExampleCandidate(candidate)),
      uncertaintyCues: [...abstractionInput.uncertaintyCues],
    };

    return {
      behaviorEvidence,
      behaviorWorkflow: this.buildBehaviorWorkflow(behaviorEvidence),
    };
  }

  build(input: BuildSopIntentArtifactsInput): BuildSopIntentArtifactsResult {
    const { intentSeed, abstractionInput } = this.buildEvidenceInput(
      input.runId,
      input.trace,
      input.built,
      input.generatedAt
    );
    this.ensureAbstractionInputShape(abstractionInput);

    const agentDraftProvided = Boolean(input.agentDraft);
    const fallback = this.buildFallbackArtifacts(intentSeed, abstractionInput);
    const mergedWorkflowGuideDraft = this.mergeWorkflowGuide(input.agentDraft?.workflowGuide, fallback.workflowGuide, abstractionInput);
    const mergedDecisionModel = this.mergeDecisionModel(input.agentDraft?.decisionModel, fallback.decisionModel, abstractionInput);
    const mergedWorkflowGuide = this.alignWorkflowGuideWithDecisionModel(mergedWorkflowGuideDraft, mergedDecisionModel);
    const mergedObservedExamples = this.mergeObservedExamples(
      input.agentDraft?.observedExamples,
      fallback.observedExamples,
      abstractionInput,
      mergedDecisionModel.targetEntity
    );

    this.applyIntentResolution(mergedDecisionModel, input.intentResolution);

    const clarificationQuestions = this.mergeClarificationQuestions(
      input.agentDraft?.clarificationQuestions,
      mergedDecisionModel,
      input.intentResolution
    );

    const pollutionDetected = this.detectWorkflowGuidePollution(mergedWorkflowGuide, mergedObservedExamples);
    this.ensureQuestionMapping(mergedDecisionModel, clarificationQuestions);

    const status = this.resolveStatus({
      decisionModel: mergedDecisionModel,
      clarificationQuestions,
      pollutionDetected,
      agentDraftProvided,
    });

    const executionGuide = this.buildExecutionGuide(input.runId, mergedWorkflowGuide, mergedDecisionModel, status);
    const manifest: CompactManifest = {
      schemaVersion: "compact_manifest.v0",
      runId: input.runId,
      status,
      artifacts: {
        abstractionInput: "abstraction_input.json",
        workflowGuideJson: "workflow_guide.json",
        workflowGuideMd: "workflow_guide.md",
        decisionModel: "decision_model.json",
        observedExamples: "observed_examples.json",
        clarificationQuestions: clarificationQuestions ? "clarification_questions.json" : null,
        intentResolution: input.intentResolution ? "intent_resolution.json" : null,
        executionGuide: "execution_guide.json",
      },
      quality: {
        highUncertaintyCount: mergedDecisionModel.uncertainFields.filter((field) => field.severity === "high").length,
        mediumUncertaintyCount: mergedDecisionModel.uncertainFields.filter((field) => field.severity === "medium").length,
        lowUncertaintyCount: mergedDecisionModel.uncertainFields.filter((field) => field.severity === "low").length,
        exampleCount: mergedObservedExamples.examples.length,
        pollutionDetected,
      },
    };

    this.ensureDecisionModelShape(mergedDecisionModel);
    this.ensureManifestConsistency(mergedDecisionModel, mergedObservedExamples, manifest);
    this.ensureReplayGate(mergedDecisionModel, manifest.status, pollutionDetected);
    this.ensureExecutionGuideCompile(executionGuide, manifest.status);

    return {
      intentSeed,
      abstractionInput,
      workflowGuide: mergedWorkflowGuide,
      workflowGuideMarkdown: renderWorkflowGuideMarkdown(mergedWorkflowGuide, mergedDecisionModel, manifest),
      decisionModel: mergedDecisionModel,
      observedExamples: mergedObservedExamples,
      clarificationQuestions,
      executionGuide,
      manifest,
    };
  }

  private buildAbstractionInput(
    runId: string,
    trace: SopTrace,
    built: BuiltCompact,
    intentSeed: IntentSeed
  ): AbstractionInput {
    const actionSummary = trace.steps.reduce<Record<string, number>>((summary, step) => {
      summary[step.action] = (summary[step.action] ?? 0) + 1;
      return summary;
    }, {});
    const phaseSignals = this.buildPhaseSignals(trace, built);
    const exampleCandidates = this.buildExampleCandidates(trace);
    const uncertaintyCues = this.buildUncertaintyCues(trace, phaseSignals, exampleCandidates);
    return {
      schemaVersion: "abstraction_input.v0",
      runId,
      traceId: trace.traceId,
      site: trace.site,
      surface: intentSeed.surface,
      rawTask: intentSeed.rawTask,
      highLevelSteps: built.highSteps,
      selectorHints: built.hints.map((hint) => serializeCompactHint(hint)).filter((hint) => hint.length > 0),
      actionSummary,
      phaseSignals,
      exampleCandidates,
      uncertaintyCues,
    };
  }

  private buildBehaviorWorkflow(behaviorEvidence: BehaviorEvidence): BehaviorWorkflow {
    const steps: BehaviorWorkflowStep[] = behaviorEvidence.phaseSignals.map((signal, index) => ({
      id: `behavior_step_${index + 1}`,
      primitive: signal.primitive,
      summary: this.behaviorPrimitiveSummary(signal.primitive),
      evidenceRefs: [signal.id],
    }));
    const branchPoints = behaviorEvidence.phaseSignals
      .filter((signal) => signal.primitive === "switch_context" || signal.primitive === "locate_candidate")
      .map((signal) => signal.id);
    const observedLoops = behaviorEvidence.phaseSignals
      .filter((signal) => signal.primitive === "iterate_collection")
      .map((signal) => signal.id);
    const submitPoints = steps.filter((step) => step.primitive === "submit_action").map((step) => step.id);
    const verificationPoints = steps.filter((step) => step.primitive === "verify_outcome").map((step) => step.id);

    return {
      schemaVersion: "behavior_workflow.v1",
      steps,
      branchPoints,
      observedLoops,
      submitPoints,
      verificationPoints,
    };
  }

  private buildPhaseSignals(trace: SopTrace, built: BuiltCompact): AbstractionSignal[] {
    const signals: AbstractionSignal[] = [];
    const pushSignal = (kind: AbstractionSignal["kind"], evidence: string[], confidence: RuleConfidence): void => {
      if (evidence.length === 0 || signals.some((signal) => signal.kind === kind)) {
        return;
      }
      signals.push({ id: `signal_${signals.length + 1}_${kind}`, kind, evidence, confidence });
    };

    const tabIds = new Set(trace.steps.map((step) => step.tabId || "tab-unknown"));
    const navigations = trace.steps.filter((step) => step.action === "navigate");
    pushSignal(
      "open_surface",
      navigations.slice(0, 2).map((step) => `navigate:${this.clip(step.target.value)}`),
      navigations.length > 0 ? "high" : "low"
    );

    if (tabIds.size > 1 || built.highSteps.some((step) => step.startsWith("切换到 "))) {
      pushSignal("switch_context", Array.from(tabIds).map((tabId) => `tab:${tabId}`), "high");
    }

    const locateEvidence = trace.steps
      .filter((step) => step.action === "type" && this.looksLikeLocateTarget(step))
      .slice(0, 3)
      .map((step) => this.describeStepEvidence(step));
    pushSignal("locate_object", locateEvidence, locateEvidence.length > 0 ? "medium" : "low");

    const clickTargets = trace.steps.filter((step) => step.action === "click").map((step) => this.describeStepEvidence(step));
    if (clickTargets.length >= 2 || (actionCount(trace, "scroll") > 0 && clickTargets.length > 0)) {
      pushSignal("iterate_collection", clickTargets.slice(0, 3), clickTargets.length >= 3 ? "high" : "medium");
    }

    const inspectEvidence = trace.steps
      .filter((step) => step.action === "click" && !this.isSubmitLikeStep(step))
      .slice(0, 3)
      .map((step) => this.describeStepEvidence(step));
    pushSignal("inspect_object", inspectEvidence, inspectEvidence.length > 0 ? "medium" : "low");

    const editEvidence = trace.steps
      .filter((step) => step.action === "type" && !this.looksLikeLocateTarget(step))
      .slice(0, 3)
      .map((step) => this.describeStepEvidence(step));
    pushSignal("edit_content", editEvidence, editEvidence.length > 0 ? "high" : "low");

    const submitEvidence = trace.steps
      .filter((step) => this.isSubmitLikeStep(step))
      .slice(0, 3)
      .map((step) => this.describeStepEvidence(step));
    pushSignal("submit_action", submitEvidence, submitEvidence.length > 0 ? "high" : "low");

    const verifyEvidence = trace.steps
      .filter((step) => this.hasVerificationCue(step))
      .slice(0, 3)
      .map((step) => this.describeStepEvidence(step));
    if (verifyEvidence.length > 0 || this.hasPostSubmitReview(trace)) {
      pushSignal(
        "verify_outcome",
        verifyEvidence.length > 0 ? verifyEvidence : ["post_submit_review_detected"],
        verifyEvidence.length > 0 ? "medium" : "low"
      );
    }

    return signals;
  }

  private buildExampleCandidates(trace: SopTrace): ExampleCandidate[] {
    const candidates: ExampleCandidate[] = [];
    const seen = new Set<string>();
    const pushCandidate = (candidate: ExampleCandidate): void => {
      const key = `${candidate.type}:${candidate.value}`;
      if (seen.has(key) || candidates.length >= EXAMPLE_MAX) {
        return;
      }
      seen.add(key);
      candidates.push(candidate);
    };

    for (const step of trace.steps) {
      if (step.target.type === "text" && this.isConcreteExampleText(step.target.value)) {
        pushCandidate({
          id: `candidate_${candidates.length + 1}`,
          sourceStepIndex: step.stepIndex,
          type: "target_text",
          value: this.clip(step.target.value),
        });
      }
      if (step.target.type === "selector" && this.isConcreteExampleText(step.target.value)) {
        pushCandidate({
          id: `candidate_${candidates.length + 1}`,
          sourceStepIndex: step.stepIndex,
          type: "selector",
          value: this.clip(step.target.value),
        });
      }
      const textHint = this.readString(step.input.textHint);
      if (textHint && this.isConcreteExampleText(textHint)) {
        pushCandidate({
          id: `candidate_${candidates.length + 1}`,
          sourceStepIndex: step.stepIndex,
          type: "text_hint",
          value: this.clip(textHint),
        });
      }
      const inputValue = this.readString(step.input.value);
      if (inputValue && this.isConcreteExampleText(inputValue)) {
        pushCandidate({
          id: `candidate_${candidates.length + 1}`,
          sourceStepIndex: step.stepIndex,
          type: "input_value",
          value: this.clip(inputValue),
        });
      }
    }
    return candidates;
  }

  private buildUncertaintyCues(
    trace: SopTrace,
    phaseSignals: AbstractionSignal[],
    exampleCandidates: ExampleCandidate[]
  ): string[] {
    const cues: string[] = [];
    const hasSignal = (kind: AbstractionSignal["kind"]) => phaseSignals.some((signal) => signal.kind === kind);
    if (hasSignal("iterate_collection") && !hasSignal("verify_outcome")) {
      cues.push("collection_done_criteria_unobserved");
    }
    if (hasSignal("edit_content") && !hasSignal("submit_action")) {
      cues.push("submit_action_unobserved");
    }
    if (hasSignal("submit_action") && !hasSignal("verify_outcome")) {
      cues.push("success_signal_unobserved");
    }
    if (exampleCandidates.length > 0) {
      cues.push("example_pollution_risk");
    }
    if (new Set(trace.steps.map((step) => step.tabId)).size > 1) {
      cues.push("multi_context_present");
    }
    return cues;
  }

  private buildFallbackArtifacts(intentSeed: IntentSeed, abstractionInput: AbstractionInput): {
    workflowGuide: WorkflowGuide;
    decisionModel: DecisionModel;
    observedExamples: ObservedExamples;
  } {
    const goalType = this.deriveGoalType(abstractionInput);
    const targetEntity: TargetEntity = "generic_page_object";
    const workflowGuide = this.buildFallbackWorkflowGuide(intentSeed, abstractionInput, goalType, targetEntity);
    const decisionModel = this.buildFallbackDecisionModel(abstractionInput, goalType, targetEntity);
    const observedExamples = this.buildFallbackObservedExamples(abstractionInput, targetEntity);
    return { workflowGuide, decisionModel, observedExamples };
  }

  private mergeWorkflowGuide(
    draft: Partial<WorkflowGuide> | undefined,
    fallback: WorkflowGuide,
    abstractionInput: AbstractionInput
  ): WorkflowGuide {
    const pollutedValues = new Set(abstractionInput.exampleCandidates.map((candidate) => candidate.value.toLowerCase()));
    const chooseText = (candidate: unknown, fallbackValue: string): string => {
      if (typeof candidate !== "string") {
        return fallbackValue;
      }
      const text = candidate.trim();
      if (!text) {
        return fallbackValue;
      }
      const lowered = text.toLowerCase();
      for (const polluted of pollutedValues) {
        if (polluted.length >= 6 && lowered.includes(polluted)) {
          return fallbackValue;
        }
      }
      return text;
    };
    const draftSteps = this.toArray((draft as { steps?: unknown } | undefined)?.steps);
    const normalizeSteps = draftSteps.length > 0
      ? draftSteps
          .map((step, index) => {
            if (typeof step === "string" && step.trim()) {
              const summary = chooseText(step, fallback.steps[Math.min(index, fallback.steps.length - 1)]?.summary ?? "执行目标步骤");
              const kind = this.normalizeWorkflowStepKind(undefined, summary, fallback.steps[Math.min(index, fallback.steps.length - 1)]?.kind);
              if (!kind || !summary) {
                return undefined;
              }
              return { id: `step_${index + 1}`, kind, summary } satisfies WorkflowGuideStep;
            }
            if (!step || typeof step !== "object") {
              return undefined;
            }
            const summary = chooseText(
              (step as { summary?: unknown }).summary,
              fallback.steps[Math.min(index, fallback.steps.length - 1)]?.summary ?? "执行目标步骤"
            );
            const kind = this.normalizeWorkflowStepKind(
              (step as { kind?: unknown }).kind,
              summary,
              fallback.steps[Math.min(index, fallback.steps.length - 1)]?.kind
            );
            if (!kind || !summary) {
              return undefined;
            }
            return { id: `step_${index + 1}`, kind, summary } satisfies WorkflowGuideStep;
          })
          .filter((step): step is WorkflowGuideStep => Boolean(step))
      : [];

    return {
      schemaVersion: "workflow_guide.v0",
      taskName: chooseText(draft?.taskName, fallback.taskName),
      goal: chooseText(draft?.goal, fallback.goal),
      scope: {
        site: fallback.scope.site,
        surface: fallback.scope.surface,
        targetCollection:
          typeof draft?.scope === "object" && draft.scope && typeof draft.scope.targetCollection === "string"
            ? draft.scope.targetCollection.trim() || fallback.scope.targetCollection
            : fallback.scope.targetCollection,
      },
      preconditions: this.normalizeStringArray(draft?.preconditions, fallback.preconditions),
      steps: normalizeSteps.length > 0 ? normalizeSteps : fallback.steps,
      completionSignals: this.normalizeStringArray(draft?.completionSignals, fallback.completionSignals),
    };
  }

  private mergeDecisionModel(
    draft: Partial<DecisionModel> | undefined,
    fallback: DecisionModel,
    abstractionInput: AbstractionInput
  ): DecisionModel {
    const goalType = this.resolveGoalType(draft?.goalType, abstractionInput, fallback.goalType);
    const targetEntity = this.isTargetEntity(draft?.targetEntity) ? draft.targetEntity : fallback.targetEntity;
    const normalizeRules = (
      rows: unknown,
      fallbackRows: DecisionRuleEntry[],
      mode: "rule" | "condition"
    ): DecisionRuleEntry[] => {
      if (!Array.isArray(rows)) {
        return fallbackRows;
      }
      const normalized = rows
        .map((row, index) => this.normalizeRule(row, fallbackRows[Math.min(index, fallbackRows.length - 1)], mode))
        .filter((row): row is DecisionRuleEntry => Boolean(row));
      const deduped = this.deduplicateRules(normalized);
      return deduped.length > 0 ? deduped : fallbackRows;
    };
    const uncertainFields = this.normalizeUncertainFields(draft?.uncertainFields, fallback.uncertainFields, abstractionInput, goalType);
    return {
      schemaVersion: "decision_model.v0",
      goalType,
      targetEntity,
      selectionRules: normalizeRules(draft?.selectionRules, fallback.selectionRules, "rule"),
      decisionRules: normalizeRules(draft?.decisionRules, fallback.decisionRules, "condition"),
      doneCriteria: normalizeRules(draft?.doneCriteria, fallback.doneCriteria, "rule"),
      uncertainFields,
    };
  }

  private mergeObservedExamples(
    draft: Partial<ObservedExamples> | undefined,
    fallback: ObservedExamples,
    abstractionInput: AbstractionInput,
    targetEntity: TargetEntity
  ): ObservedExamples {
    const examples: ObservedExample[] = [];
    const seen = new Set<string>();
    const pushExample = (example: ObservedExample): void => {
      const key = JSON.stringify(example);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      examples.push(example);
    };
    const draftExamples = this.toArray((draft as { examples?: unknown } | undefined)?.examples);
    if (draftExamples.length > 0) {
      for (const raw of draftExamples) {
        if (!raw || typeof raw !== "object") {
          if (typeof raw === "string" && raw.trim()) {
            pushExample({
              id: `example_${examples.length + 1}`,
              entityType: targetEntity,
              observedSignals: {},
              observedAction: { description: raw.trim() },
              exampleOnly: true,
            });
          }
          continue;
        }
        const observedSignals = this.normalizeStringRecord((raw as { observedSignals?: unknown }).observedSignals);
        const observedAction: Record<string, string> = {
          ...this.normalizeStringRecord((raw as { observedAction?: unknown }).observedAction),
        };
        const rawDescription = (raw as { description?: unknown }).description;
        const rawEvidenceSource = (raw as { evidenceSource?: unknown }).evidenceSource;
        const description = typeof rawDescription === "string" ? rawDescription.trim() : "";
        const evidenceSource = typeof rawEvidenceSource === "string" ? rawEvidenceSource.trim() : "";
        if (description) {
          observedAction.description = description;
        }
        if (evidenceSource) {
          observedAction.evidenceSource = evidenceSource;
        }
        if (Object.keys(observedSignals).length === 0 && Object.keys(observedAction).length === 0) {
          continue;
        }
        pushExample({
          id: typeof (raw as { id?: unknown }).id === "string" ? (raw as { id: string }).id : `example_${examples.length + 1}`,
          entityType: this.isTargetEntity((raw as { entityType?: unknown }).entityType)
            ? (raw as { entityType: TargetEntity }).entityType
            : targetEntity,
          observedSignals,
          observedAction,
          exampleOnly: true,
        });
      }
    }
    for (const fallbackExample of fallback.examples) {
      pushExample(fallbackExample);
    }
    if (examples.length === 0) {
      for (const candidate of abstractionInput.exampleCandidates.slice(0, 3)) {
        pushExample({
          id: `example_${examples.length + 1}`,
          entityType: targetEntity,
          observedSignals: { [candidate.type]: candidate.value },
          observedAction: {},
          exampleOnly: true,
        });
      }
    }
    return {
      schemaVersion: "observed_examples.v0",
      examples: examples.slice(0, EXAMPLE_MAX),
      antiPromotionRules: fallback.antiPromotionRules,
    };
  }

  private mergeClarificationQuestions(
    draft: Partial<ClarificationQuestions> | undefined,
    decisionModel: DecisionModel,
    intentResolution?: IntentResolution
  ): ClarificationQuestions | undefined {
    const unresolved = new Set(decisionModel.uncertainFields.map((field) => field.field));
    const resolvedFields = new Set(Object.keys(intentResolution?.resolvedFields ?? {}));
    const blockingFields = decisionModel.uncertainFields.filter((field) => this.isBlockingUncertainty(decisionModel.goalType, field));

    const questions: ClarificationQuestion[] = [];
    const seen = new Set<string>();
    const pushQuestion = (question: ClarificationQuestion): void => {
      if (seen.has(question.targetsField) || !unresolved.has(question.targetsField) || resolvedFields.has(question.targetsField)) {
        return;
      }
      seen.add(question.targetsField);
      questions.push(question);
    };

    const draftQuestions = this.toArray((draft as { questions?: unknown } | undefined)?.questions);
    if (draftQuestions.length > 0) {
      for (const raw of draftQuestions) {
        if (!raw || typeof raw !== "object") {
          if (typeof raw === "string" && raw.trim()) {
            const targetField = blockingFields.find(
              (field) => !seen.has(field.field) && unresolved.has(field.field) && !resolvedFields.has(field.field)
            );
            if (!targetField) {
              continue;
            }
            pushQuestion({
              id: `q_${questions.length + 1}`,
              topic: this.clarificationTemplate(targetField.field).topic,
              question: raw.trim(),
              targetsField: targetField.field,
              priority: targetField.severity === "high" ? "high" : "medium",
            });
          }
          continue;
        }
        const target = typeof (raw as { targetsField?: unknown }).targetsField === "string" ? (raw as { targetsField: string }).targetsField : "";
        const question = typeof (raw as { question?: unknown }).question === "string" ? (raw as { question: string }).question.trim() : "";
        const topic = typeof (raw as { topic?: unknown }).topic === "string" ? (raw as { topic: string }).topic.trim() : "intent";
        const priority = (raw as { priority?: unknown }).priority === "high" ? "high" : "medium";
        if (!target || !question) {
          continue;
        }
        pushQuestion({
          id: typeof (raw as { id?: unknown }).id === "string" ? (raw as { id: string }).id : `q_${questions.length + 1}`,
          topic,
          question,
          targetsField: target,
          priority,
        });
      }
    }

    for (const field of blockingFields) {
      pushQuestion(this.buildClarificationQuestion(field, questions.length + 1));
    }

    if (questions.length === 0) {
      return undefined;
    }
    return { schemaVersion: "clarification_questions.v0", questions: questions.slice(0, QUESTION_MAX) };
  }

  private buildFallbackWorkflowGuide(
    intentSeed: IntentSeed,
    abstractionInput: AbstractionInput,
    goalType: GoalType,
    targetEntity: TargetEntity
  ): WorkflowGuide {
    const signalOrder = abstractionInput.phaseSignals.map((signal) => signal.kind);
    const steps: WorkflowGuideStep[] = [];
    const pushStep = (kind: WorkflowStepKind, summary: string): void => {
      if (steps.some((step) => step.summary === summary)) {
        return;
      }
      steps.push({ id: `step_${steps.length + 1}`, kind, summary });
    };
    for (const kind of signalOrder) {
      switch (kind) {
        case "open_surface":
          pushStep("navigate", "进入目标工作区");
          break;
        case "switch_context":
          pushStep("state_change", "切换到相关上下文或标签页");
          break;
        case "locate_object":
          pushStep("filter", "输入查询或筛选条件以定位目标对象");
          break;
        case "iterate_collection":
          pushStep("iterate_collection", "遍历候选对象集合");
          break;
        case "inspect_object":
          pushStep("decision_gate", "打开并检查当前对象状态");
          break;
        case "edit_content":
          pushStep("state_change", "根据当前对象上下文填写或编辑内容");
          break;
        case "submit_action":
          pushStep("conditional_action", "在需要时执行发送或提交动作");
          break;
        case "verify_outcome":
          pushStep("verification", "回读页面状态并验证任务是否完成");
          break;
      }
    }
    if (steps.length === 0) {
      steps.push({ id: "step_1", kind: "navigate", summary: "进入当前任务对应的工作区" });
      steps.push({ id: "step_2", kind: "decision_gate", summary: "检查页面状态并定位需要处理的对象" });
      steps.push({ id: "step_3", kind: "verification", summary: "确认任务完成信号" });
    }
    return {
      schemaVersion: "workflow_guide.v0",
      taskName: intentSeed.rawTask.trim() || "执行当前浏览器任务",
      goal: `基于当前示教证据完成与任务相关的${this.targetLabel(targetEntity)}处理流程。`,
      scope: {
        site: abstractionInput.site,
        surface: abstractionInput.surface,
        targetCollection: targetEntity,
      },
      preconditions: goalType === "form_submission" || goalType === "multi_step_transaction"
        ? ["已登录目标系统", "当前工作区可正常访问", "关键输入数据已准备完毕"]
        : ["已登录目标系统", "当前工作区可正常访问"],
      steps,
      completionSignals: this.defaultCompletionSignals(goalType, targetEntity, abstractionInput),
    };
  }

  private buildFallbackDecisionModel(
    abstractionInput: AbstractionInput,
    goalType: GoalType,
    targetEntity: TargetEntity
  ): DecisionModel {
    const hasSignal = (kind: AbstractionSignal["kind"]) => abstractionInput.phaseSignals.some((signal) => signal.kind === kind);
    const selectionRules: DecisionRuleEntry[] = [
      this.rule({
        id: "select_target_scope",
        rule: `仅处理当前任务范围内的${this.targetLabel(targetEntity)}`,
        source: "inferred_from_trace",
        confidence: hasSignal("iterate_collection") || hasSignal("locate_object") ? "medium" : "low",
      }),
    ];
    const decisionRules: DecisionRuleEntry[] = [];
    if (hasSignal("inspect_object")) {
      decisionRules.push(
        this.rule({
          id: "inspect_before_action",
          condition: "对象当前状态已被检查",
          action: "再决定是否继续执行动作",
          source: "inferred_from_trace",
          confidence: "medium",
        })
      );
    }
    if (hasSignal("edit_content")) {
      decisionRules.push(
        this.rule({
          id: "content_from_context",
          condition: "需要填写、编辑或回复内容",
          action: "基于当前对象上下文生成内容，不复用示例文本作为规则",
          source: "default_rule",
          confidence: "medium",
        })
      );
    }
    if (hasSignal("submit_action")) {
      decisionRules.push(
        this.rule({
          id: "submit_when_required",
          condition: "页面存在明确发送或提交动作",
          action: "执行发送或提交并等待成功信号",
          source: "inferred_from_trace",
          confidence: "medium",
        })
      );
    }
    if (decisionRules.length === 0) {
      decisionRules.push(
        this.rule({
          id: "inspect_state_before_finish",
          condition: "准备结束任务",
          action: "回读页面状态并确认结果",
          source: "default_rule",
          confidence: "low",
        })
      );
    }

    const doneCriteria: DecisionRuleEntry[] = [
      this.rule({
        id: "result_verified",
        rule: hasSignal("verify_outcome")
          ? "页面已出现与目标一致的结果信号"
          : "需要额外确认什么状态才算真正完成",
        source: hasSignal("verify_outcome") ? "inferred_from_trace" : "uncertain",
        confidence: hasSignal("verify_outcome") ? "medium" : "low",
      }),
    ];
    if (hasSignal("iterate_collection")) {
      doneCriteria.unshift(
        this.rule({
          id: "all_targets_checked",
          rule: `所有目标${this.targetLabel(targetEntity)}都已被检查`,
          source: "inferred_from_trace",
          confidence: "medium",
        })
      );
    }

    const uncertainFields = this.buildFallbackUncertainFields(abstractionInput, goalType);
    return {
      schemaVersion: "decision_model.v0",
      goalType,
      targetEntity,
      selectionRules,
      decisionRules,
      doneCriteria,
      uncertainFields,
    };
  }

  private buildFallbackObservedExamples(abstractionInput: AbstractionInput, targetEntity: TargetEntity): ObservedExamples {
    const examples = abstractionInput.exampleCandidates.slice(0, 4).map((candidate, index) => ({
      id: `example_${index + 1}`,
      entityType: targetEntity,
      observedSignals: { [candidate.type]: candidate.value },
      observedAction: {},
      exampleOnly: true as const,
    }));
    return {
      schemaVersion: "observed_examples.v0",
      examples,
      antiPromotionRules: [
        "具体用户名、消息片段、页面文案只能作为 example，不得直接提升为规则",
        "固定回复或输入文本只能作为 observed example，不得直接作为默认策略",
        "selector/text hint 只作为证据，不直接等于任务目标",
      ],
    };
  }

  private buildFallbackUncertainFields(abstractionInput: AbstractionInput, goalType: GoalType): UncertainField[] {
    const fields: UncertainField[] = [];
    const hasSignal = (kind: AbstractionSignal["kind"]) => abstractionInput.phaseSignals.some((signal) => signal.kind === kind);
    const pushField = (field: string, severity: UncertainField["severity"], reason: string): void => {
      if (!fields.some((item) => item.field === field)) {
        fields.push({ field, severity, reason });
      }
    };
    if (goalType === "collection_processing") {
      pushField("target_scope", "high", "示教显示为集合处理，但目标范围无法仅靠局部示例稳定推出");
      pushField("skip_condition", "high", "示教未稳定说明哪些对象可跳过");
      pushField("done_criteria", "high", "集合任务的完成条件不能只凭页面计数变化判断");
    }
    if (goalType === "search_and_select") {
      pushField("selection_criteria", "high", "示教只能证明存在定位动作，无法稳定推出选择标准");
    }
    if (goalType === "form_submission") {
      pushField("required_field_mapping", "high", "示教未完整说明字段与业务含义的映射");
      pushField("validation_expectation", "high", "示教未完整暴露提交前校验规则");
    }
    if (goalType === "multi_step_transaction") {
      pushField("confirmation_boundary", "high", "交易流程中的关键确认边界未被稳定证明");
    }
    if (hasSignal("edit_content")) {
      pushField("reply_style_policy", "medium", "示教包含输入内容，但无法直接推出内容生成策略是否通用");
    }
    if (hasSignal("edit_content") && !hasSignal("submit_action")) {
      pushField("submit_requirement", "high", "示教包含编辑动作，但未稳定证明是否必须发送或提交");
    }
    if (!hasSignal("verify_outcome")) {
      pushField("done_criteria", "high", "示教未稳定暴露最终完成信号");
    }
    return fields;
  }

  private alignWorkflowGuideWithDecisionModel(workflowGuide: WorkflowGuide, decisionModel: DecisionModel): WorkflowGuide {
    if (workflowGuide.scope.targetCollection === decisionModel.targetEntity) {
      return workflowGuide;
    }
    return {
      ...workflowGuide,
      scope: {
        ...workflowGuide.scope,
        targetCollection: decisionModel.targetEntity,
      },
    };
  }

  private buildExecutionGuide(
    runId: string,
    workflowGuide: WorkflowGuide,
    decisionModel: DecisionModel,
    status: CompactManifestStatus
  ): ExecutionGuide {
    return {
      schemaVersion: "execution_guide.v0",
      runId,
      status,
      replayReady: status === "ready_for_replay",
      goal: workflowGuide.goal,
      scope: {
        ...workflowGuide.scope,
        goalType: decisionModel.goalType,
        targetEntity: decisionModel.targetEntity,
      },
      workflow: workflowGuide.steps,
      decisionRules: decisionModel.decisionRules,
      doneCriteria: decisionModel.doneCriteria,
      allowedAssumptions: this.buildAllowedAssumptions(decisionModel),
      forbiddenOverfittingCues: [
        "不要把 observed_examples 中的具体用户名、文本片段、回复全文当作通用规则",
        "不要把单次示教中的局部页面文案直接当作全局完成条件",
      ],
      unresolvedUncertainties: decisionModel.uncertainFields,
    };
  }

  private buildAllowedAssumptions(decisionModel: DecisionModel): string[] {
    const assumptions = ["仅根据当前页面可见状态和结构化 guide 做决策"];
    if (decisionModel.uncertainFields.some((field) => field.severity === "medium")) {
      assumptions.push("允许在不影响目标范围、完成条件和提交动作的前提下使用保守策略");
    }
    return assumptions;
  }

  private applyIntentResolution(decisionModel: DecisionModel, intentResolution?: IntentResolution): void {
    if (!intentResolution) {
      return;
    }
    const resolvedFields = intentResolution.resolvedFields;
    for (let index = decisionModel.uncertainFields.length - 1; index >= 0; index -= 1) {
      const uncertainField = decisionModel.uncertainFields[index];
      if (!Object.prototype.hasOwnProperty.call(resolvedFields, uncertainField.field)) {
        continue;
      }
      decisionModel.uncertainFields.splice(index, 1);
      if (uncertainField.field === "done_criteria" && decisionModel.doneCriteria.length > 0) {
        decisionModel.doneCriteria[decisionModel.doneCriteria.length - 1] = this.rule({
          id: decisionModel.doneCriteria[decisionModel.doneCriteria.length - 1].id,
          rule: String(resolvedFields[uncertainField.field]),
          source: "human_clarified",
          confidence: "high",
        });
      }
      if (uncertainField.field === "target_scope" && decisionModel.selectionRules.length > 0) {
        decisionModel.selectionRules[0] = this.rule({
          id: decisionModel.selectionRules[0].id,
          rule: String(resolvedFields[uncertainField.field]),
          source: "human_clarified",
          confidence: "high",
        });
      }
      if (uncertainField.field === "reply_style_policy") {
        const rule = decisionModel.decisionRules.find((candidate) => candidate.id === "content_from_context");
        if (rule) {
          rule.action = String(resolvedFields[uncertainField.field]);
          rule.source = "human_clarified";
          rule.confidence = "high";
        }
      }
    }
  }

  private ensureAbstractionInputShape(abstractionInput: AbstractionInput): void {
    if (abstractionInput.highLevelSteps.length === 0 || abstractionInput.phaseSignals.length === 0) {
      throw new Error("abstraction_input_shape_check failed: evidence is missing high-level steps or phase signals");
    }
  }

  private ensureDecisionModelShape(decisionModel: DecisionModel): void {
    if (
      decisionModel.selectionRules.length === 0 ||
      decisionModel.decisionRules.length === 0 ||
      decisionModel.doneCriteria.length === 0
    ) {
      throw new Error("decision_model_shape_check failed: required rule arrays are incomplete");
    }
  }

  private ensureQuestionMapping(
    decisionModel: DecisionModel,
    clarificationQuestions: ClarificationQuestions | undefined
  ): void {
    if (!clarificationQuestions) {
      const hasBlocking = decisionModel.uncertainFields.some((field) => this.isBlockingUncertainty(decisionModel.goalType, field));
      if (hasBlocking) {
        throw new Error("question_mapping_check failed: blocking uncertainty exists but no clarification_questions were generated");
      }
      return;
    }
    const uncertainFieldSet = new Set(decisionModel.uncertainFields.map((field) => field.field));
    for (const question of clarificationQuestions.questions) {
      if (!uncertainFieldSet.has(question.targetsField)) {
        throw new Error(`question_mapping_check failed: missing uncertainField for ${question.targetsField}`);
      }
    }
  }

  private ensureManifestConsistency(
    decisionModel: DecisionModel,
    observedExamples: ObservedExamples,
    manifest: CompactManifest
  ): void {
    const high = decisionModel.uncertainFields.filter((field) => field.severity === "high").length;
    const medium = decisionModel.uncertainFields.filter((field) => field.severity === "medium").length;
    const low = decisionModel.uncertainFields.filter((field) => field.severity === "low").length;
    if (
      manifest.quality.highUncertaintyCount !== high ||
      manifest.quality.mediumUncertaintyCount !== medium ||
      manifest.quality.lowUncertaintyCount !== low ||
      manifest.quality.exampleCount !== observedExamples.examples.length
    ) {
      throw new Error("manifest_consistency_check failed: manifest quality counts do not match source artifacts");
    }
  }

  private ensureReplayGate(
    decisionModel: DecisionModel,
    status: CompactManifestStatus,
    pollutionDetected: boolean
  ): void {
    const hasBlocking = decisionModel.uncertainFields.some((field) => this.isBlockingUncertainty(decisionModel.goalType, field));
    if (status === "ready_for_replay" && (hasBlocking || pollutionDetected)) {
      throw new Error("replay_gate_check failed: manifest status is ready_for_replay but admission rules block replay");
    }
  }

  private ensureExecutionGuideCompile(executionGuide: ExecutionGuide, status: CompactManifestStatus): void {
    if (!executionGuide.goal || executionGuide.workflow.length === 0 || executionGuide.status !== status) {
      throw new Error("execution_guide_compile_check failed: execution guide is incomplete");
    }
  }

  private detectWorkflowGuidePollution(guide: WorkflowGuide, observedExamples: ObservedExamples): boolean {
    const haystack = [guide.taskName, guide.goal, ...guide.preconditions, ...guide.steps.map((step) => step.summary), ...guide.completionSignals]
      .join("\n")
      .toLowerCase();
    return observedExamples.examples.some((example) =>
      [...Object.values(example.observedSignals), ...Object.values(example.observedAction)].some((value) => {
        const normalized = value.trim().toLowerCase();
        return normalized.length >= 6 && haystack.includes(normalized);
      })
    );
  }

  private resolveStatus(input: {
    decisionModel: DecisionModel;
    clarificationQuestions?: ClarificationQuestions;
    pollutionDetected: boolean;
    agentDraftProvided: boolean;
  }): CompactManifestStatus {
    if (input.pollutionDetected) {
      return "rejected";
    }
    const hasBlocking = input.decisionModel.uncertainFields.some((field) => this.isBlockingUncertainty(input.decisionModel.goalType, field));
    if (hasBlocking) {
      return input.clarificationQuestions ? "needs_clarification" : "rejected";
    }
    if (!input.agentDraftProvided) {
      return input.clarificationQuestions ? "needs_clarification" : "rejected";
    }
    return "ready_for_replay";
  }

  private normalizeRule(
    raw: unknown,
    fallback: DecisionRuleEntry | undefined,
    mode: "rule" | "condition"
  ): DecisionRuleEntry | undefined {
    if (typeof raw === "string" && raw.trim()) {
      return mode === "rule"
        ? {
            id: fallback?.id ?? `rule_${Date.now()}`,
            rule: raw.trim(),
            source: "inferred_from_trace",
            confidence: "medium",
          }
        : this.parseDecisionRuleFromText(raw.trim(), fallback);
    }
    if (!raw || typeof raw !== "object") {
      return fallback;
    }
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" && row.id.trim() ? row.id : fallback?.id ?? `rule_${Date.now()}`;
    const source = this.isRuleSource(row.source) ? row.source : fallback?.source ?? "default_rule";
    const confidence = this.isRuleConfidence(row.confidence) ? row.confidence : fallback?.confidence ?? "low";
    if (mode === "rule") {
      const rule = typeof row.rule === "string" && row.rule.trim() ? row.rule.trim() : fallback?.rule;
      if (!rule) {
        return fallback;
      }
      return { id, rule, source, confidence };
    }
    const condition = typeof row.condition === "string" && row.condition.trim() ? row.condition.trim() : fallback?.condition;
    const action = typeof row.action === "string" && row.action.trim() ? row.action.trim() : fallback?.action;
    if (!condition || !action) {
      return fallback;
    }
    return { id, condition, action, source, confidence };
  }

  private parseDecisionRuleFromText(raw: string, fallback: DecisionRuleEntry | undefined): DecisionRuleEntry | undefined {
    const text = raw.trim();
    if (!text) {
      return fallback;
    }
    const matched = text.match(/^(若|如果)(.+?)[，,](.+)$/);
    if (matched) {
      return {
        id: fallback?.id ?? `rule_${Date.now()}`,
        condition: matched[2].trim(),
        action: matched[3].trim(),
        source: "inferred_from_trace",
        confidence: "medium",
      };
    }
    return {
      id: fallback?.id ?? `rule_${Date.now()}`,
      condition: fallback?.condition ?? "满足当前任务策略",
      action: text,
      source: "inferred_from_trace",
      confidence: "medium",
    };
  }

  private normalizeUncertainFields(
    rows: unknown,
    fallback: UncertainField[],
    abstractionInput: AbstractionInput,
    goalType: GoalType
  ): UncertainField[] {
    if (!Array.isArray(rows)) {
      return fallback;
    }
    const normalized = rows
      .map((row, index) => {
        if (typeof row === "string" && row.trim()) {
          const slot = fallback[Math.min(index, fallback.length - 1)];
          return {
            field: slot?.field ?? `uncertain_${index + 1}`,
            severity: slot?.severity ?? "medium",
            reason: row.trim(),
          } satisfies UncertainField;
        }
        if (!row || typeof row !== "object") {
          return undefined;
        }
        const field = typeof (row as { field?: unknown }).field === "string" ? (row as { field: string }).field.trim() : "";
        const severity = this.isSeverity((row as { severity?: unknown }).severity)
          ? (row as { severity: UncertainField["severity"] }).severity
          : undefined;
        const reason = typeof (row as { reason?: unknown }).reason === "string" ? (row as { reason: string }).reason.trim() : "";
        if (!field || !severity || !reason) {
          return undefined;
        }
        return { field, severity, reason } satisfies UncertainField;
      })
      .filter((row): row is UncertainField => Boolean(row));
    if (normalized.length === 0) {
      return fallback;
    }
    const combined = [...normalized];
    for (const fallbackField of fallback) {
      if (this.isBlockingUncertainty(goalType, fallbackField) && !combined.some((row) => row.field === fallbackField.field)) {
        combined.push(fallbackField);
      }
    }
    if (!combined.some((row) => row.field === "done_criteria") && abstractionInput.uncertaintyCues.includes("collection_done_criteria_unobserved")) {
      combined.push({ field: "done_criteria", severity: "high", reason: "示教未稳定暴露集合任务的完成信号" });
    }
    return combined;
  }

  private deduplicateRules(rows: DecisionRuleEntry[]): DecisionRuleEntry[] {
    const seen = new Set<string>();
    const output: DecisionRuleEntry[] = [];
    for (const row of rows) {
      const key = [row.id, row.rule ?? "", row.condition ?? "", row.action ?? "", row.source, row.confidence].join("|");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      output.push(row);
    }
    return output;
  }

  private normalizeStringArray(candidate: unknown, fallback: string[]): string[] {
    if (!Array.isArray(candidate)) {
      return fallback;
    }
    const normalized = candidate.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
    return normalized.length > 0 ? normalized : fallback;
  }

  private normalizeStringRecord(candidate: unknown): Record<string, string> {
    if (!candidate || typeof candidate !== "object") {
      return {};
    }
    return Object.fromEntries(
      Object.entries(candidate as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0
      )
    );
  }

  private buildClarificationQuestion(field: UncertainField, index: number): ClarificationQuestion {
    const template = this.clarificationTemplate(field.field);
    return {
      id: `q_${index}_${field.field}`,
      topic: template.topic,
      question: template.question,
      targetsField: field.field,
      priority: field.severity === "high" ? "high" : "medium",
    };
  }

  private clarificationTemplate(field: string): { topic: string; question: string } {
    switch (field) {
      case "target_scope":
        return { topic: "scope", question: "当前任务到底要处理哪些对象，哪些对象不在范围内？" };
      case "skip_condition":
        return { topic: "completion", question: "哪些对象可以跳过，哪些对象必须继续处理？" };
      case "done_criteria":
        return { topic: "completion", question: "这个任务在页面上出现什么状态时，才算真正完成？" };
      case "submit_requirement":
        return { topic: "submission", question: "该任务是否必须执行发送或提交动作，成功后应看到什么信号？" };
      case "selection_criteria":
        return { topic: "selection", question: "在候选结果里，应按什么标准选择目标对象？" };
      case "required_field_mapping":
        return { topic: "field_mapping", question: "关键字段应该如何映射，哪些字段是必填的？" };
      case "validation_expectation":
        return { topic: "validation", question: "提交前需要满足哪些格式或校验要求？" };
      case "reply_style_policy":
        return { topic: "content_policy", question: "内容应按当前对象上下文生成，还是允许复用固定模板？" };
      case "confirmation_boundary":
        return { topic: "confirmation", question: "流程里哪些确认步骤必须人工核对后才能继续？" };
      default:
        return { topic: "intent", question: "请明确该字段的决策边界。" };
    }
  }

  private deriveGoalType(abstractionInput: AbstractionInput): GoalType {
    const hasSignal = (kind: AbstractionSignal["kind"]) => abstractionInput.phaseSignals.some((signal) => signal.kind === kind);
    if (hasSignal("iterate_collection")) {
      return "collection_processing";
    }
    if (hasSignal("edit_content") && hasSignal("submit_action") && (abstractionInput.actionSummary.type ?? 0) >= 3) {
      return "form_submission";
    }
    if (hasSignal("locate_object") && !hasSignal("edit_content") && !hasSignal("submit_action")) {
      return "search_and_select";
    }
    if (hasSignal("submit_action") && (abstractionInput.actionSummary.navigate ?? 0) >= 2 && abstractionInput.phaseSignals.length >= 4) {
      return "multi_step_transaction";
    }
    return "single_object_update";
  }

  private resolveGoalType(candidate: unknown, abstractionInput: AbstractionInput, fallback: GoalType): GoalType {
    const evidenceGoalType = this.deriveGoalType(abstractionInput);
    if (this.isGoalType(candidate)) {
      if (candidate === "single_object_update" && evidenceGoalType !== "single_object_update") {
        return evidenceGoalType;
      }
      if (candidate === "search_and_select" && evidenceGoalType === "collection_processing") {
        return evidenceGoalType;
      }
      return candidate;
    }
    if (typeof candidate === "string") {
      const normalized = candidate.trim().toLowerCase();
      if (normalized.includes("collection") || normalized.includes("batch") || normalized.includes("list")) {
        return "collection_processing";
      }
      if (normalized.includes("search") || normalized.includes("select")) {
        return "search_and_select";
      }
      if (normalized.includes("form")) {
        return "form_submission";
      }
      if (normalized.includes("transaction")) {
        return "multi_step_transaction";
      }
      if (normalized.includes("update")) {
        return "single_object_update";
      }
    }
    return evidenceGoalType || fallback;
  }

  private inferSurface(trace: SopTrace): string {
    const firstUrl =
      trace.steps.find((step) => step.target.type === "url" && step.target.value.trim())?.target.value ??
      trace.steps.find((step) => step.page.urlAfter.trim())?.page.urlAfter ??
      trace.steps.find((step) => step.page.urlBefore.trim())?.page.urlBefore;
    if (firstUrl) {
      try {
        const { pathname } = new URL(firstUrl);
        const parts = pathname
          .split("/")
          .map((part) => part.trim().toLowerCase().replace(/[^a-z0-9_-]/g, ""))
          .filter((part) => part.length > 0)
          .slice(0, 2);
        if (parts.length > 0) {
          return `path:${parts.join("/")}`;
        }
      } catch {
        // Ignore URL parse failures and keep generic surface fallback.
      }
    }
    return "current_workflow_surface";
  }

  private defaultCompletionSignals(goalType: GoalType, targetEntity: TargetEntity, abstractionInput: AbstractionInput): string[] {
    const signals = [`当前目标${this.targetLabel(targetEntity)}的状态与任务目标一致`];
    if (goalType === "collection_processing") {
      signals.unshift(`所有目标${this.targetLabel(targetEntity)}都已被检查`);
    }
    if (abstractionInput.phaseSignals.some((signal) => signal.kind === "submit_action")) {
      signals.push("需要发送或提交的动作已执行");
    }
    if (abstractionInput.phaseSignals.some((signal) => signal.kind === "verify_outcome")) {
      signals.push("已观察到可回读的完成信号");
    }
    return signals;
  }

  private looksLikeLocateTarget(step: SopTraceStep): boolean {
    const selector = step.target.type === "selector" ? step.target.value.toLowerCase() : "";
    const textHint = this.readString(step.input.textHint)?.toLowerCase() ?? "";
    const roleHint = this.readString(step.input.roleHint)?.toLowerCase() ?? "";
    const combined = `${selector} ${textHint} ${roleHint}`;
    return this.containsAny(combined, SEARCH_KEYWORDS);
  }

  private isSubmitLikeStep(step: SopTraceStep): boolean {
    if (step.action === "press_key" && step.target.value === "Enter") {
      return true;
    }
    if (step.action !== "click") {
      return false;
    }
    const selector = step.target.type === "selector" ? step.target.value.toLowerCase() : "";
    const text = step.target.type === "text" ? step.target.value.toLowerCase() : "";
    const textHint = this.readString(step.input.textHint)?.toLowerCase() ?? "";
    return this.containsAny(`${selector} ${text} ${textHint}`, SUBMIT_KEYWORDS);
  }

  private hasVerificationCue(step: SopTraceStep): boolean {
    const assertionValue = step.assertionHint?.value?.toLowerCase() ?? "";
    const targetText = step.target.type === "text" ? step.target.value.toLowerCase() : "";
    const textHint = this.readString(step.input.textHint)?.toLowerCase() ?? "";
    return this.containsAny(`${assertionValue} ${targetText} ${textHint}`, SUCCESS_KEYWORDS);
  }

  private hasPostSubmitReview(trace: SopTrace): boolean {
    const submitIndex = trace.steps.findIndex((step) => this.isSubmitLikeStep(step));
    if (submitIndex < 0) {
      return false;
    }
    return trace.steps.slice(submitIndex + 1).some((step) => step.action === "click" || step.action === "navigate");
  }

  private describeStepEvidence(step: SopTraceStep): string {
    const target = step.target.value.trim();
    if (target) {
      return `${step.action}:${this.clip(target)}`;
    }
    const textHint = this.readString(step.input.textHint);
    if (textHint) {
      return `${step.action}:${this.clip(textHint)}`;
    }
    return `${step.action}:step_${step.stepIndex}`;
  }

  private isConcreteExampleText(value: string): boolean {
    const text = value.trim();
    if (text.length < 6) {
      return false;
    }
    if (text.startsWith("http://") || text.startsWith("https://")) {
      return false;
    }
    return true;
  }

  private clip(value: string): string {
    const text = value.trim();
    if (text.length <= MAX_TEXT) {
      return text;
    }
    return `${text.slice(0, MAX_TEXT - 3)}...`;
  }

  private containsAny(text: string, needles: string[]): boolean {
    return needles.some((needle) => text.includes(needle));
  }

  private toArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private readString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }

  private isGoalType(value: unknown): value is GoalType {
    return value === "single_object_update" || value === "collection_processing" || value === "search_and_select" || value === "form_submission" || value === "multi_step_transaction";
  }

  private isTargetEntity(value: unknown): value is TargetEntity {
    return value === "conversation_thread" || value === "product" || value === "order" || value === "listing" || value === "form" || value === "generic_page_object";
  }

  private isRuleSource(value: unknown): value is RuleSource {
    return value === "intent_seed" || value === "inferred_from_trace" || value === "inferred_from_examples" || value === "human_clarified" || value === "default_rule" || value === "uncertain";
  }

  private isRuleConfidence(value: unknown): value is RuleConfidence {
    return value === "high" || value === "medium" || value === "low";
  }

  private isWorkflowStepKind(value: unknown): value is WorkflowStepKind {
    return value === "navigate" || value === "iterate_collection" || value === "filter" || value === "state_change" || value === "decision_gate" || value === "conditional_action" || value === "verification";
  }

  private normalizeWorkflowStepKind(
    candidate: unknown,
    summary: string,
    fallback?: WorkflowStepKind
  ): WorkflowStepKind | undefined {
    if (this.isWorkflowStepKind(candidate)) {
      return candidate;
    }
    const text = `${typeof candidate === "string" ? candidate : ""} ${summary}`.toLowerCase();
    if (this.containsAny(text, ["navigate", "进入", "打开"])) {
      return "navigate";
    }
    if (this.containsAny(text, ["iterate", "遍历", "逐个", "列表"])) {
      return "iterate_collection";
    }
    if (this.containsAny(text, ["filter", "search", "查询", "筛选", "定位"])) {
      return "filter";
    }
    if (this.containsAny(text, ["inspect", "check", "判断", "检查"])) {
      return "decision_gate";
    }
    if (this.containsAny(text, ["submit", "send", "发送", "提交"])) {
      return "conditional_action";
    }
    if (this.containsAny(text, ["verify", "confirm", "验证", "确认"])) {
      return "verification";
    }
    if (this.containsAny(text, ["switch", "edit", "fill", "更新", "填写", "切换"])) {
      return "state_change";
    }
    return fallback;
  }

  private isSeverity(value: unknown): value is UncertainField["severity"] {
    return value === "high" || value === "medium" || value === "low";
  }

  private isBlockingUncertainty(goalType: GoalType, field: UncertainField): boolean {
    if (field.severity === "high") {
      return true;
    }
    if (field.severity === "low") {
      return false;
    }
    if (goalType === "multi_step_transaction") {
      return true;
    }
    return (
      field.field === "target_scope" ||
      field.field === "target_identity" ||
      field.field === "skip_condition" ||
      field.field === "done_criteria" ||
      field.field === "submit_requirement" ||
      field.field === "selection_criteria" ||
      field.field === "required_field_mapping" ||
      field.field === "validation_expectation" ||
      field.field === "confirmation_boundary"
    );
  }

  private targetLabel(targetEntity: TargetEntity): string {
    switch (targetEntity) {
      case "conversation_thread":
        return "会话";
      case "product":
        return "商品";
      case "order":
        return "订单";
      case "listing":
        return "刊登";
      case "form":
        return "表单";
      default:
        return "对象";
    }
  }

  private rule(input: {
    id: string;
    rule?: string;
    condition?: string;
    action?: string;
    source: RuleSource;
    confidence: RuleConfidence;
  }): DecisionRuleEntry {
    return {
      id: input.id,
      rule: input.rule,
      condition: input.condition,
      action: input.action,
      source: input.source,
      confidence: input.confidence,
    };
  }

  private toBehaviorPrimitive(kind: AbstractionSignal["kind"]): BehaviorPrimitive {
    switch (kind) {
      case "open_surface":
        return "open_surface";
      case "switch_context":
        return "switch_context";
      case "locate_object":
        return "locate_candidate";
      case "iterate_collection":
        return "iterate_collection";
      case "inspect_object":
        return "inspect_state";
      case "edit_content":
        return "edit_content";
      case "submit_action":
        return "submit_action";
      case "verify_outcome":
        return "verify_outcome";
    }
  }

  private toBehaviorStepEvidence(step: SopTraceStep): BehaviorStepEvidence {
    const textHint = this.readString(step.input.textHint);
    const roleHint = this.readString(step.input.roleHint);
    return {
      stepIndex: step.stepIndex,
      action: step.action,
      tabId: step.tabId,
      targetType: step.target.type,
      targetValue: this.clip(step.target.value),
      textHint: textHint ? this.clip(textHint) : undefined,
      roleHint: roleHint ? this.clip(roleHint) : undefined,
      assertionHint: step.assertionHint?.value ? this.clip(step.assertionHint.value) : undefined,
    };
  }

  private toBehaviorExampleCandidate(candidate: ExampleCandidate): BehaviorExampleCandidate {
    return {
      id: candidate.id,
      sourceStepIndex: candidate.sourceStepIndex,
      type: candidate.type,
      value: candidate.value,
    };
  }

  private behaviorPrimitiveSummary(primitive: BehaviorPrimitive): string {
    switch (primitive) {
      case "open_surface":
        return "进入目标工作区";
      case "switch_context":
        return "切换上下文或标签页";
      case "locate_candidate":
        return "定位候选对象";
      case "iterate_collection":
        return "遍历候选对象集合";
      case "inspect_state":
        return "检查当前对象状态";
      case "edit_content":
        return "填写或编辑页面内容";
      case "submit_action":
        return "执行发送或提交动作";
      case "verify_outcome":
        return "回读页面状态并验证结果";
    }
  }
}

function actionCount(trace: SopTrace, action: SopTraceStep["action"]): number {
  return trace.steps.filter((step) => step.action === action).length;
}

export function renderWorkflowGuideMarkdown(
  guide: WorkflowGuide,
  decisionModel: DecisionModel,
  manifest: CompactManifest
): string {
  const lines: string[] = [];
  lines.push("# Workflow Guide");
  lines.push("");
  lines.push(`- taskName: ${guide.taskName}`);
  lines.push(`- status: ${manifest.status}`);
  lines.push(`- goalType: ${decisionModel.goalType}`);
  lines.push(`- targetEntity: ${decisionModel.targetEntity}`);
  lines.push("");
  lines.push("## Goal");
  lines.push(guide.goal);
  lines.push("");
  lines.push("## Scope");
  lines.push(`- site: ${guide.scope.site}`);
  lines.push(`- surface: ${guide.scope.surface}`);
  lines.push(`- targetCollection: ${guide.scope.targetCollection}`);
  lines.push("");
  lines.push("## Preconditions");
  for (const item of guide.preconditions) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Steps");
  guide.steps.forEach((step, index) => {
    lines.push(`${index + 1}. [${step.kind}] ${step.summary}`);
  });
  lines.push("");
  lines.push("## Completion Signals");
  for (const signal of guide.completionSignals) {
    lines.push(`- ${signal}`);
  }
  lines.push("");
  if (decisionModel.uncertainFields.length > 0) {
    lines.push("## Unresolved Uncertainties");
    for (const field of decisionModel.uncertainFields) {
      lines.push(`- [${field.severity}] ${field.field}: ${field.reason}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
