import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserProvider } from "../providers/refine-browser-provider.js";

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
    return (await readBrowserProvider(context).typeIntoElement({
      elementRef: readStringArg(args, "elementRef"),
      sourceObservationRef: readStringArg(args, "sourceObservationRef"),
      text: readStringArg(args, "text"),
      submit: readBooleanArg(args, "submit"),
    })) as unknown as ToolCallResult;
  },
};

function readBrowserProvider(context: RefineToolContext): RefineBrowserProvider {
  const browser = context.browser;
  if (!browser || typeof browser !== "object" || typeof (browser as RefineBrowserProvider).typeIntoElement !== "function") {
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

function readBooleanArg(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
}
