import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserService } from "../services/refine-browser-service.js";

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
    return (await readBrowserService(context).capturePageObservation()) as unknown as ToolCallResult;
  },
};

function readBrowserService(context: RefineToolContext): RefineBrowserService {
  const browserService = context.browserService;
  if (
    !browserService ||
    typeof browserService !== "object" ||
    typeof (browserService as RefineBrowserService).capturePageObservation !== "function"
  ) {
    throw new Error("refine browser service is required");
  }
  return browserService as RefineBrowserService;
}
