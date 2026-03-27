/**
 * Deps: runtime-config.ts, application/refine/system-prompts.ts
 * Used By: application/shell/runtime-composition-root.ts, application/refine/refine-run-bootstrap-provider.ts
 * Last Updated: 2026-03-27
 */
import type { RuntimeConfig } from "../config/runtime-config.js";
import type { SopSkillMetadata } from "../../domain/sop-skill.js";
import { REFINE_REACT_SYSTEM_PROMPT, RUN_OPERATOR_SYSTEM_PROMPT } from "./system-prompts.js";

export interface RuntimePromptBundle {
  runSystemPrompt: string;
  refineSystemPrompt: string;
}

export interface RefineStartPromptInput {
  task: string;
  guidance: string;
  availableSkills: SopSkillMetadata[];
  selectedSkillName?: string;
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
      "- Available SOP skills are durable workflow knowledge about reusable workflows, not optional background noise.",
      "- A skill explains when a workflow applies, what outcome it is for, durable constraints, likely recovery cues, and valid completion signals.",
      "- These startup SOP entries are metadata only; the durable workflow body is not preloaded.",
      "- Use skill.reader proactively and early when a requested or clearly relevant SOP skill applies, or when you need to disambiguate recovery or completion behavior.",
      "- Reuse the provided observationRef until you explicitly call observe.page again.",
      "- observe.query only searches the latest captured snapshot. It does not refresh the page and does not mint a new observationRef.",
      input.selectedSkillName
        ? `- Load the requested SOP body with skill.reader early before you rely on ${input.selectedSkillName}-specific details.`
        : "- If an SOP skill looks relevant from the task, page, or available metadata, use skill.reader to load its durable body before relying on SOP-specific details.",
      "- Metadata is only the skill index, not the full workflow. Read the body before inventing skill-specific fallback logic or declaring a workflow-specific done state.",
      "- Treat the user task as the desired outcome, not as a place to request fallback navigation scripts or redirect playbooks.",
      "- After act.navigate, act.select_tab, or any click that changes page/tab context, call observe.page before the next structural query or action.",
      "- If a click opens a new tab, switch to the correct tab first, then observe.page before continuing.",
      "- If navigation lands on an unexpected page, redirect, or path mismatch, recover with fresh observation and the relevant SOP guidance instead of waiting for the user to author fallback instructions.",
      "- If fresh observation disagrees with a skill, stay grounded in the page state and adapt; the skill should inform reasoning, not override live evidence.",
      "- A corroborated empty state after checking the relevant tabs or filters is a valid completion. Corroboration can come from visible empty-state DOM or consistent pageKnowledge cues. Summarize what was checked, then call run.finish.",
    ];
    const availableSkillsLines =
      input.availableSkills.length > 0
        ? [
            "Available SOP skills:",
            ...input.availableSkills.map((skill) => `- ${skill.name}: ${skill.description}`),
          ]
        : [];
    const selectedSkillLines = input.selectedSkillName ? [`Requested SOP skill: ${input.selectedSkillName}`] : [];

    return [
      `Task: ${input.task}`,
      initialObservationLines.join("\n"),
      availableSkillsLines.join("\n"),
      selectedSkillLines.join("\n"),
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
