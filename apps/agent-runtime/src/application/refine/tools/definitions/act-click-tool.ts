import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserService } from "../services/refine-browser-service.js";

const ACT_CLICK_DESCRIPTION =
  "Click a UI element from a specific source observation. If the click changes page state or opens a new tab, re-observe (and switch tabs if needed) before the next structural step.";
const ACT_CLICK_SCHEMA = {
  type: "object",
  properties: {
    elementRef: { type: "string" },
    sourceObservationRef: { type: "string" },
  },
  required: ["elementRef", "sourceObservationRef"],
  additionalProperties: false,
} as const;

export const actClickTool: RefineToolDefinition = {
  name: "act.click",
  description: ACT_CLICK_DESCRIPTION,
  inputSchema: ACT_CLICK_SCHEMA,
  async invoke(args, context) {
    return (await readBrowserService(context).clickFromObservation({
      elementRef: readStringArg(args, "elementRef"),
      sourceObservationRef: readStringArg(args, "sourceObservationRef"),
    })) as unknown as ToolCallResult;
  },
};

function readBrowserService(context: RefineToolContext): RefineBrowserService {
  const browserService = context.browserService;
  if (
    !browserService ||
    typeof browserService !== "object" ||
    typeof (browserService as RefineBrowserService).clickFromObservation !== "function"
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
