import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineRuntimeProvider } from "../providers/refine-runtime-provider.js";

const HITL_REQUEST_DESCRIPTION = "Ask for human intervention when safe progress requires explicit human input.";
const HITL_REQUEST_SCHEMA = {
  type: "object",
  properties: {
    prompt: { type: "string" },
    context: { type: "string" },
  },
  required: ["prompt"],
  additionalProperties: false,
} as const;

export const hitlRequestTool: RefineToolDefinition = {
  name: "hitl.request",
  description: HITL_REQUEST_DESCRIPTION,
  inputSchema: HITL_REQUEST_SCHEMA,
  async invoke(args, context) {
    return (await readRuntimeProvider(context).requestHumanInput({
      prompt: readStringArg(args, "prompt"),
      context: readOptionalStringArg(args, "context"),
    })) as unknown as ToolCallResult;
  },
};

function readRuntimeProvider(context: RefineToolContext): RefineRuntimeProvider {
  const runtime = context.runtime;
  if (!runtime || typeof runtime !== "object" || typeof (runtime as RefineRuntimeProvider).requestHumanInput !== "function") {
    throw new Error("refine runtime provider is required");
  }
  return runtime as RefineRuntimeProvider;
}

function readStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`missing required argument: ${key}`);
  }
  return value.trim();
}

function readOptionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
