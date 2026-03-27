import { hitlRequestTool } from "./definitions/hitl-request-tool.js";
import { knowledgeRecordCandidateTool } from "./definitions/knowledge-record-candidate-tool.js";
import { runFinishTool } from "./definitions/run-finish-tool.js";
import { skillReaderTool } from "./definitions/skill-reader-tool.js";
import { RefineToolRegistry } from "./refine-tool-registry.js";

export interface RefineRuntimeToolRegistryOptions {
  includeSkillReader?: boolean;
}

export function createRefineRuntimeToolRegistry(
  options: RefineRuntimeToolRegistryOptions = {}
): RefineToolRegistry {
  const definitions = [hitlRequestTool, knowledgeRecordCandidateTool, runFinishTool];
  if (options.includeSkillReader) {
    definitions.push(skillReaderTool);
  }
  return new RefineToolRegistry({
    definitions,
  });
}
