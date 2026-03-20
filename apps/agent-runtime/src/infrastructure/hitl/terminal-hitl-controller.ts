/**
 * Deps: node:process, node:readline/promises, contracts/hitl-controller.ts, domain/intervention-learning.ts
 * Used By: runtime/workflow-runtime.ts
 * Last Updated: 2026-03-20
 */
import process from "node:process";
import readline from "node:readline/promises";

import type { HitlController } from "../../contracts/hitl-controller.js";
import type {
  HitlInterventionRequest,
  HitlInterventionResponse,
  InterventionIssueType,
} from "../../domain/intervention-learning.js";

const DEFAULT_HUMAN_ACTION = "Operator confirmed manual browser correction.";
const DEFAULT_NEXT_TIME_RULE = "If this blocker appears again, request focused human correction and continue from current page state.";
const DEFAULT_RESUME_INSTRUCTION = "Continue from the current browser state and finish the remaining task.";

const ISSUE_TYPE_GUIDANCE: Record<InterventionIssueType, string> = {
  no_page_change:
    "The previous action did not produce the expected page transition, so I need human guidance to choose the next stable anchor.",
  tool_error:
    "A tool-level execution problem blocked progress, so manual correction is needed before safe continuation.",
  uncertain_state:
    "I am uncertain about the current page state and need a human sanity check before continuing.",
  validation_fail:
    "The observed result did not satisfy the expected success criteria, so I need human confirmation on the right correction path.",
};

function normalizeSentence(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed;
}

export function renderTerminalHitlNarrative(request: HitlInterventionRequest): string {
  const lines: string[] = [];
  lines.push("\n=== Human Help Needed ===");
  lines.push(`Run ${request.runId} (attempt ${request.attempt}) is paused for manual assistance.`);
  lines.push(`I am working on: ${normalizeSentence(request.operationIntent, "the current task")}`);
  lines.push(`I got blocked because: ${normalizeSentence(request.failureReason, "the latest action could not continue safely")}`);
  lines.push(ISSUE_TYPE_GUIDANCE[request.issueType]);
  lines.push(`Current observed state before pause: ${normalizeSentence(request.beforeState, "(unavailable)")}`);

  if (request.context.elementHint?.trim()) {
    lines.push(`Potential target hint: ${request.context.elementHint.trim()}`);
  }
  if (request.context.inputVariable?.trim()) {
    lines.push(`Input variable hint: ${request.context.inputVariable.trim()}`);
  }

  lines.push("Please complete the correction directly in the visible browser window, then continue here.");
  lines.push("");
  return lines.join("\n");
}

export class TerminalHitlController implements HitlController {
  async requestIntervention(request: HitlInterventionRequest): Promise<HitlInterventionResponse> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("HITL requires an interactive terminal (TTY)");
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      process.stdout.write(renderTerminalHitlNarrative(request));
      await rl.question("Press Enter after the manual correction is done in the browser.");
      const operatorNote = (
        await rl.question(
          "Optional: add one natural-language note for what changed or what the agent should do next (press Enter to continue from current state): "
        )
      ).trim();

      return {
        humanAction: operatorNote ? `Operator note: ${operatorNote}` : DEFAULT_HUMAN_ACTION,
        nextTimeRule: operatorNote
          ? `If a similar blocker appears, follow this operator guidance: ${operatorNote}`
          : DEFAULT_NEXT_TIME_RULE,
        resumeInstruction: operatorNote || DEFAULT_RESUME_INSTRUCTION,
      };
    } finally {
      rl.close();
    }
  }
}
