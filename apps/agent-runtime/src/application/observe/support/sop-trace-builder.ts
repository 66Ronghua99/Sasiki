/**
 * Deps: domain/runtime-errors.ts, domain/sop-trace.ts
 * Used By: application/observe/support/sop-demonstration-recorder.ts
 * Last Updated: 2026-03-21
 */
import { RuntimeError } from "../../../domain/runtime-errors.js";
import type { DemonstrationRawEvent, SopTrace, SopTraceStep } from "../../../domain/sop-trace.js";
import { SOP_TRACE_VERSION, validateSopTrace } from "../../../domain/sop-trace.js";

export interface BuildTraceInput {
  traceId: string;
  taskHint: string;
  site: string;
  rawEvents: DemonstrationRawEvent[];
}

const WAIT_GAP_MS = 1500;

export class SopTraceBuilder {
  build(input: BuildTraceInput): SopTrace {
    const orderedEvents = this.sortRawEvents(input.rawEvents);
    if (orderedEvents.length === 0) {
      throw new RuntimeError("OBSERVE_NO_EVENTS_CAPTURED", "no demonstration events captured");
    }

    const steps: SopTraceStep[] = [];
    let previousUrl = orderedEvents[0]?.url ?? "";
    let previousTime = this.parseTimestamp(orderedEvents[0]?.timestamp);

    for (const event of orderedEvents) {
      const currentTime = this.parseTimestamp(event.timestamp);
      if (this.shouldInsertWaitStep(previousTime, currentTime, steps.length)) {
        steps.push(this.createWaitStep(steps.length + 1, event, previousUrl));
      }

      const step = this.mapRawEventToStep(steps.length + 1, event, previousUrl);
      steps.push(step);
      previousUrl = step.page.urlAfter || previousUrl;
      previousTime = currentTime;
    }

    const uniqueTabs = new Set(orderedEvents.map((event) => event.tabId).filter((value) => value.trim().length > 0));
    const trace: SopTrace = {
      traceVersion: SOP_TRACE_VERSION,
      traceId: input.traceId,
      mode: "observe",
      site: input.site,
      singleTabOnly: uniqueTabs.size <= 1,
      taskHint: input.taskHint,
      steps,
    };
    validateSopTrace(trace);
    return trace;
  }

  private sortRawEvents(rawEvents: DemonstrationRawEvent[]): DemonstrationRawEvent[] {
    return [...rawEvents].sort((left, right) => {
      const byTime = this.parseTimestamp(left.timestamp) - this.parseTimestamp(right.timestamp);
      if (byTime !== 0) {
        return byTime;
      }
      return left.eventId.localeCompare(right.eventId);
    });
  }

  private mapRawEventToStep(stepIndex: number, event: DemonstrationRawEvent, urlBefore: string): SopTraceStep {
    const urlAfter = event.url || urlBefore;
    const selector = this.readString(event.payload.selector);
    const text = this.readString(event.payload.text);

    if (event.type === "navigate") {
      return {
        stepIndex,
        timestamp: event.timestamp,
        action: "navigate",
        tabId: event.tabId,
        target: { type: "url", value: urlAfter || "about:blank" },
        input: {},
        page: { urlBefore, urlAfter },
        rawRef: event.eventId,
      };
    }

    if (event.type === "click") {
      const roleHint = this.readString(event.payload.role);
      return {
        stepIndex,
        timestamp: event.timestamp,
        action: "click",
        tabId: event.tabId,
        target: selector
          ? { type: "selector", value: selector }
          : { type: "text", value: text ?? "clicked element" },
        input: { roleHint, textHint: text ?? "" },
        page: { urlBefore, urlAfter },
        assertionHint: text ? { type: "text_visible", value: text } : undefined,
        rawRef: event.eventId,
      };
    }

    if (event.type === "input") {
      return {
        stepIndex,
        timestamp: event.timestamp,
        action: "type",
        tabId: event.tabId,
        target: selector
          ? { type: "selector", value: selector }
          : { type: "text", value: text ?? "input target" },
        input: { value: this.readString(event.payload.value) ?? "" },
        page: { urlBefore, urlAfter },
        rawRef: event.eventId,
      };
    }

    if (event.type === "keydown") {
      const key = this.readString(event.payload.key) ?? "Enter";
      return {
        stepIndex,
        timestamp: event.timestamp,
        action: "press_key",
        tabId: event.tabId,
        target: { type: "key", value: key },
        input: {},
        page: { urlBefore, urlAfter },
        rawRef: event.eventId,
      };
    }

    if (event.type === "scroll") {
      return {
        stepIndex,
        timestamp: event.timestamp,
        action: "scroll",
        tabId: event.tabId,
        target: { type: "text", value: "window" },
        input: {
          x: this.readNumber(event.payload.x) ?? 0,
          y: this.readNumber(event.payload.y) ?? 0,
        },
        page: { urlBefore, urlAfter },
        rawRef: event.eventId,
      };
    }

    return this.createWaitStep(stepIndex, event, urlBefore);
  }

  private createWaitStep(stepIndex: number, event: DemonstrationRawEvent, url: string): SopTraceStep {
    return {
      stepIndex,
      timestamp: event.timestamp,
      action: "wait",
      tabId: event.tabId,
      target: { type: "text", value: "wait" },
      input: {},
      page: { urlBefore: url, urlAfter: event.url || url },
      rawRef: event.eventId,
    };
  }

  private shouldInsertWaitStep(previousTime: number, currentTime: number, existingSteps: number): boolean {
    if (existingSteps === 0 || !Number.isFinite(previousTime) || !Number.isFinite(currentTime)) {
      return false;
    }
    return currentTime - previousTime >= WAIT_GAP_MS;
  }

  private parseTimestamp(value: string | undefined): number {
    if (!value) {
      return Number.NaN;
    }
    return Date.parse(value);
  }

  private readString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  private readNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }
}
