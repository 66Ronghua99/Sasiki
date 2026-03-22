import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserProvider } from "../providers/refine-browser-provider.js";

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
    return (await readBrowserProvider(context).navigateFromObservation({
      url: readStringArg(args, "url"),
      sourceObservationRef: readStringArg(args, "sourceObservationRef"),
    })) as unknown as ToolCallResult;
  },
};

function readBrowserProvider(context: RefineToolContext): RefineBrowserProvider {
  const browser = context.browser;
  if (!browser || typeof browser !== "object" || typeof (browser as RefineBrowserProvider).navigateFromObservation !== "function") {
    throw new Error("refine browser provider is required");
  }
  return browser as RefineBrowserProvider;
}

function readStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`missing required argument: ${key}`);
  }
  return value.trim();
}
