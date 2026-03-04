/**
 * Deps: domain/runtime-errors.ts, domain/sop-trace.ts, domain/sop-asset.ts
 * Used By: runtime/agent-runtime.ts
 * Last Updated: 2026-03-04
 */
import { RuntimeError } from "../domain/runtime-errors.js";
import type { WebElementHint } from "../domain/sop-asset.js";
import type { DemonstrationRawEvent, SopTrace, SopTraceStep } from "../domain/sop-trace.js";
import { SOP_TRACE_VERSION, validateSopTrace } from "../domain/sop-trace.js";

export interface BuildTraceInput {
  traceId: string;
  taskHint: string;
  site: string;
  rawEvents: DemonstrationRawEvent[];
}

const WAIT_GAP_MS = 1500;

export class SopDemonstrationRecorder {
  buildTrace(input: BuildTraceInput): SopTrace {
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

    const trace: SopTrace = {
      traceVersion: SOP_TRACE_VERSION,
      traceId: input.traceId,
      mode: "observe",
      site: input.site,
      singleTabOnly: true,
      taskHint: input.taskHint,
      steps,
    };
    validateSopTrace(trace);
    return trace;
  }

  buildDraft(trace: SopTrace): string {
    const lines = [
      "# SOP Draft (Watch-Once v0)",
      "",
      `- traceId: ${trace.traceId}`,
      `- site: ${trace.site}`,
      `- taskHint: ${trace.taskHint}`,
      "",
      "## Steps",
      ...trace.steps.map((step) => `${step.stepIndex}. ${this.describeStep(step)}`),
      "",
      "## Execution Guide",
      "Follow the steps in order, verify page transitions after each interaction, and retry with Web element hints on failure.",
      "",
    ];
    return lines.join("\n");
  }

  buildWebElementHints(trace: SopTrace): WebElementHint[] {
    const hints: WebElementHint[] = [];
    for (const step of trace.steps) {
      if (step.action !== "click" && step.action !== "type") {
        continue;
      }
      const selector = step.target.type === "selector" ? step.target.value : undefined;
      const textHint = step.target.type === "text" ? step.target.value : this.readString(step.input.textHint);
      if (!selector && !textHint) {
        continue;
      }
      hints.push({
        stepIndex: step.stepIndex,
        purpose: `fallback_when_${step.action}_fails`,
        selector,
        textHint,
        roleHint: this.readString(step.input.roleHint),
      });
    }
    return hints;
  }

  buildTags(trace: SopTrace): string[] {
    const tags = new Set<string>();
    for (const step of trace.steps) {
      tags.add(step.action);
      if (step.action === "navigate") {
        tags.add("navigation");
      }
      if (step.action === "click" || step.action === "type") {
        tags.add("interaction");
      }
    }
    return [...tags];
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

  private describeStep(step: SopTraceStep): string {
    if (step.action === "navigate") {
      return `Navigate to ${step.target.value}.`;
    }
    if (step.action === "click") {
      return `Click ${step.target.type} "${step.target.value}".`;
    }
    if (step.action === "type") {
      return `Type into ${step.target.type} "${step.target.value}".`;
    }
    if (step.action === "press_key") {
      return `Press key "${step.target.value}".`;
    }
    if (step.action === "scroll") {
      return "Scroll the page to reveal target content.";
    }
    return "Wait for page state to stabilize.";
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
