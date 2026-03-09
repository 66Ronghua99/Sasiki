/**
 * Deps: domain/sop-compact-artifacts.ts, domain/sop-compact-artifacts-v1.ts, domain/sop-trace.ts, runtime/sop-rule-compact-builder.ts
 * Used By: runtime/sop-compact.ts
 * Last Updated: 2026-03-09
 */
import type {
  AbstractionInput,
  AbstractionSignal,
  CompactManifest,
  CompactManifestStatus,
  ExampleCandidate,
  IntentResolution,
  IntentSeed,
  ObservedExamples,
  RuleConfidence,
} from "../domain/sop-compact-artifacts.js";
import type {
  BehaviorEvidence,
  BehaviorExampleCandidate,
  BehaviorPrimitive,
  BehaviorStepEvidence,
  BehaviorWorkflow,
  BehaviorWorkflowStep,
  ClarificationQuestionV1,
  ClarificationQuestionsV1,
  ExecutionGuideBranchHint,
  ExecutionGuideSemanticConstraint,
  ExecutionGuideStepDetail,
  ExecutionGuideUnresolvedQuestion,
  ExecutionGuideV1,
  ExecutionGuideWorkflowOutlineStep,
  SemanticIntentDraft,
  SemanticUncertainty,
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
  semanticIntentDraft?: SemanticIntentDraft;
  clarificationQuestions?: ClarificationQuestionsV1;
}

interface BuildSopIntentArtifactsResult {
  abstractionInput: AbstractionInput;
  observedExamples: ObservedExamples;
  clarificationQuestions?: ClarificationQuestionsV1;
  executionGuide: ExecutionGuideV1;
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
    const behaviorWorkflow = this.buildBehaviorWorkflowFromSignals(abstractionInput.phaseSignals);
    const observedExamples = this.buildObservedExamples(abstractionInput);

    this.ensureAbstractionInputShape(abstractionInput);

    const clarificationQuestions = this.buildClarificationQuestions(
      input.semanticIntentDraft,
      input.clarificationQuestions,
      input.intentResolution
    );

    this.ensureClarificationCoverage(input.semanticIntentDraft, clarificationQuestions, input.intentResolution);

    const status = this.resolveStatus({
      semanticIntentDraft: input.semanticIntentDraft,
      clarificationQuestions,
      intentResolution: input.intentResolution,
    });
    const executionGuide = this.buildExecutionGuide(
      input.runId,
      intentSeed,
      abstractionInput,
      behaviorWorkflow,
      input.semanticIntentDraft,
      clarificationQuestions,
      input.intentResolution,
      status
    );
    const pollutionDetected = this.detectExecutionGuidePollution(executionGuide, observedExamples);
    const finalStatus = pollutionDetected && status !== "rejected" ? "rejected" : status;
    const finalExecutionGuide =
      finalStatus === status
        ? executionGuide
        : {
            ...executionGuide,
            status: finalStatus,
            replayReady: false,
          };
    const uncertaintyCounts = this.summarizeUncertaintyCounts(input.semanticIntentDraft, input.intentResolution);
    const manifest: CompactManifest = {
      schemaVersion: "compact_manifest.v1",
      runId: input.runId,
      status: finalStatus,
      artifacts: {
        abstractionInput: "abstraction_input.json",
        behaviorEvidence: "behavior_evidence.json",
        behaviorWorkflow: "behavior_workflow.json",
        semanticIntentDraft: input.semanticIntentDraft ? "semantic_intent_draft.json" : null,
        observedExamples: "observed_examples.json",
        clarificationQuestions: clarificationQuestions ? "clarification_questions.json" : null,
        intentResolution: input.intentResolution ? "intent_resolution.json" : null,
        executionGuide: "execution_guide.json",
      },
      quality: {
        highUncertaintyCount: uncertaintyCounts.high,
        mediumUncertaintyCount: uncertaintyCounts.medium,
        lowUncertaintyCount: uncertaintyCounts.low,
        exampleCount: observedExamples.examples.length,
        pollutionDetected,
      },
    };

    this.ensureManifestConsistency(input.semanticIntentDraft, input.intentResolution, observedExamples, manifest);
    this.ensureReplayGate(
      input.semanticIntentDraft,
      clarificationQuestions,
      input.intentResolution,
      manifest.status,
      pollutionDetected
    );
    this.ensureExecutionGuideCompile(finalExecutionGuide, manifest.status);

    return {
      abstractionInput,
      observedExamples,
      clarificationQuestions,
      executionGuide: finalExecutionGuide,
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
    return this.buildBehaviorWorkflowFromSignals(
      behaviorEvidence.phaseSignals.map((signal) => ({
        id: signal.id,
        kind: this.toAbstractionSignalKind(signal.primitive),
        confidence: signal.confidence,
        evidence: signal.evidence,
      }))
    );
  }

  private buildBehaviorWorkflowFromSignals(phaseSignals: AbstractionSignal[]): BehaviorWorkflow {
    const steps: BehaviorWorkflowStep[] = phaseSignals.map((signal, index) => ({
      id: `behavior_step_${index + 1}`,
      primitive: this.toBehaviorPrimitive(signal.kind),
      summary: this.behaviorPrimitiveSummary(this.toBehaviorPrimitive(signal.kind)),
      evidenceRefs: [signal.id],
    }));
    const branchPoints = phaseSignals
      .filter((signal) => signal.kind === "switch_context" || signal.kind === "locate_object")
      .map((signal) => signal.id);
    const observedLoops = phaseSignals
      .filter((signal) => signal.kind === "iterate_collection")
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

  private buildObservedExamples(abstractionInput: AbstractionInput): ObservedExamples {
    const examples = abstractionInput.exampleCandidates.slice(0, 4).map((candidate, index) => ({
      id: `example_${index + 1}`,
      entityType: "observed_object",
      observedSignals: { [candidate.type]: candidate.value },
      observedAction: {},
      exampleOnly: true as const,
    }));
    return {
      schemaVersion: "observed_examples.v1",
      examples,
      antiPromotionRules: [
        "具体用户名、消息片段、页面文案只能作为 example，不得直接提升为规则",
        "固定回复或输入文本只能作为 observed example，不得直接作为默认策略",
        "selector 或 text hint 只作为证据，不直接等于任务目标",
      ],
    };
  }

  private buildClarificationQuestions(
    semanticIntentDraft: SemanticIntentDraft | undefined,
    questions: ClarificationQuestionsV1 | undefined,
    intentResolution?: IntentResolution
  ): ClarificationQuestionsV1 | undefined {
    if (!semanticIntentDraft || !questions) {
      return undefined;
    }
    const blockingFields = new Set(
      semanticIntentDraft.blockingUncertainties
        .map((uncertainty) => uncertainty.field)
        .filter((field) => !this.isSemanticFieldResolved(field, intentResolution))
    );
    const deduped = questions.questions.filter((question, index, rows) => {
      if (!blockingFields.has(question.targetsSemanticField)) {
        return false;
      }
      return (
        rows.findIndex((candidate) => {
          return (
            candidate.targetsSemanticField === question.targetsSemanticField && candidate.question === question.question
          );
        }) === index
      );
    });
    if (deduped.length === 0) {
      return undefined;
    }
    return {
      schemaVersion: "clarification_questions.v1",
      questions: deduped.slice(0, QUESTION_MAX),
    };
  }

  private buildExecutionGuide(
    runId: string,
    intentSeed: IntentSeed,
    abstractionInput: AbstractionInput,
    behaviorWorkflow: BehaviorWorkflow,
    semanticIntentDraft: SemanticIntentDraft | undefined,
    clarificationQuestions: ClarificationQuestionsV1 | undefined,
    intentResolution: IntentResolution | undefined,
    status: CompactManifestStatus
  ): ExecutionGuideV1 {
    const semanticState = this.resolveSemanticState(intentSeed, abstractionInput, semanticIntentDraft, intentResolution);
    const workflowOutline = this.buildWorkflowOutline(behaviorWorkflow, semanticIntentDraft);
    const semanticConstraints = this.buildSemanticConstraints(semanticState, semanticIntentDraft);
    const doneCriteria = this.buildDoneCriteria(semanticState, semanticIntentDraft);
    const stepDetails = this.buildStepDetails(behaviorWorkflow, semanticIntentDraft);
    const branchHints = this.buildBranchHints(behaviorWorkflow, semanticIntentDraft);
    const unresolvedQuestions = this.buildUnresolvedQuestions(semanticIntentDraft, clarificationQuestions, intentResolution);

    return {
      schemaVersion: "execution_guide.v1",
      runId,
      status,
      replayReady: status === "ready_for_replay",
      generalPlan: {
        goal: semanticState.goal,
        scope: semanticState.scope,
        workflowOutline,
        doneCriteria,
        semanticConstraints,
      },
      detailContext: {
        stepDetails,
        branchHints,
        resolutionNotes: intentResolution?.notes ?? [],
        unresolvedQuestions,
      },
    };
  }

  private resolveSemanticState(
    intentSeed: IntentSeed,
    abstractionInput: AbstractionInput,
    semanticIntentDraft: SemanticIntentDraft | undefined,
    intentResolution?: IntentResolution
  ): {
    goal: string;
    scope: string;
    completion: string;
    selection: string[];
    skip: string[];
    resolutionRules: string[];
  } {
    const resolvedFields = intentResolution?.resolvedFields ?? {};
    const fallbackGoal = intentSeed.rawTask.trim() || "执行当前浏览器任务";
    const goal =
      this.readResolvedSemanticText(["taskIntentHypothesis", "target_identity"], resolvedFields) ??
      semanticIntentDraft?.taskIntentHypothesis ??
      fallbackGoal;
    const scope =
      this.readResolvedSemanticText(["scopeHypothesis", "target_scope", "selection_criteria"], resolvedFields) ??
      semanticIntentDraft?.scopeHypothesis ??
      `在 ${abstractionInput.site} 的 ${abstractionInput.surface} 工作区内处理与任务相关的对象。`;
    const completion =
      this.readResolvedSemanticText(["completionHypothesis", "done_criteria"], resolvedFields) ??
      semanticIntentDraft?.completionHypothesis ??
      "相关对象已按当前任务要求处理完成，并出现可回读的页面完成信号。";
    const selection = this.mergeResolvedSemanticList(
      semanticIntentDraft?.selectionHypotheses ?? [],
      resolvedFields,
      ["selectionHypotheses", "selection_criteria"]
    );
    const skip = this.mergeResolvedSemanticList(
      semanticIntentDraft?.skipHypotheses ?? [],
      resolvedFields,
      ["skipHypotheses", "skip_condition"]
    );
    const resolutionRules = [
      this.readResolvedSemanticText(["reply_style_policy"], resolvedFields),
      this.readResolvedSemanticText(["submit_requirement"], resolvedFields),
    ].filter((item): item is string => Boolean(item));
    return { goal, scope, completion, selection, skip, resolutionRules };
  }

  private buildWorkflowOutline(
    behaviorWorkflow: BehaviorWorkflow,
    semanticIntentDraft: SemanticIntentDraft | undefined
  ): ExecutionGuideWorkflowOutlineStep[] {
    const purposeByStep = this.buildPurposeIndex(semanticIntentDraft);
    return behaviorWorkflow.steps.map((step) => ({
      stepId: step.id,
      primitive: step.primitive,
      summary: step.summary,
      purpose: purposeByStep.get(step.id) ?? step.summary,
      evidenceRefs: step.evidenceRefs,
    }));
  }

  private buildSemanticConstraints(
    semanticState: {
      selection: string[];
      skip: string[];
      resolutionRules: string[];
    },
    semanticIntentDraft: SemanticIntentDraft | undefined
  ): ExecutionGuideSemanticConstraint[] {
    const constraints: ExecutionGuideSemanticConstraint[] = [];
    const pushConstraint = (
      category: ExecutionGuideSemanticConstraint["category"],
      statement: string | undefined
    ): void => {
      if (!statement || constraints.some((item) => item.category === category && item.statement === statement)) {
        return;
      }
      constraints.push({
        id: `constraint_${constraints.length + 1}`,
        category,
        statement,
      });
    };
    for (const item of semanticState.selection) {
      pushConstraint("selection", item);
    }
    for (const item of semanticState.skip) {
      pushConstraint("skip", item);
    }
    for (const item of semanticState.resolutionRules) {
      pushConstraint("resolution", item);
    }
    pushConstraint("guardrail", "不要把单次示教中的具体文案、用户名或 selector 直接提升为通用规则。");
    if (!semanticIntentDraft) {
      pushConstraint("guardrail", "当前语义草案缺失，只能把本 guide 作为保守参考，不能直接放行 replay。");
    }
    return constraints;
  }

  private buildDoneCriteria(
    semanticState: { completion: string },
    semanticIntentDraft: SemanticIntentDraft | undefined
  ): string[] {
    const criteria = [semanticState.completion];
    if (semanticIntentDraft?.blockingUncertainties.length) {
      criteria.push("若完成标准仍不清晰，先进入澄清而不是继续假设。");
    }
    return criteria;
  }

  private buildStepDetails(
    behaviorWorkflow: BehaviorWorkflow,
    semanticIntentDraft: SemanticIntentDraft | undefined
  ): ExecutionGuideStepDetail[] {
    const purposeByStep = this.buildPurposeIndex(semanticIntentDraft);
    const branchPointSteps = new Set(
      behaviorWorkflow.branchPoints
        .map((signalId) => this.findBehaviorStepIdBySignal(behaviorWorkflow, signalId))
        .filter((stepId): stepId is string => Boolean(stepId))
    );
    const loopSteps = new Set(
      behaviorWorkflow.observedLoops
        .map((signalId) => this.findBehaviorStepIdBySignal(behaviorWorkflow, signalId))
        .filter((stepId): stepId is string => Boolean(stepId))
    );
    const submitSteps = new Set(behaviorWorkflow.submitPoints);
    const verificationSteps = new Set(behaviorWorkflow.verificationPoints);
    return behaviorWorkflow.steps.map((step) => ({
      stepId: step.id,
      primitive: step.primitive,
      summary: step.summary,
      purpose: purposeByStep.get(step.id) ?? step.summary,
      evidenceRefs: step.evidenceRefs,
      stepRole: this.resolveStepRole(step.id, branchPointSteps, loopSteps, submitSteps, verificationSteps),
    }));
  }

  private buildBranchHints(
    behaviorWorkflow: BehaviorWorkflow,
    semanticIntentDraft: SemanticIntentDraft | undefined
  ): ExecutionGuideBranchHint[] {
    const hints: ExecutionGuideBranchHint[] = [];
    const pushHint = (stepId: string | undefined, hint: string, relatedSemanticFields: string[]): void => {
      if (!stepId || hints.some((item) => item.stepId === stepId && item.hint === hint)) {
        return;
      }
      hints.push({
        id: `branch_hint_${hints.length + 1}`,
        stepId,
        hint,
        relatedSemanticFields,
      });
    };
    for (const signalId of behaviorWorkflow.branchPoints) {
      pushHint(
        this.findBehaviorStepIdBySignal(behaviorWorkflow, signalId),
        "遇到上下文切换或候选对象分流时，保持当前任务范围，不要把单次示教中的具体对象当成固定入口。",
        ["scopeHypothesis", "selectionHypotheses"]
      );
    }
    for (const signalId of behaviorWorkflow.observedLoops) {
      pushHint(
        this.findBehaviorStepIdBySignal(behaviorWorkflow, signalId),
        "按当前选择范围逐个处理候选对象；若范围或停止条件不清晰，先看 unresolvedQuestions。",
        ["scopeHypothesis", "completionHypothesis"]
      );
    }
    for (const stepId of behaviorWorkflow.submitPoints) {
      pushHint(stepId, "仅在当前对象满足发送或提交条件时执行该动作。", ["completionHypothesis"]);
    }
    for (const stepId of behaviorWorkflow.verificationPoints) {
      pushHint(stepId, "提交后回读页面状态，确认是否出现完成信号或状态更新。", ["completionHypothesis"]);
    }
    if (hints.length === 0 && semanticIntentDraft?.selectionHypotheses.length) {
      pushHint(behaviorWorkflow.steps[0]?.id, semanticIntentDraft.selectionHypotheses[0], ["selectionHypotheses"]);
    }
    return hints;
  }

  private buildUnresolvedQuestions(
    semanticIntentDraft: SemanticIntentDraft | undefined,
    clarificationQuestions: ClarificationQuestionsV1 | undefined,
    intentResolution?: IntentResolution
  ): ExecutionGuideUnresolvedQuestion[] {
    if (!semanticIntentDraft) {
      return [
        {
          field: "semantic_intent_draft",
          severity: "high",
          reason: "语义草案缺失，execution_guide.v1 只能保守编译。",
        },
      ];
    }
    const questionByField = new Map<string, ClarificationQuestionV1>();
    for (const question of clarificationQuestions?.questions ?? []) {
      questionByField.set(question.targetsSemanticField, question);
    }
    return this.getUnresolvedSemanticUncertainties(semanticIntentDraft, intentResolution).map((uncertainty) => {
      const question = questionByField.get(uncertainty.field);
      return {
        field: uncertainty.field,
        severity: uncertainty.severity,
        reason: uncertainty.reason,
        question: question?.question,
        priority: question?.priority,
      };
    });
  }

  private buildPurposeIndex(semanticIntentDraft: SemanticIntentDraft | undefined): Map<string, string> {
    const index = new Map<string, string>();
    for (const hypothesis of semanticIntentDraft?.actionPurposeHypotheses ?? []) {
      if (!hypothesis.stepId || !hypothesis.purpose || index.has(hypothesis.stepId)) {
        continue;
      }
      index.set(hypothesis.stepId, hypothesis.purpose);
    }
    return index;
  }

  private summarizeUncertaintyCounts(
    semanticIntentDraft: SemanticIntentDraft | undefined,
    intentResolution: IntentResolution | undefined
  ): { high: number; medium: number; low: number } {
    const uncertainties = semanticIntentDraft
      ? [
          ...this.getUnresolvedSemanticUncertainties(semanticIntentDraft, intentResolution),
          ...semanticIntentDraft.nonBlockingUncertainties.filter(
            (uncertainty) => !this.isSemanticFieldResolved(uncertainty.field, intentResolution)
          ),
        ]
      : [
          {
            field: "semantic_intent_draft",
            severity: "high" as const,
            reason: "semantic intent draft missing",
          },
        ];
    return uncertainties.reduce(
      (summary, uncertainty) => {
        summary[uncertainty.severity] += 1;
        return summary;
      },
      { high: 0, medium: 0, low: 0 }
    );
  }

  private getUnresolvedSemanticUncertainties(
    semanticIntentDraft: SemanticIntentDraft | undefined,
    intentResolution?: IntentResolution
  ): SemanticUncertainty[] {
    if (!semanticIntentDraft) {
      return [];
    }
    return semanticIntentDraft.blockingUncertainties.filter(
      (uncertainty) => !this.isSemanticFieldResolved(uncertainty.field, intentResolution)
    );
  }

  private isSemanticFieldResolved(field: string, intentResolution?: IntentResolution): boolean {
    if (!intentResolution) {
      return false;
    }
    return this.semanticFieldAliases(field).some((candidate) =>
      Object.prototype.hasOwnProperty.call(intentResolution.resolvedFields, candidate)
    );
  }

  private semanticFieldAliases(field: string): string[] {
    switch (field) {
      case "taskIntentHypothesis":
        return ["taskIntentHypothesis", "target_identity"];
      case "scopeHypothesis":
        return ["scopeHypothesis", "target_scope", "selection_criteria"];
      case "completionHypothesis":
        return ["completionHypothesis", "done_criteria"];
      case "selectionHypotheses":
        return ["selectionHypotheses", "selection_criteria"];
      case "skipHypotheses":
        return ["skipHypotheses", "skip_condition"];
      case "actionPurposeHypotheses":
        return ["actionPurposeHypotheses", "reply_style_policy", "submit_requirement"];
      default:
        return [field];
    }
  }

  private readResolvedSemanticText(keys: string[], resolvedFields: Record<string, boolean | string>): string | undefined {
    for (const key of keys) {
      const value = resolvedFields[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }

  private mergeResolvedSemanticList(
    base: string[],
    resolvedFields: Record<string, boolean | string>,
    keys: string[]
  ): string[] {
    const merged = [...base];
    for (const key of keys) {
      const value = resolvedFields[key];
      if (typeof value !== "string" || value.trim().length === 0) {
        continue;
      }
      const normalized = value.trim();
      if (!merged.includes(normalized)) {
        merged.push(normalized);
      }
    }
    return merged;
  }

  private findBehaviorStepIdBySignal(behaviorWorkflow: BehaviorWorkflow, signalId: string): string | undefined {
    return behaviorWorkflow.steps.find((step) => step.evidenceRefs.includes(signalId))?.id;
  }

  private resolveStepRole(
    stepId: string,
    branchPointSteps: Set<string>,
    loopSteps: Set<string>,
    submitSteps: Set<string>,
    verificationSteps: Set<string>
  ): ExecutionGuideStepDetail["stepRole"] {
    if (submitSteps.has(stepId)) {
      return "submit_point";
    }
    if (verificationSteps.has(stepId)) {
      return "verification_point";
    }
    if (loopSteps.has(stepId)) {
      return "loop";
    }
    if (branchPointSteps.has(stepId)) {
      return "branch_point";
    }
    return "default";
  }

  private ensureAbstractionInputShape(abstractionInput: AbstractionInput): void {
    if (abstractionInput.highLevelSteps.length === 0 || abstractionInput.phaseSignals.length === 0) {
      throw new Error("abstraction_input_shape_check failed: evidence is missing high-level steps or phase signals");
    }
  }

  private ensureClarificationCoverage(
    semanticIntentDraft: SemanticIntentDraft | undefined,
    clarificationQuestions: ClarificationQuestionsV1 | undefined,
    intentResolution?: IntentResolution
  ): void {
    if (!semanticIntentDraft) {
      return;
    }
    const blockingFieldSet = new Set(
      semanticIntentDraft.blockingUncertainties
        .map((uncertainty) => uncertainty.field)
        .filter((field) => !this.isSemanticFieldResolved(field, intentResolution))
    );
    if (blockingFieldSet.size === 0) {
      return;
    }
    if (!clarificationQuestions || clarificationQuestions.questions.length === 0) {
      throw new Error(
        "clarification_coverage_check failed: blocking uncertainty exists but no clarification_questions were generated"
      );
    }
    const coveredFields = new Set<string>();
    for (const question of clarificationQuestions.questions) {
      if (!blockingFieldSet.has(question.targetsSemanticField)) {
        throw new Error(
          `clarification_coverage_check failed: missing blocking uncertainty for ${question.targetsSemanticField}`
        );
      }
      coveredFields.add(question.targetsSemanticField);
    }
    for (const field of blockingFieldSet) {
      if (!coveredFields.has(field)) {
        throw new Error(`clarification_coverage_check failed: missing question for ${field}`);
      }
    }
  }

  private ensureManifestConsistency(
    semanticIntentDraft: SemanticIntentDraft | undefined,
    intentResolution: IntentResolution | undefined,
    observedExamples: ObservedExamples,
    manifest: CompactManifest
  ): void {
    const counts = this.summarizeUncertaintyCounts(semanticIntentDraft, intentResolution);
    if (
      manifest.quality.highUncertaintyCount !== counts.high ||
      manifest.quality.mediumUncertaintyCount !== counts.medium ||
      manifest.quality.lowUncertaintyCount !== counts.low ||
      manifest.quality.exampleCount !== observedExamples.examples.length
    ) {
      throw new Error("manifest_consistency_check failed: manifest quality counts do not match source artifacts");
    }
  }

  private ensureReplayGate(
    semanticIntentDraft: SemanticIntentDraft | undefined,
    clarificationQuestions: ClarificationQuestionsV1 | undefined,
    intentResolution: IntentResolution | undefined,
    status: CompactManifestStatus,
    pollutionDetected: boolean
  ): void {
    const hasBlocking = this.getUnresolvedSemanticUncertainties(semanticIntentDraft, intentResolution).length > 0;
    const hasQuestions = (clarificationQuestions?.questions.length ?? 0) > 0;
    if (status === "ready_for_replay" && (!semanticIntentDraft || hasBlocking || pollutionDetected || hasQuestions)) {
      throw new Error("replay_gate_check failed: manifest status is ready_for_replay but admission rules block replay");
    }
  }

  private ensureExecutionGuideCompile(executionGuide: ExecutionGuideV1, status: CompactManifestStatus): void {
    if (
      executionGuide.status !== status ||
      !executionGuide.generalPlan.goal ||
      !executionGuide.generalPlan.scope ||
      executionGuide.generalPlan.workflowOutline.length === 0 ||
      executionGuide.detailContext.stepDetails.length === 0
    ) {
      throw new Error("execution_guide_compile_check failed: execution guide is incomplete");
    }
  }

  private detectExecutionGuidePollution(executionGuide: ExecutionGuideV1, observedExamples: ObservedExamples): boolean {
    const haystack = [
      executionGuide.generalPlan.goal,
      executionGuide.generalPlan.scope,
      ...executionGuide.generalPlan.workflowOutline.flatMap((step) => [step.summary, step.purpose]),
      ...executionGuide.generalPlan.doneCriteria,
      ...executionGuide.generalPlan.semanticConstraints.map((constraint) => constraint.statement),
      ...executionGuide.detailContext.stepDetails.flatMap((step) => [step.summary, step.purpose]),
      ...executionGuide.detailContext.branchHints.map((hint) => hint.hint),
    ]
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
    semanticIntentDraft: SemanticIntentDraft | undefined;
    clarificationQuestions?: ClarificationQuestionsV1;
    intentResolution?: IntentResolution;
  }): CompactManifestStatus {
    if (!input.semanticIntentDraft) {
      return "rejected";
    }
    const hasBlocking = this.getUnresolvedSemanticUncertainties(input.semanticIntentDraft, input.intentResolution).length > 0;
    if (hasBlocking) {
      return input.clarificationQuestions ? "needs_clarification" : "rejected";
    }
    if (input.clarificationQuestions?.questions.length) {
      return "needs_clarification";
    }
    return "ready_for_replay";
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

  private readString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
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

  private toAbstractionSignalKind(primitive: BehaviorPrimitive): AbstractionSignal["kind"] {
    switch (primitive) {
      case "open_surface":
        return "open_surface";
      case "switch_context":
        return "switch_context";
      case "locate_candidate":
        return "locate_object";
      case "iterate_collection":
        return "iterate_collection";
      case "inspect_state":
        return "inspect_object";
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
