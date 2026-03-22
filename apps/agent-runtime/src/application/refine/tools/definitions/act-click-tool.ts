import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserProvider } from "../providers/refine-browser-provider.js";

const ACT_CLICK_DESCRIPTION = "Click a UI element from a specific source observation.";
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
    return (await readBrowserProvider(context).clickFromObservation({
      elementRef: readStringArg(args, "elementRef"),
      sourceObservationRef: readStringArg(args, "sourceObservationRef"),
    })) as unknown as ToolCallResult;
  },
};

function readBrowserProvider(context: RefineToolContext): RefineBrowserProvider {
  const browser = context.browser;
  if (!browser || typeof browser !== "object" || typeof (browser as RefineBrowserProvider).clickFromObservation !== "function") {
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
