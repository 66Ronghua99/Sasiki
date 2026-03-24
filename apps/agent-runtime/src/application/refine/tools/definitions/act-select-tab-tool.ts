import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserService } from "../services/refine-browser-service.js";

const ACT_SELECT_TAB_DESCRIPTION =
  "Switch the active browser tab using a source observation for provenance. This does not mint a new observationRef, so call observe.page after switching before the next structural query or action.";
const ACT_SELECT_TAB_SCHEMA = {
  type: "object",
  properties: {
    tabIndex: { type: "integer", minimum: 0 },
    sourceObservationRef: { type: "string" },
  },
  required: ["tabIndex", "sourceObservationRef"],
  additionalProperties: false,
} as const;

export const actSelectTabTool: RefineToolDefinition = {
  name: "act.select_tab",
  description: ACT_SELECT_TAB_DESCRIPTION,
  inputSchema: ACT_SELECT_TAB_SCHEMA,
  async invoke(args, context) {
    return (await readBrowserService(context).switchActiveTab({
      tabIndex: readRequiredNonNegativeIntegerArg(args, "tabIndex"),
      sourceObservationRef: readStringArg(args, "sourceObservationRef"),
    })) as unknown as ToolCallResult;
  },
};

function readBrowserService(context: RefineToolContext): RefineBrowserService {
  const browserService = context.browserService;
  if (
    !browserService ||
    typeof browserService !== "object" ||
    typeof (browserService as RefineBrowserService).switchActiveTab !== "function"
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

function readRequiredNonNegativeIntegerArg(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`missing required argument: ${key}`);
  }
  const normalized = Math.floor(value);
  if (normalized < 0) {
    throw new Error(`invalid argument: ${key}=${value}`);
  }
  return normalized;
}
