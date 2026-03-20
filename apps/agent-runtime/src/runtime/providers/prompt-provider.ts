/**
 * Deps: runtime/runtime-config.ts, runtime/system-prompts.ts
 * Used By: runtime/runtime-composition-root.ts
 * Last Updated: 2026-03-20
 */
import type { RuntimeConfig } from "../runtime-config.js";
import { REFINE_REACT_SYSTEM_PROMPT, RUN_OPERATOR_SYSTEM_PROMPT } from "../system-prompts.js";

export interface RuntimePromptBundle {
  runSystemPrompt: string;
  refineSystemPrompt: string;
}

export interface RefineStartPromptInput {
  task: string;
  guidance: string;
  resumeInstruction: string;
}

export class PromptProvider {
  resolve(config: Pick<RuntimeConfig, "runSystemPrompt" | "refineSystemPrompt">): RuntimePromptBundle {
    return {
      runSystemPrompt: config.runSystemPrompt ?? RUN_OPERATOR_SYSTEM_PROMPT,
      refineSystemPrompt: config.refineSystemPrompt ?? REFINE_REACT_SYSTEM_PROMPT,
    };
  }

  buildRefineStartPrompt(input: RefineStartPromptInput): string {
    return [
      `Task: ${input.task}`,
      input.guidance,
      input.resumeInstruction,
      "Use refine-react tools only.",
      "Call run.finish with reason and summary when done.",
      "If human help is required, call hitl.request with explicit prompt.",
    ]
      .filter((line) => line.trim().length > 0)
      .join("\n\n");
  }
}
