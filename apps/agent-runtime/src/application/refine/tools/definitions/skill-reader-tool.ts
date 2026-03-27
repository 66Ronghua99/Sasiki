import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineSkillService } from "../services/refine-skill-service.js";

const SKILL_READER_DESCRIPTION = "List available SOP skills or load one selected SOP skill body by name.";
const SKILL_READER_SCHEMA = {
  type: "object",
  properties: {
    skillName: { type: "string" },
  },
  required: [],
  additionalProperties: false,
} as const;

export const skillReaderTool: RefineToolDefinition = {
  name: "skill.reader",
  description: SKILL_READER_DESCRIPTION,
  inputSchema: SKILL_READER_SCHEMA,
  async invoke(args, context) {
    const skillService = readSkillService(context);
    const skillName = readOptionalStringArg(args, "skillName");
    if (!skillName) {
      return {
        skills: await skillService.listSkills(),
      } as unknown as ToolCallResult;
    }
    return (await skillService.readSkill({ skillName })) as unknown as ToolCallResult;
  },
};

function readSkillService(context: RefineToolContext): RefineSkillService {
  const skillService = context.skillService;
  if (!skillService || typeof skillService !== "object" || typeof (skillService as RefineSkillService).readSkill !== "function") {
    throw new Error("refine skill service is required");
  }
  return skillService as RefineSkillService;
}

function readOptionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`invalid argument: ${key}`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`invalid argument: ${key}`);
  }
  return trimmed;
}
