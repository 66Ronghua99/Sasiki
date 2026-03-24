/**
 * Deps: runtime-config.ts, application/refine/system-prompts.ts
 * Used By: application/shell/runtime-composition-root.ts, application/refine/refine-run-bootstrap-provider.ts
 * Last Updated: 2026-03-21
 */
import type { RuntimeConfig } from "../config/runtime-config.js";
import { REFINE_REACT_SYSTEM_PROMPT, RUN_OPERATOR_SYSTEM_PROMPT } from "./system-prompts.js";

export interface RuntimePromptBundle {
  runSystemPrompt: string;
  refineSystemPrompt: string;
}

export interface RefineStartPromptInput {
  task: string;
  guidance: string;
  resumeInstruction: string;
  initialObservation: {
    observationRef: string;
    page: {
      url: string;
      origin: string;
      normalizedPath: string;
      title: string;
    };
    activeTabIndex?: number;
    openTabCount?: number;
  };
}

export class PromptProvider {
  resolve(config: Pick<RuntimeConfig, "runSystemPrompt" | "refineSystemPrompt">): RuntimePromptBundle {
    return {
      runSystemPrompt: config.runSystemPrompt ?? RUN_OPERATOR_SYSTEM_PROMPT,
      refineSystemPrompt: config.refineSystemPrompt ?? REFINE_REACT_SYSTEM_PROMPT,
    };
  }

  buildRefineStartPrompt(input: RefineStartPromptInput): string {
    const initialObservationLines = [
      "Initial observation is already captured.",
      `- observationRef: ${input.initialObservation.observationRef}`,
      `- page: ${input.initialObservation.page.origin}${input.initialObservation.page.normalizedPath}`,
      `- url: ${input.initialObservation.page.url}`,
      `- title: ${input.initialObservation.page.title}`,
      typeof input.initialObservation.activeTabIndex === "number"
        ? `- activeTabIndex: ${input.initialObservation.activeTabIndex}`
        : "",
      typeof input.initialObservation.openTabCount === "number"
        ? `- openTabCount: ${input.initialObservation.openTabCount}`
        : "",
    ].filter((line) => line.trim().length > 0);

    const executionRules = [
      "Execution rules:",
      "- Reuse the provided observationRef until you explicitly call observe.page again.",
      "- observe.query only searches the latest captured snapshot. It does not refresh the page and does not mint a new observationRef.",
      "- After act.navigate, act.select_tab, or any click that changes page/tab context, call observe.page before the next structural query or action.",
      "- If a click opens a new tab, switch to the correct tab first, then observe.page before continuing.",
      "- When the task is to check whether inbox/work items exist, a verified empty state after checking the relevant tabs or filters is a valid completion. Summarize what was checked, then call run.finish.",
    ];

    return [
      `Task: ${input.task}`,
      initialObservationLines.join("\n"),
      input.guidance,
      input.resumeInstruction,
      executionRules.join("\n"),
      "Use refine-react tools only.",
      "Call run.finish with reason and summary when done.",
      "If human help is required, call hitl.request with explicit prompt.",
    ]
      .filter((line) => line.trim().length > 0)
      .join("\n\n");
  }
}
