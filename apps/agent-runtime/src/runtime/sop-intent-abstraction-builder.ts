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
  NoiseObservation,
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
  ClarificationQuestionV2,
  ClarificationQuestionsV2,
  ExecutionGuideBranchHint,
  ExecutionGuideSemanticConstraint,
  ExecutionGuideStepDetail,
  ExecutionGuideUnresolvedQuestion,
  ExecutionGuideV1,
  ExecutionGuideWorkflowOutlineStep,
  FrozenSemanticIntentV1,
  SemanticCoreFieldKey,
  SemanticIntentDraft,
  SemanticUncertainty,
} from "../domain/sop-compact-artifacts-v1.js";
import type { SopTrace, SopTraceStep } from "../domain/sop-trace.js";
import type { BuiltCompact } from "./sop-rule-compact-builder.js";
import { serializeCompactHint } from "./sop-rule-compact-builder.js";
import { semanticCoreFieldAliases, validateCoreFieldAnswer } from "./sop-core-field-answer-gate.js";

interface BuildSopIntentArtifactsInput {
  runId: string;
  trace: SopTrace;
  built: BuiltCompact;
  generatedAt: string;
  intentResolution?: IntentResolution;
  semanticIntentDraft?: SemanticIntentDraft;
}

interface BuildSopIntentArtifactsResult {
  abstractionInput: AbstractionInput;
  observedExamples: ObservedExamples;
  clarificationQuestions?: ClarificationQuestionsV2;
  frozenSemanticIntent?: FrozenSemanticIntentV1;
  executionGuide: ExecutionGuideV1;
  manifest: CompactManifest;
}

interface BuildBehaviorArtifactsResult {
  behaviorEvidence: BehaviorEvidence;
  behaviorWorkflow: BehaviorWorkflow;
}

interface FrozenCompileContext {
  coreFieldsFrozen: boolean;
  allowPurposeHypotheses: boolean;
  purposeOverrides: Map<string, string>;
  forcedSubmitSteps: Set<string>;
  optionalObservedActionSteps: Set<string>;
  resolutionNotes: string[];
  compatibilityQuestion?: ExecutionGuideUnresolvedQuestion;
  finalActionValue?: string;
}

const SUBMIT_KEYWORDS = ["submit", "send", "save", "publish", "confirm", "提交", "发送", "保存", "发布", "确认"];
const SEARCH_KEYWORDS = ["search", "filter", "query", "keyword", "搜索", "筛选", "查询"];
const SUCCESS_KEYWORDS = ["success", "completed", "done", "saved", "sent", "成功", "完成", "已发送", "已保存"];
const BROWSE_ONLY_ACTION_CUES = ["只浏览", "仅浏览", "不操作", "只看", "仅查看", "viewonly", "browseonly", "noaction"];
const EXPLICIT_OBJECT_ACTION_CUES = [
  "点赞",
  "关注",
  "回复",
  "提交",
  "发送",
  "保存",
  "评论",
  "收藏",
  "转发",
  "like",
  "follow",
  "reply",
  "submit",
  "send",
  "save",
  "comment",
  "favorite",
  "share",
];
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

    const semanticIntentDraft = input.semanticIntentDraft
      ? {
          ...input.semanticIntentDraft,
          noiseObservations: abstractionInput.noiseObservations.map((item) => item.id),
        }
      : undefined;
    const clarificationQuestions = this.buildClarificationQuestions(
      semanticIntentDraft,
      abstractionInput,
      behaviorWorkflow,
      input.intentResolution
    );
    const frozenSemanticIntent = this.buildFrozenSemanticIntent(
      semanticIntentDraft,
      behaviorWorkflow,
      input.intentResolution
    );

    this.ensureClarificationCoverage(semanticIntentDraft, behaviorWorkflow, clarificationQuestions, input.intentResolution);

    const status = this.resolveStatus({
      frozenSemanticIntent,
      clarificationQuestions,
    });
    const executionGuide = this.buildExecutionGuide(
      input.runId,
      intentSeed,
      abstractionInput,
      behaviorWorkflow,
      semanticIntentDraft,
      frozenSemanticIntent,
      clarificationQuestions,
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
    const uncertaintyCounts = this.summarizeUncertaintyCounts(semanticIntentDraft, frozenSemanticIntent);
    const manifest: CompactManifest = {
      schemaVersion: "compact_manifest.v1",
      runId: input.runId,
      status: finalStatus,
      artifacts: {
        abstractionInput: "abstraction_input.json",
        behaviorEvidence: "behavior_evidence.json",
        behaviorWorkflow: "behavior_workflow.json",
        semanticIntentDraft: semanticIntentDraft ? "semantic_intent_draft.json" : null,
        observedExamples: "observed_examples.json",
        clarificationQuestions: clarificationQuestions ? "clarification_questions.json" : null,
        intentResolution: input.intentResolution ? "intent_resolution.json" : null,
        frozenSemanticIntent: frozenSemanticIntent ? "frozen_semantic_intent.json" : null,
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

    this.ensureManifestConsistency(semanticIntentDraft, frozenSemanticIntent, observedExamples, manifest);
    this.ensureReplayGate(
      frozenSemanticIntent,
      clarificationQuestions,
      manifest.status,
      pollutionDetected
    );
    this.ensureExecutionGuideCompile(finalExecutionGuide, manifest.status);

    return {
      abstractionInput,
      observedExamples,
      clarificationQuestions,
      frozenSemanticIntent,
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
    const noiseObservations = this.buildNoiseObservations(trace, phaseSignals);
    const exampleCandidates = this.buildExampleCandidates(trace);
    const uncertaintyCues = this.buildUncertaintyCues(trace, phaseSignals, exampleCandidates);
    return {
      schemaVersion: "abstraction_input.v1",
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
      noiseObservations,
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
    const relevantNavigations = navigations.filter((step) => this.isRelevantSurfaceUrl(this.readStepUrl(step), trace.site));
    pushSignal(
      "open_surface",
      (relevantNavigations.length > 0 ? relevantNavigations : navigations.filter((step) => !this.isPlaceholderUrl(this.readStepUrl(step))))
        .slice(0, 2)
        .map((step) => `navigate:${this.clip(this.readStepUrl(step) ?? step.target.value)}`),
      relevantNavigations.length > 0 ? "high" : "low"
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
      .filter((step, index) => step.action === "click" && !this.isSubmitLikeTraceStep(trace, index))
      .slice(0, 3)
      .map((step) => this.describeStepEvidence(step));
    pushSignal("inspect_object", inspectEvidence, inspectEvidence.length > 0 ? "medium" : "low");

    const editEvidence = trace.steps
      .filter((step) => step.action === "type" && !this.looksLikeLocateTarget(step))
      .slice(0, 3)
      .map((step) => this.describeStepEvidence(step));
    pushSignal("edit_content", editEvidence, editEvidence.length > 0 ? "high" : "low");

    const submitEvidence = trace.steps
      .filter((step, index) => this.isSubmitLikeTraceStep(trace, index))
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

  private buildNoiseObservations(trace: SopTrace, phaseSignals: AbstractionSignal[]): NoiseObservation[] {
    const observations: NoiseObservation[] = [];
    const pushObservation = (observation: NoiseObservation): void => {
      if (observations.some((item) => item.kind === observation.kind && item.summary === observation.summary)) {
        return;
      }
      observations.push(observation);
    };
    const navigationUrls = trace.steps
      .filter((step) => step.action === "navigate")
      .map((step) => this.readStepUrl(step))
      .filter((value): value is string => Boolean(value));
    const foreignUrls = navigationUrls.filter(
      (url) => !this.isPlaceholderUrl(url) && !this.isRelevantSurfaceUrl(url, trace.site)
    );
    if (foreignUrls.length > 0) {
      pushObservation({
        id: `noise_${observations.length + 1}`,
        kind: "foreign_site_tab",
        summary: `录制中存在与当前站点无关的背景页面：${this.clip(foreignUrls[0])}`,
        evidenceRefs: phaseSignals.find((signal) => signal.kind === "switch_context")?.id
          ? [phaseSignals.find((signal) => signal.kind === "switch_context")!.id]
          : [],
        affects: ["surface", "task_intent", "scope"],
      });
    }
    const placeholderUrls = navigationUrls.filter((url) => this.isPlaceholderUrl(url));
    if (placeholderUrls.length > 0) {
      pushObservation({
        id: `noise_${observations.length + 1}`,
        kind: "placeholder_surface",
        summary: `录制中包含 placeholder 页面：${this.clip(placeholderUrls[0])}`,
        evidenceRefs: phaseSignals.find((signal) => signal.kind === "open_surface")?.id
          ? [phaseSignals.find((signal) => signal.kind === "open_surface")!.id]
          : [],
        affects: ["surface"],
      });
    }
    if (foreignUrls.length > 0 && placeholderUrls.length > 0) {
      pushObservation({
        id: `noise_${observations.length + 1}`,
        kind: "background_context",
        summary: "录制开始前存在背景上下文，需要在 compact 阶段与主工作流隔离。",
        evidenceRefs: phaseSignals.map((signal) => signal.id).slice(0, 2),
        affects: ["task_intent", "scope"],
      });
    }
    return observations;
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
    abstractionInput: AbstractionInput,
    behaviorWorkflow: BehaviorWorkflow,
    intentResolution?: IntentResolution
  ): ClarificationQuestionsV2 | undefined {
    if (!semanticIntentDraft) {
      return undefined;
    }
    const frozenSemanticIntent = this.buildFrozenSemanticIntent(semanticIntentDraft, behaviorWorkflow, intentResolution);
    const unresolvedFields = new Set(frozenSemanticIntent?.remainingUnresolved ?? []);
    const deduped = semanticIntentDraft.clarificationRequirements
      .filter((question) => unresolvedFields.has(question.field))
      .slice(0, QUESTION_MAX)
      .map((question): ClarificationQuestionV2 => ({
        questionId: question.questionId,
        field: question.field,
        prompt: question.prompt,
        priority: question.priority,
        blocking: question.blocking,
        reason: question.reason,
        evidenceRefs: [...question.evidenceRefs],
        questionContext: this.buildQuestionContext(question.field, abstractionInput, behaviorWorkflow),
      }));
    if (deduped.length === 0) {
      return undefined;
    }
    return {
      schemaVersion: "clarification_questions.v2",
      source: "semantic_intent_draft.clarificationRequirements",
      questions: deduped.slice(0, QUESTION_MAX),
    };
  }

  private buildQuestionContext(
    field: SemanticCoreFieldKey,
    abstractionInput: AbstractionInput,
    behaviorWorkflow: BehaviorWorkflow
  ): ClarificationQuestionV2["questionContext"] {
    const workflowSummary = behaviorWorkflow.steps.slice(0, 5).map((step) => step.summary);
    const observedLoopSummary =
      behaviorWorkflow.observedLoops.length > 0 ? "观察到对多个候选对象或内容项的浏览/切换。" : undefined;
    const candidateActionSummary =
      field === "final_action"
        ? behaviorWorkflow.submitPoints.length > 0
          ? "观察到一次可能改变对象状态的动作，但其业务语义未冻结。"
          : "当前 trace 主要体现浏览与检查流程，未观察到明确可解释的最终对象动作。"
        : undefined;
    const evidenceRefs = behaviorWorkflow.steps
      .filter((step) =>
        field === "task_intent"
          ? ["locate_candidate", "iterate_collection"].includes(step.primitive)
          : field === "scope"
            ? ["open_surface", "iterate_collection"].includes(step.primitive)
            : field === "completion_criteria"
              ? ["iterate_collection", "submit_action", "verify_outcome"].includes(step.primitive)
              : ["submit_action", "inspect_state", "iterate_collection"].includes(step.primitive)
      )
      .flatMap((step) => step.evidenceRefs)
      .slice(0, 4);
    if (abstractionInput.noiseObservations.length > 0 && field !== "final_action") {
      evidenceRefs.push(...abstractionInput.noiseObservations.map((item) => item.id).slice(0, 1));
    }
    return {
      workflowSummary,
      observedLoopSummary,
      candidateActionSummary,
      evidenceRefs,
    };
  }

  private buildFrozenSemanticIntent(
    semanticIntentDraft: SemanticIntentDraft | undefined,
    behaviorWorkflow: BehaviorWorkflow,
    intentResolution?: IntentResolution
  ): FrozenSemanticIntentV1 | undefined {
    if (!semanticIntentDraft) {
      return undefined;
    }
    const resolvedFields = intentResolution?.resolvedFields ?? {};
    const coreFields = {
      task_intent: this.buildFrozenField("task_intent", semanticIntentDraft, resolvedFields),
      scope: this.buildFrozenField("scope", semanticIntentDraft, resolvedFields),
      completion_criteria: this.buildFrozenField("completion_criteria", semanticIntentDraft, resolvedFields),
      final_action: this.buildFrozenField("final_action", semanticIntentDraft, resolvedFields),
    };
    const remainingUnresolved = (Object.keys(coreFields) as SemanticCoreFieldKey[]).filter(
      (field) => coreFields[field].status !== "frozen"
    );
    const compileEligibility =
      remainingUnresolved.length > 0
        ? {
            eligible: false,
            reason: "core_fields_pending_user_freeze",
          }
        : this.assessFrozenCompileEligibility(behaviorWorkflow, coreFields);
    return {
      schemaVersion: "frozen_semantic_intent.v1",
      coreFields,
      supportingHypotheses: {
        selection: [...semanticIntentDraft.supportingHypotheses.selection],
        skip: [...semanticIntentDraft.supportingHypotheses.skip],
        branch: [...semanticIntentDraft.supportingHypotheses.branch],
      },
      actionPurposeHypotheses: [...semanticIntentDraft.actionPurposeHypotheses],
      noiseObservations: [...semanticIntentDraft.noiseObservations],
      frozenFrom: {
        semanticIntentDraft: "semantic_intent_draft.json",
        intentResolution: intentResolution ? "intent_resolution.json" : null,
      },
      remainingUnresolved,
      compileEligibility,
    };
  }

  private buildFrozenField(
    field: SemanticCoreFieldKey,
    semanticIntentDraft: SemanticIntentDraft,
    resolvedFields: Record<string, boolean | string>
  ): FrozenSemanticIntentV1["coreFields"][SemanticCoreFieldKey] {
    const resolvedValue = this.readResolvedCoreFieldValue(field, resolvedFields);
    const draftField = semanticIntentDraft.coreFields[field];
    const question = semanticIntentDraft.clarificationRequirements.find((item) => item.field === field);
    if (resolvedValue) {
      return {
        value: resolvedValue,
        status: "frozen",
        source: "user_answer",
        derivedFromQuestionId: question?.questionId,
        evidenceRefs: [...draftField.evidenceRefs],
      };
    }
    return {
      status: "unresolved",
      source: "semantic_hypothesis",
      evidenceRefs: [...draftField.evidenceRefs],
    };
  }

  private buildExecutionGuide(
    runId: string,
    intentSeed: IntentSeed,
    abstractionInput: AbstractionInput,
    behaviorWorkflow: BehaviorWorkflow,
    semanticIntentDraft: SemanticIntentDraft | undefined,
    frozenSemanticIntent: FrozenSemanticIntentV1 | undefined,
    clarificationQuestions: ClarificationQuestionsV2 | undefined,
    status: CompactManifestStatus
  ): ExecutionGuideV1 {
    const frozenCompileContext = this.buildFrozenCompileContext(
      behaviorWorkflow,
      semanticIntentDraft,
      frozenSemanticIntent
    );
    const semanticState = this.resolveSemanticState(intentSeed, abstractionInput, semanticIntentDraft, frozenSemanticIntent);
    const workflowOutline = this.buildWorkflowOutline(
      behaviorWorkflow,
      semanticIntentDraft,
      frozenCompileContext
    );
    const semanticConstraints = this.buildSemanticConstraints(
      semanticState,
      semanticIntentDraft,
      frozenSemanticIntent,
      abstractionInput
    );
    const doneCriteria = this.buildDoneCriteria(semanticState, frozenSemanticIntent, frozenCompileContext);
    const stepDetails = this.buildStepDetails(behaviorWorkflow, semanticIntentDraft, frozenCompileContext);
    const branchHints = this.buildBranchHints(behaviorWorkflow, frozenSemanticIntent, frozenCompileContext);
    const unresolvedQuestions = this.buildUnresolvedQuestions(
      semanticIntentDraft,
      frozenSemanticIntent,
      clarificationQuestions,
      frozenCompileContext
    );

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
        resolutionNotes: this.buildResolutionNotes(frozenSemanticIntent, frozenCompileContext),
        unresolvedQuestions,
      },
    };
  }

  private resolveSemanticState(
    intentSeed: IntentSeed,
    abstractionInput: AbstractionInput,
    semanticIntentDraft: SemanticIntentDraft | undefined,
    frozenSemanticIntent?: FrozenSemanticIntentV1
  ): {
    goal: string;
    scope: string;
    completion: string;
    selection: string[];
    skip: string[];
    resolutionRules: string[];
  } {
    const coreFieldsFrozen = (frozenSemanticIntent?.remainingUnresolved.length ?? 1) === 0;
    if (!coreFieldsFrozen) {
      const siteLabel = abstractionInput.site || "当前站点";
      const surfaceLabel = abstractionInput.surface || intentSeed.surface || "current_workflow_surface";
      return {
        goal: `当前示教看起来是在 ${siteLabel} 中定位目标对象并执行一段浏览流程；真实任务目标仍待用户冻结。`,
        scope: `先将范围保守限制在 ${surfaceLabel} 对应的当前工作区及其直接打开的候选对象，直到用户明确边界。`,
        completion: "在完成条件冻结前，不把任何单次 observed action 当作默认完成信号。",
        selection: [],
        skip: [],
        resolutionRules: ["核心语义字段未冻结前，不允许把当前 guide 当作 replay-ready 指令。"],
      };
    }
    return {
      goal: frozenSemanticIntent?.coreFields.task_intent.value ?? (intentSeed.rawTask.trim() || "执行当前浏览器任务"),
      scope:
        frozenSemanticIntent?.coreFields.scope.value ??
        `在 ${abstractionInput.site} 的 ${abstractionInput.surface} 工作区内处理与任务相关的对象。`,
      completion:
        frozenSemanticIntent?.coreFields.completion_criteria.value ??
        "相关对象已按当前任务要求处理完成，并出现可回读的页面完成信号。",
      selection: [...(frozenSemanticIntent?.supportingHypotheses.selection ?? [])],
      skip: [...(frozenSemanticIntent?.supportingHypotheses.skip ?? [])],
      resolutionRules: [
        ...(frozenSemanticIntent?.coreFields.final_action.value
          ? [`最终对象动作已冻结为：${frozenSemanticIntent.coreFields.final_action.value}`]
          : []),
        ...(frozenSemanticIntent && !frozenSemanticIntent.compileEligibility.eligible
          ? [`冻结语义已写入，但当前行为骨架仍存在映射缺口：${frozenSemanticIntent.compileEligibility.reason}`]
          : []),
      ],
    };
  }

  private buildWorkflowOutline(
    behaviorWorkflow: BehaviorWorkflow,
    semanticIntentDraft: SemanticIntentDraft | undefined,
    frozenCompileContext: FrozenCompileContext
  ): ExecutionGuideWorkflowOutlineStep[] {
    const purposeByStep = frozenCompileContext.allowPurposeHypotheses
      ? this.buildPurposeIndex(semanticIntentDraft)
      : new Map<string, string>();
    return behaviorWorkflow.steps.map((step) => ({
      stepId: step.id,
      primitive: step.primitive,
      summary: step.summary,
      purpose: frozenCompileContext.purposeOverrides.get(step.id) ?? purposeByStep.get(step.id) ?? step.summary,
      evidenceRefs: step.evidenceRefs,
    }));
  }

  private buildSemanticConstraints(
    semanticState: {
      selection: string[];
      skip: string[];
      resolutionRules: string[];
    },
    semanticIntentDraft: SemanticIntentDraft | undefined,
    frozenSemanticIntent: FrozenSemanticIntentV1 | undefined,
    abstractionInput: AbstractionInput
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
    if (!semanticIntentDraft || !(frozenSemanticIntent?.compileEligibility.eligible ?? false)) {
      pushConstraint("guardrail", "当前核心语义尚未完全冻结，只能把本 guide 作为保守参考，不能直接放行 replay。");
    }
    for (const observation of abstractionInput.noiseObservations) {
      pushConstraint("guardrail", `已隔离噪音上下文：${observation.summary}`);
    }
    return constraints;
  }

  private buildDoneCriteria(
    semanticState: { completion: string },
    frozenSemanticIntent: FrozenSemanticIntentV1 | undefined,
    frozenCompileContext: FrozenCompileContext
  ): string[] {
    const criteria = [semanticState.completion];
    if (!(frozenSemanticIntent?.compileEligibility.eligible ?? false)) {
      criteria.push(
        frozenCompileContext.coreFieldsFrozen
          ? "当前冻结语义与行为骨架仍存在缺口；在 replay 前先解决 unresolvedQuestions 中的映射问题。"
          : "若完成标准仍不清晰，先进入澄清而不是继续假设。"
      );
    }
    return criteria;
  }

  private buildStepDetails(
    behaviorWorkflow: BehaviorWorkflow,
    semanticIntentDraft: SemanticIntentDraft | undefined,
    frozenCompileContext: FrozenCompileContext
  ): ExecutionGuideStepDetail[] {
    const purposeByStep = frozenCompileContext.allowPurposeHypotheses
      ? this.buildPurposeIndex(semanticIntentDraft)
      : new Map<string, string>();
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
      purpose: frozenCompileContext.purposeOverrides.get(step.id) ?? purposeByStep.get(step.id) ?? step.summary,
      evidenceRefs: step.evidenceRefs,
      stepRole: this.resolveStepRole(
        step.id,
        branchPointSteps,
        loopSteps,
        submitSteps,
        verificationSteps,
        frozenCompileContext.forcedSubmitSteps,
        frozenCompileContext.optionalObservedActionSteps
      ),
    }));
  }

  private buildBranchHints(
    behaviorWorkflow: BehaviorWorkflow,
    frozenSemanticIntent: FrozenSemanticIntentV1 | undefined,
    frozenCompileContext: FrozenCompileContext
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
        ["scope"]
      );
    }
    for (const signalId of behaviorWorkflow.observedLoops) {
      pushHint(
        this.findBehaviorStepIdBySignal(behaviorWorkflow, signalId),
        "按当前选择范围逐个处理候选对象；若范围或停止条件不清晰，先看 unresolvedQuestions。",
        ["scope", "completion_criteria"]
      );
    }
    const finalActionValue = frozenCompileContext.finalActionValue ?? frozenSemanticIntent?.coreFields.final_action.value;
    const actionHintStepIds = new Set([
      ...behaviorWorkflow.submitPoints,
      ...frozenCompileContext.forcedSubmitSteps,
      ...frozenCompileContext.optionalObservedActionSteps,
    ]);
    for (const stepId of actionHintStepIds) {
      if (frozenCompileContext.optionalObservedActionSteps.has(stepId)) {
        pushHint(
          stepId,
          "该动作只在示教中被观察到；当前冻结语义要求仅浏览不操作，因此 replay 时不要把它当成必做步骤。",
          ["final_action", "completion_criteria"]
        );
        continue;
      }
      pushHint(
        stepId,
        frozenSemanticIntent?.compileEligibility.eligible && finalActionValue
          ? `仅在当前对象满足冻结范围和完成条件时执行该动作：${finalActionValue}`
          : finalActionValue
            ? `最终动作已冻结为“${finalActionValue}”，但当前动作槽位与行为骨架的映射仍需确认。`
            : "当前对象动作语义未冻结前，不要默认复用该 observed action。",
        ["final_action", "completion_criteria"]
      );
    }
    for (const stepId of behaviorWorkflow.verificationPoints) {
      pushHint(stepId, "回读页面状态，确认是否出现用户定义的完成信号或状态更新。", ["completion_criteria"]);
    }
    return hints;
  }

  private buildUnresolvedQuestions(
    semanticIntentDraft: SemanticIntentDraft | undefined,
    frozenSemanticIntent: FrozenSemanticIntentV1 | undefined,
    clarificationQuestions: ClarificationQuestionsV2 | undefined,
    frozenCompileContext: FrozenCompileContext
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
    const questionByField = new Map<string, ClarificationQuestionV2>();
    for (const question of clarificationQuestions?.questions ?? []) {
      questionByField.set(question.field, question);
    }
    const unresolved: ExecutionGuideUnresolvedQuestion[] = this.getUnresolvedSemanticUncertainties(
      semanticIntentDraft,
      frozenSemanticIntent
    ).map((uncertainty) => {
      const question = questionByField.get(uncertainty.field);
      return {
        field: uncertainty.field,
        severity: uncertainty.severity,
        reason: uncertainty.reason,
        question: question?.prompt,
        priority: question?.priority,
      };
    });
    if (
      frozenCompileContext.compatibilityQuestion &&
      !unresolved.some(
        (item) =>
          item.field === frozenCompileContext.compatibilityQuestion?.field &&
          item.reason === frozenCompileContext.compatibilityQuestion?.reason
      )
    ) {
      unresolved.push(frozenCompileContext.compatibilityQuestion);
    }
    return unresolved;
  }

  private buildPurposeIndex(
    semanticIntentDraft: SemanticIntentDraft | undefined
  ): Map<string, string> {
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
    frozenSemanticIntent: FrozenSemanticIntentV1 | undefined
  ): { high: number; medium: number; low: number } {
    const uncertainties = semanticIntentDraft
      ? [
          ...this.getUnresolvedSemanticUncertainties(semanticIntentDraft, frozenSemanticIntent),
          ...semanticIntentDraft.nonBlockingUncertainties,
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
    frozenSemanticIntent?: FrozenSemanticIntentV1
  ): SemanticUncertainty[] {
    if (!semanticIntentDraft) {
      return [];
    }
    const unresolved = new Set(frozenSemanticIntent?.remainingUnresolved ?? []);
    return semanticIntentDraft.blockingUncertainties.filter((uncertainty) => unresolved.has(uncertainty.field as SemanticCoreFieldKey));
  }

  private readResolvedCoreFieldValue(
    field: SemanticCoreFieldKey,
    resolvedFields: Record<string, boolean | string>
  ): string | undefined {
    for (const key of semanticCoreFieldAliases(field)) {
      const value = resolvedFields[key];
      if (typeof value !== "string" || value.trim().length === 0) {
        continue;
      }
      const validation = validateCoreFieldAnswer(field, value.trim());
      if (validation.accepted && validation.normalizedValue) {
        return validation.normalizedValue;
      }
    }
    return undefined;
  }

  private findBehaviorStepIdBySignal(behaviorWorkflow: BehaviorWorkflow, signalId: string): string | undefined {
    return behaviorWorkflow.steps.find((step) => step.evidenceRefs.includes(signalId))?.id;
  }

  private resolveStepRole(
    stepId: string,
    branchPointSteps: Set<string>,
    loopSteps: Set<string>,
    submitSteps: Set<string>,
    verificationSteps: Set<string>,
    forcedSubmitSteps: Set<string>,
    optionalObservedActionSteps: Set<string>
  ): ExecutionGuideStepDetail["stepRole"] {
    if (optionalObservedActionSteps.has(stepId)) {
      return "optional_observed_action";
    }
    if (forcedSubmitSteps.has(stepId) || submitSteps.has(stepId)) {
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
    behaviorWorkflow: BehaviorWorkflow,
    clarificationQuestions: ClarificationQuestionsV2 | undefined,
    intentResolution?: IntentResolution
  ): void {
    if (!semanticIntentDraft) {
      return;
    }
    const frozenSemanticIntent = this.buildFrozenSemanticIntent(semanticIntentDraft, behaviorWorkflow, intentResolution);
    const blockingFieldSet = new Set(
      this.getUnresolvedSemanticUncertainties(semanticIntentDraft, frozenSemanticIntent).map((uncertainty) => uncertainty.field)
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
      if (!blockingFieldSet.has(question.field)) {
        throw new Error(`clarification_coverage_check failed: missing blocking uncertainty for ${question.field}`);
      }
      coveredFields.add(question.field);
    }
    for (const field of blockingFieldSet) {
      if (!coveredFields.has(field)) {
        throw new Error(`clarification_coverage_check failed: missing question for ${field}`);
      }
    }
  }

  private ensureManifestConsistency(
    semanticIntentDraft: SemanticIntentDraft | undefined,
    frozenSemanticIntent: FrozenSemanticIntentV1 | undefined,
    observedExamples: ObservedExamples,
    manifest: CompactManifest
  ): void {
    const counts = this.summarizeUncertaintyCounts(semanticIntentDraft, frozenSemanticIntent);
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
    frozenSemanticIntent: FrozenSemanticIntentV1 | undefined,
    clarificationQuestions: ClarificationQuestionsV2 | undefined,
    status: CompactManifestStatus,
    pollutionDetected: boolean
  ): void {
    const hasBlocking = (frozenSemanticIntent?.remainingUnresolved.length ?? 0) > 0;
    const hasQuestions = (clarificationQuestions?.questions.length ?? 0) > 0;
    if (
      status === "ready_for_replay" &&
      (!frozenSemanticIntent?.compileEligibility.eligible || hasBlocking || pollutionDetected || hasQuestions)
    ) {
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
    frozenSemanticIntent: FrozenSemanticIntentV1 | undefined;
    clarificationQuestions?: ClarificationQuestionsV2;
  }): CompactManifestStatus {
    if (!input.frozenSemanticIntent) {
      return "rejected";
    }
    if (!input.frozenSemanticIntent.compileEligibility.eligible) {
      return "needs_clarification";
    }
    const hasBlocking = input.frozenSemanticIntent.remainingUnresolved.length > 0;
    if (hasBlocking) {
      return input.clarificationQuestions ? "needs_clarification" : "rejected";
    }
    if (input.clarificationQuestions?.questions.length) {
      return "needs_clarification";
    }
    return "ready_for_replay";
  }

  private assessFrozenCompileEligibility(
    behaviorWorkflow: BehaviorWorkflow,
    coreFields: FrozenSemanticIntentV1["coreFields"]
  ): FrozenSemanticIntentV1["compileEligibility"] {
    const finalActionValue = coreFields.final_action.value?.trim();
    if (!finalActionValue) {
      return {
        eligible: true,
        reason: "all_core_fields_frozen",
      };
    }
    if (this.classifyFinalAction(finalActionValue) === "browse_only") {
      return {
        eligible: true,
        reason: "all_core_fields_frozen",
      };
    }
    if (this.findCompatibleFinalActionStepIds(behaviorWorkflow, coreFields.final_action).length === 0) {
      return {
        eligible: false,
        reason: "missing_behavior_support_for_frozen_action",
      };
    }
    return {
      eligible: true,
      reason: "all_core_fields_frozen",
    };
  }

  private buildFrozenCompileContext(
    behaviorWorkflow: BehaviorWorkflow,
    semanticIntentDraft: SemanticIntentDraft | undefined,
    frozenSemanticIntent: FrozenSemanticIntentV1 | undefined
  ): FrozenCompileContext {
    const basePurposeByStep = this.buildPurposeIndex(semanticIntentDraft);
    const context: FrozenCompileContext = {
      coreFieldsFrozen: (frozenSemanticIntent?.remainingUnresolved.length ?? 1) === 0,
      allowPurposeHypotheses: (frozenSemanticIntent?.remainingUnresolved.length ?? 1) === 0,
      purposeOverrides: new Map<string, string>(),
      forcedSubmitSteps: new Set<string>(),
      optionalObservedActionSteps: new Set<string>(),
      resolutionNotes: [],
      finalActionValue: frozenSemanticIntent?.coreFields.final_action.value,
    };
    if (!frozenSemanticIntent || !context.coreFieldsFrozen) {
      return context;
    }

    const overridePurpose = (stepId: string | undefined, nextPurpose: string | undefined, basis: string): void => {
      if (!stepId || !nextPurpose?.trim()) {
        return;
      }
      const currentPurpose =
        context.purposeOverrides.get(stepId) ??
        basePurposeByStep.get(stepId) ??
        behaviorWorkflow.steps.find((step) => step.id === stepId)?.summary;
      context.purposeOverrides.set(stepId, nextPurpose);
      if (currentPurpose && currentPurpose.trim() !== nextPurpose.trim()) {
        context.resolutionNotes.push(
          `${stepId}: purpose overridden from "${this.clip(currentPurpose)}" to "${this.clip(
            nextPurpose
          )}" (basis=${basis})`
        );
      }
    };

    const locateStep = behaviorWorkflow.steps.find((step) => step.primitive === "locate_candidate");
    const loopStep = [...behaviorWorkflow.steps].reverse().find((step) => step.primitive === "iterate_collection");
    const verifyStep = [...behaviorWorkflow.steps].reverse().find((step) => step.primitive === "verify_outcome");

    overridePurpose(
      locateStep?.id,
      frozenSemanticIntent.coreFields.task_intent.value
        ? `围绕冻结后的任务目标定位对象：${frozenSemanticIntent.coreFields.task_intent.value}`
        : undefined,
      "frozen_semantic_intent.task_intent"
    );
    overridePurpose(
      loopStep?.id,
      frozenSemanticIntent.coreFields.scope.value
        ? `按冻结范围浏览候选内容：${frozenSemanticIntent.coreFields.scope.value}`
        : undefined,
      "frozen_semantic_intent.scope"
    );
    overridePurpose(
      verifyStep?.id,
      frozenSemanticIntent.coreFields.completion_criteria.value
        ? `检查是否满足完成条件：${frozenSemanticIntent.coreFields.completion_criteria.value}`
        : undefined,
      "frozen_semantic_intent.completion_criteria"
    );

    const finalActionValue = frozenSemanticIntent.coreFields.final_action.value?.trim();
    if (!finalActionValue) {
      return context;
    }

    if (this.classifyFinalAction(finalActionValue) === "browse_only") {
      const compatibleStepIds = this.findCompatibleFinalActionStepIds(
        behaviorWorkflow,
        frozenSemanticIntent.coreFields.final_action
      );
      const browseOnlyStepIds =
        behaviorWorkflow.submitPoints.length > 0
          ? [...behaviorWorkflow.submitPoints]
          : compatibleStepIds.length > 0
            ? [compatibleStepIds[compatibleStepIds.length - 1]]
            : [];
      for (const stepId of browseOnlyStepIds) {
        context.optionalObservedActionSteps.add(stepId);
        overridePurpose(
          stepId,
          "该步骤仅作为示教中观察到的对象动作参考；当前冻结语义要求仅浏览不操作。",
          "frozen_semantic_intent.final_action"
        );
      }
      return context;
    }

    const compatibleStepIds = this.findCompatibleFinalActionStepIds(behaviorWorkflow, frozenSemanticIntent.coreFields.final_action);
    if (compatibleStepIds.length === 0) {
      context.compatibilityQuestion = {
        field: "final_action",
        severity: "high",
        reason: "最终对象动作已冻结，但当前行为骨架没有与之兼容的动作槽位，仍无法安全 replay。",
        question: "当前录制没有稳定观察到与该最终动作兼容的动作骨架。请确认是否仍需要这个动作；若需要，可能需要重新录制更清晰的示教。",
        priority: "P0",
      };
      return context;
    }

    const primaryActionStepId = compatibleStepIds[compatibleStepIds.length - 1];
    context.forcedSubmitSteps.add(primaryActionStepId);
    overridePurpose(
      primaryActionStepId,
      `执行冻结后的最终对象动作：${finalActionValue}`,
      "frozen_semantic_intent.final_action"
    );
    if (!behaviorWorkflow.submitPoints.includes(primaryActionStepId)) {
      context.resolutionNotes.push(
        `${primaryActionStepId}: observed generic step reused as final action slot for "${this.clip(
          finalActionValue
        )}" (basis=frozen_semantic_intent.final_action)`
      );
    }
    return context;
  }

  private buildResolutionNotes(
    frozenSemanticIntent: FrozenSemanticIntentV1 | undefined,
    frozenCompileContext: FrozenCompileContext
  ): string[] {
    const notes = [...frozenCompileContext.resolutionNotes];
    if (!frozenSemanticIntent) {
      notes.push("semantic intent draft missing; execution_guide compiled conservatively.");
      return notes;
    }
    if (frozenCompileContext.coreFieldsFrozen) {
      notes.unshift("core semantic fields frozen; execution_guide compiled from frozen_semantic_intent.json");
      if (!frozenSemanticIntent.compileEligibility.eligible) {
        notes.push(`replay gate remains blocked: ${frozenSemanticIntent.compileEligibility.reason}`);
      }
      return notes;
    }
    notes.unshift("core semantic fields are not fully frozen; execution_guide remains a placeholder compile");
    return notes;
  }

  private findCompatibleFinalActionStepIds(
    behaviorWorkflow: BehaviorWorkflow,
    finalActionField: FrozenSemanticIntentV1["coreFields"][SemanticCoreFieldKey]
  ): string[] {
    if (behaviorWorkflow.submitPoints.length > 0) {
      return [...behaviorWorkflow.submitPoints];
    }
    const relevantPrimitives = new Set<BehaviorPrimitive>(["inspect_state", "iterate_collection", "verify_outcome"]);
    const evidenceRefs = new Set(finalActionField.evidenceRefs);
    return behaviorWorkflow.steps
      .filter(
        (step) =>
          relevantPrimitives.has(step.primitive) && step.evidenceRefs.some((evidenceRef) => evidenceRefs.has(evidenceRef))
      )
      .map((step) => step.id);
  }

  private classifyFinalAction(value: string): "browse_only" | "action_required" | "unknown" {
    const normalized = this.normalizeSemanticText(value);
    const browseOnly = this.containsNormalizedCue(normalized, BROWSE_ONLY_ACTION_CUES);
    const explicitAction = this.containsNormalizedCue(normalized, EXPLICIT_OBJECT_ACTION_CUES);
    if (browseOnly && !explicitAction) {
      return "browse_only";
    }
    if (explicitAction) {
      return "action_required";
    }
    return "unknown";
  }

  private normalizeSemanticText(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[\s,，。.!！?？;；:："“”"'‘’()（）[\]【】]/g, "");
  }

  private containsNormalizedCue(value: string, cues: string[]): boolean {
    return cues.some((cue) => value.includes(cue.toLowerCase().replace(/\s+/g, "")));
  }

  private inferSurface(trace: SopTrace): string {
    const urls = trace.steps
      .map((step) => this.readStepUrl(step))
      .filter((value): value is string => Boolean(value));
    const firstUrl = urls.find((url) => this.isRelevantSurfaceUrl(url, trace.site)) ?? urls.find((url) => !this.isPlaceholderUrl(url));
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
    const inputValue = this.readString(step.input.value)?.toLowerCase() ?? "";
    const combined = `${selector} ${textHint} ${roleHint}`;
    return this.containsAny(`${combined} ${inputValue}`, SEARCH_KEYWORDS);
  }

  private isSubmitLikeTraceStep(trace: SopTrace, index: number): boolean {
    const step = trace.steps[index];
    if (!step) {
      return false;
    }
    if (step.action === "press_key" && step.target.value === "Enter") {
      return !this.isSearchSubmit(trace, index);
    }
    if (step.action !== "click") {
      return false;
    }
    const selector = step.target.type === "selector" ? step.target.value.toLowerCase() : "";
    const text = step.target.type === "text" ? step.target.value.toLowerCase() : "";
    const textHint = this.readString(step.input.textHint)?.toLowerCase() ?? "";
    return this.containsAny(`${selector} ${text} ${textHint}`, SUBMIT_KEYWORDS);
  }

  private isSearchSubmit(trace: SopTrace, index: number): boolean {
    const neighbors = trace.steps.slice(Math.max(0, index - 2), Math.min(trace.steps.length, index + 3));
    return neighbors.some((candidate) => candidate.action === "type" && this.looksLikeLocateTarget(candidate));
  }

  private hasVerificationCue(step: SopTraceStep): boolean {
    const assertionValue = step.assertionHint?.value?.toLowerCase() ?? "";
    const targetText = step.target.type === "text" ? step.target.value.toLowerCase() : "";
    const textHint = this.readString(step.input.textHint)?.toLowerCase() ?? "";
    return this.containsAny(`${assertionValue} ${targetText} ${textHint}`, SUCCESS_KEYWORDS);
  }

  private hasPostSubmitReview(trace: SopTrace): boolean {
    const submitIndex = trace.steps.findIndex((_, index) => this.isSubmitLikeTraceStep(trace, index));
    if (submitIndex < 0) {
      return false;
    }
    return trace.steps.slice(submitIndex + 1).some((step) => step.action === "click" || step.action === "navigate");
  }

  private readStepUrl(step: SopTraceStep): string | undefined {
    const targetUrl = step.target.type === "url" ? step.target.value.trim() : "";
    if (targetUrl) {
      return targetUrl;
    }
    const after = step.page.urlAfter.trim();
    if (after) {
      return after;
    }
    const before = step.page.urlBefore.trim();
    return before || undefined;
  }

  private isRelevantSurfaceUrl(url: string | undefined, site: string): boolean {
    if (!url || this.isPlaceholderUrl(url)) {
      return false;
    }
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      const target = site.toLowerCase();
      return hostname === target || hostname.endsWith(`.${target}`);
    } catch {
      return false;
    }
  }

  private isPlaceholderUrl(url: string | undefined): boolean {
    if (!url) {
      return true;
    }
    return url === "about:blank" || url.startsWith("chrome://");
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
