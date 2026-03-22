import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserProvider } from "../providers/refine-browser-provider.js";

const OBSERVE_PAGE_DESCRIPTION = "Capture the latest page snapshot with page identity and tab metadata.";
const OBSERVE_PAGE_SCHEMA = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
} as const;

export const observePageTool: RefineToolDefinition = {
  name: "observe.page",
  description: OBSERVE_PAGE_DESCRIPTION,
  inputSchema: OBSERVE_PAGE_SCHEMA,
  async invoke(_args, context) {
    return (await readBrowserProvider(context).capturePageObservation()) as unknown as ToolCallResult;
  },
};

function readBrowserProvider(context: RefineToolContext): RefineBrowserProvider {
  const browser = context.browser;
  if (!browser || typeof browser !== "object" || typeof (browser as RefineBrowserProvider).capturePageObservation !== "function") {
    throw new Error("refine browser provider is required");
  }
  return browser as RefineBrowserProvider;
}
