import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserProvider } from "../providers/refine-browser-provider.js";

const ACT_SCREENSHOT_DESCRIPTION = "Capture a screenshot and optionally write it to a file path.";
const ACT_SCREENSHOT_SCHEMA = {
  type: "object",
  properties: {
    sourceObservationRef: { type: "string" },
    fullPage: { type: "boolean" },
    filename: { type: "string" },
    path: { type: "string" },
    filePath: { type: "string" },
  },
  required: ["sourceObservationRef"],
  additionalProperties: false,
} as const;

export const actScreenshotTool: RefineToolDefinition = {
  name: "act.screenshot",
  description: ACT_SCREENSHOT_DESCRIPTION,
  inputSchema: ACT_SCREENSHOT_SCHEMA,
  async invoke(args, context) {
    return (await readBrowserProvider(context).captureScreenshot({
      sourceObservationRef: readStringArg(args, "sourceObservationRef"),
      fullPage: readBooleanArg(args, "fullPage"),
      filename: readScreenshotOutputArg(args),
    })) as unknown as ToolCallResult;
  },
};

function readBrowserProvider(context: RefineToolContext): RefineBrowserProvider {
  const browser = context.browser;
  if (!browser || typeof browser !== "object" || typeof (browser as RefineBrowserProvider).captureScreenshot !== "function") {
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

function readOptionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readScreenshotOutputArg(args: Record<string, unknown>): string | undefined {
  return readOptionalStringArg(args, "filename") ?? readOptionalStringArg(args, "path") ?? readOptionalStringArg(args, "filePath");
}
