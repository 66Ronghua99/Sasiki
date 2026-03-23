import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserService } from "../services/refine-browser-service.js";

const ACT_FILE_UPLOAD_DESCRIPTION =
  "Upload file paths to the active file chooser or close chooser when no paths are provided.";
const ACT_FILE_UPLOAD_SCHEMA = {
  type: "object",
  properties: {
    sourceObservationRef: { type: "string" },
    paths: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["sourceObservationRef"],
  additionalProperties: false,
} as const;

export const actFileUploadTool: RefineToolDefinition = {
  name: "act.file_upload",
  description: ACT_FILE_UPLOAD_DESCRIPTION,
  inputSchema: ACT_FILE_UPLOAD_SCHEMA,
  async invoke(args, context) {
    return (await readBrowserService(context).handleFileUpload({
      sourceObservationRef: readStringArg(args, "sourceObservationRef"),
      paths: readStringArrayArg(args, "paths"),
    })) as unknown as ToolCallResult;
  },
};

function readBrowserService(context: RefineToolContext): RefineBrowserService {
  const browserService = context.browserService;
  if (
    !browserService ||
    typeof browserService !== "object" ||
    typeof (browserService as RefineBrowserService).handleFileUpload !== "function"
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

function readStringArrayArg(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`invalid argument: ${key}`);
  }
  if (value.some((item) => typeof item !== "string")) {
    throw new Error(`invalid argument: ${key}`);
  }
  return value.length > 0 ? value : undefined;
}
