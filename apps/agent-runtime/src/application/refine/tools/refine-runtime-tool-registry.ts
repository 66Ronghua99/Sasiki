import { hitlRequestTool } from "./definitions/hitl-request-tool.js";
import { knowledgeRecordCandidateTool } from "./definitions/knowledge-record-candidate-tool.js";
import { runFinishTool } from "./definitions/run-finish-tool.js";
import { RefineToolRegistry } from "./refine-tool-registry.js";

export const REFINE_RUNTIME_TOOL_ORDER = [
  "hitl.request",
  "knowledge.record_candidate",
  "run.finish",
] as const;

export function createRefineRuntimeToolRegistry(): RefineToolRegistry {
  return new RefineToolRegistry({
    definitions: [hitlRequestTool, knowledgeRecordCandidateTool, runFinishTool],
    orderedToolNames: REFINE_RUNTIME_TOOL_ORDER,
  });
}
