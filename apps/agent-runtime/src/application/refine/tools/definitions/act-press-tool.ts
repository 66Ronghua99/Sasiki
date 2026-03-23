import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserService } from "../services/refine-browser-service.js";

const ACT_PRESS_DESCRIPTION = "Press a keyboard key on the active page from a specific source observation.";
const ACT_PRESS_SCHEMA = {
  type: "object",
  properties: {
    key: { type: "string" },
    sourceObservationRef: { type: "string" },
  },
  required: ["key", "sourceObservationRef"],
  additionalProperties: false,
} as const;

export const actPressTool: RefineToolDefinition = {
  name: "act.press",
  description: ACT_PRESS_DESCRIPTION,
  inputSchema: ACT_PRESS_SCHEMA,
  async invoke(args, context) {
    return (await readBrowserService(context).pressKey({
      key: readStringArg(args, "key"),
      sourceObservationRef: readStringArg(args, "sourceObservationRef"),
    })) as unknown as ToolCallResult;
  },
};

function readBrowserService(context: RefineToolContext): RefineBrowserService {
  const browserService = context.browserService;
  if (
    !browserService ||
    typeof browserService !== "object" ||
    typeof (browserService as RefineBrowserService).pressKey !== "function"
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
