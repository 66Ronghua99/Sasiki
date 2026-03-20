/**
 * Deps: domain/sop-trace.ts, domain/sop-asset.ts
 * Used By: runtime/observe-support/sop-demonstration-recorder.ts
 * Last Updated: 2026-03-21
 */
import type { WebElementHint } from "../../domain/sop-asset.js";
import type { SopTrace, SopTraceStep } from "../../domain/sop-trace.js";

export class SopTraceGuideBuilder {
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
    const dedupe = new Set<string>();
    for (const step of trace.steps) {
      if (step.action !== "click" && step.action !== "type") {
        continue;
      }
      const purpose = `fallback_when_${step.action}_fails`;
      const selector = step.target.type === "selector" ? step.target.value : undefined;
      const textHint = step.target.type === "text" ? step.target.value : this.readString(step.input.textHint);
      const roleHint = this.readString(step.input.roleHint);
      if (!selector && !textHint && !roleHint) {
        continue;
      }
      const dedupeKey = [purpose, selector ?? "", textHint ?? "", roleHint ?? ""].join("|");
      if (dedupe.has(dedupeKey)) {
        continue;
      }
      dedupe.add(dedupeKey);
      hints.push({
        stepIndex: step.stepIndex,
        purpose,
        selector,
        textHint,
        roleHint,
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

  private readString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
  }
}
