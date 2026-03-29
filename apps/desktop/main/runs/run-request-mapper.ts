import type { CompactRunInput, ObserveRunInput, RefineRunInput } from "../../shared/runs";

type DesktopRuntimeSemanticMode = "off" | "auto" | "on";

export function mapObserveInput(input: ObserveRunInput): { task: string } {
  return { task: input.task };
}

export function mapCompactInput(
  input: CompactRunInput,
): { runId: string; semanticMode?: DesktopRuntimeSemanticMode } {
  return {
    runId: input.sourceRunId,
    semanticMode: mapCompactSemanticMode(input.semanticMode),
  };
}

export function mapRefineInput(input: RefineRunInput): {
  task?: string;
  skillName?: string;
  resumeRunId?: string;
} {
  return {
    task: input.task,
    skillName: input.skillName,
    resumeRunId: input.resumeRunId,
  };
}

function mapCompactSemanticMode(
  mode: CompactRunInput["semanticMode"],
): DesktopRuntimeSemanticMode | undefined {
  if (mode === "preserve") {
    return "on";
  }
  if (mode === "summarize") {
    return "auto";
  }
  return undefined;
}
