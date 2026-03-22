import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserProvider } from "../providers/refine-browser-provider.js";

const ACT_SELECT_TAB_DESCRIPTION = "Switch active browser tab using a source observation for provenance.";
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
    return (await readBrowserProvider(context).switchActiveTab({
      tabIndex: readRequiredNonNegativeIntegerArg(args, "tabIndex"),
      sourceObservationRef: readStringArg(args, "sourceObservationRef"),
    })) as unknown as ToolCallResult;
  },
};

function readBrowserProvider(context: RefineToolContext): RefineBrowserProvider {
  const browser = context.browser;
  if (!browser || typeof browser !== "object" || typeof (browser as RefineBrowserProvider).switchActiveTab !== "function") {
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
