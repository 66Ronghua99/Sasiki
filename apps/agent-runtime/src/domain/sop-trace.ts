/**
 * Deps: domain/runtime-errors.ts
 * Used By: core/sop-demonstration-recorder.ts, runtime/artifacts-writer.ts
 * Last Updated: 2026-03-04
 */
import { RuntimeError } from "./runtime-errors.js";

export const SOP_TRACE_VERSION = "v0" as const;
const SOP_ACTIONS = ["navigate", "click", "type", "press_key", "scroll", "wait"] as const;

export type SopAction = (typeof SOP_ACTIONS)[number];

export interface DemonstrationRawEvent {
  eventId: string;
  timestamp: string;
  type: "navigate" | "click" | "input" | "keydown" | "scroll" | "wait";
  url: string;
  tabId: string;
  openerTabId?: string;
  payload: Record<string, unknown>;
}

export interface SopTraceStep {
  stepIndex: number;
  timestamp: string;
  action: SopAction;
  tabId: string;
  target: { type: "url" | "selector" | "text" | "key"; value: string };
  input: Record<string, unknown>;
  page: { urlBefore: string; urlAfter: string };
  assertionHint?: { type: string; value: string };
  rawRef: string;
}

export interface SopTrace {
  traceVersion: typeof SOP_TRACE_VERSION;
  traceId: string;
  mode: "observe";
  site: string;
  singleTabOnly: boolean;
  taskHint: string;
  steps: SopTraceStep[];
}

export function validateSopTrace(trace: SopTrace): void {
  assertTraceMetadata(trace);
  assertTraceSteps(trace.steps);
}

function assertTraceMetadata(trace: SopTrace): void {
  assertSchemaCondition(
    trace.traceVersion === SOP_TRACE_VERSION,
    "traceVersion must be v0",
    { traceVersion: trace.traceVersion }
  );
  assertSchemaCondition(trace.mode === "observe", "mode must be observe", { mode: trace.mode });
  assertSchemaCondition(typeof trace.singleTabOnly === "boolean", "singleTabOnly must be boolean", {
    singleTabOnly: trace.singleTabOnly,
  });
}

function assertTraceSteps(steps: SopTraceStep[]): void {
  const actionSet = new Set<SopAction>(SOP_ACTIONS);
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  steps.forEach((step, index) => {
    const expectedStepIndex = index + 1;
    assertSchemaCondition(
      step.stepIndex === expectedStepIndex,
      "stepIndex must be contiguous and start from 1",
      { stepIndex: step.stepIndex, expectedStepIndex }
    );
    assertSchemaCondition(actionSet.has(step.action), "action must be in v0 vocabulary", { action: step.action });
    assertSchemaCondition(step.rawRef.trim().length > 0, "rawRef is required", { stepIndex: step.stepIndex });
    const currentTimestamp = Date.parse(step.timestamp);
    assertSchemaCondition(Number.isFinite(currentTimestamp), "timestamp must be valid ISO-8601", {
      stepIndex: step.stepIndex,
      timestamp: step.timestamp,
    });
    assertSchemaCondition(currentTimestamp >= previousTimestamp, "steps must be time-ordered", {
      stepIndex: step.stepIndex,
      timestamp: step.timestamp,
    });
    previousTimestamp = currentTimestamp;
  });
}

function assertSchemaCondition(
  condition: boolean,
  message: string,
  detail?: Record<string, unknown>
): asserts condition {
  if (!condition) {
    throw new RuntimeError("SOP_TRACE_SCHEMA_INVALID", message, detail);
  }
}
