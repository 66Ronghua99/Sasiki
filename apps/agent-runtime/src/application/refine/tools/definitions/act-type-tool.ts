import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserService } from "../services/refine-browser-service.js";

const ACT_TYPE_DESCRIPTION = "Type text into a UI element from a specific source observation.";
const ACT_TYPE_SCHEMA = {
  type: "object",
  properties: {
    elementRef: { type: "string" },
    sourceObservationRef: { type: "string" },
    text: { type: "string" },
    submit: { type: "boolean" },
  },
  required: ["elementRef", "sourceObservationRef", "text"],
  additionalProperties: false,
} as const;

export const actTypeTool: RefineToolDefinition = {
  name: "act.type",
  description: ACT_TYPE_DESCRIPTION,
  inputSchema: ACT_TYPE_SCHEMA,
  async invoke(args, context) {
    return (await readBrowserService(context).typeIntoElement({
      elementRef: readStringArg(args, "elementRef"),
      sourceObservationRef: readStringArg(args, "sourceObservationRef"),
      text: readStringArg(args, "text"),
      submit: readBooleanArg(args, "submit"),
    })) as unknown as ToolCallResult;
  },
};

function readBrowserService(context: RefineToolContext): RefineBrowserService {
  const browserService = context.browserService;
  if (
    !browserService ||
    typeof browserService !== "object" ||
    typeof (browserService as RefineBrowserService).typeIntoElement !== "function"
  ) {
    throw new Error("refine browser service is required");
  }
  return browserService as RefineBrowserService;
}

function readStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`missing required argument: ${key}`);
  }
  return value.trim();
}

function readBooleanArg(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
}
