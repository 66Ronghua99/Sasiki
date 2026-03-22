import { hitlRequestTool } from "./definitions/hitl-request-tool.js";
import { knowledgeRecordCandidateTool } from "./definitions/knowledge-record-candidate-tool.js";
import { runFinishTool } from "./definitions/run-finish-tool.js";
import { RefineToolRegistry } from "./refine-tool-registry.js";

export function createRefineRuntimeToolRegistry(): RefineToolRegistry {
  return new RefineToolRegistry({
    definitions: [hitlRequestTool, knowledgeRecordCandidateTool, runFinishTool],
  });
}
