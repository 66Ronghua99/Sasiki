import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserService } from "../services/refine-browser-service.js";

const ACT_NAVIGATE_DESCRIPTION = "Navigate the active tab to a URL from a specific source observation.";
const ACT_NAVIGATE_SCHEMA = {
  type: "object",
  properties: {
    url: { type: "string" },
    sourceObservationRef: { type: "string" },
  },
  required: ["url", "sourceObservationRef"],
  additionalProperties: false,
} as const;

export const actNavigateTool: RefineToolDefinition = {
  name: "act.navigate",
  description: ACT_NAVIGATE_DESCRIPTION,
  inputSchema: ACT_NAVIGATE_SCHEMA,
  async invoke(args, context) {
    return (await readBrowserService(context).navigateFromObservation({
      url: readStringArg(args, "url"),
      sourceObservationRef: readStringArg(args, "sourceObservationRef"),
    })) as unknown as ToolCallResult;
  },
};

function readBrowserService(context: RefineToolContext): RefineBrowserService {
  const browserService = context.browserService;
  if (
    !browserService ||
    typeof browserService !== "object" ||
    typeof (browserService as RefineBrowserService).navigateFromObservation !== "function"
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
