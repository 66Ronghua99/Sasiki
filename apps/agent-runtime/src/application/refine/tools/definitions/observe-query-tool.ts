import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { ObserveQueryMode, ObserveQueryRequest } from "../../../../domain/refine-react.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineBrowserProvider } from "../providers/refine-browser-provider.js";

const OBSERVE_QUERY_MODES: readonly ObserveQueryMode[] = ["search", "inspect"] as const;
const OBSERVE_QUERY_DESCRIPTION = "Find elements in the latest snapshot by deterministic structural filters.";
const OBSERVE_QUERY_SCHEMA = {
  type: "object",
  properties: {
    mode: {
      type: "string",
      enum: OBSERVE_QUERY_MODES,
    },
    intent: { type: "string" },
    text: { type: "string" },
    role: { type: "string" },
    elementRef: { type: "string" },
    limit: { type: "integer", minimum: 1 },
  },
  required: ["mode"],
  additionalProperties: false,
} as const;

export const observeQueryTool: RefineToolDefinition = {
  name: "observe.query",
  description: OBSERVE_QUERY_DESCRIPTION,
  inputSchema: OBSERVE_QUERY_SCHEMA,
  async invoke(args, context) {
    return (await readBrowserProvider(context).queryObservation({
      mode: readEnumArg(args, "mode", OBSERVE_QUERY_MODES),
      intent: readOptionalStringArg(args, "intent"),
      text: readOptionalStringArg(args, "text"),
      role: readOptionalStringArg(args, "role"),
      elementRef: readOptionalStringArg(args, "elementRef"),
      limit: readPositiveIntegerArg(args, "limit"),
    } satisfies ObserveQueryRequest)) as unknown as ToolCallResult;
  },
};

function readBrowserProvider(context: RefineToolContext): RefineBrowserProvider {
  const browser = context.browser;
  if (!browser || typeof browser !== "object" || typeof (browser as RefineBrowserProvider).queryObservation !== "function") {
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

function readOptionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readPositiveIntegerArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
}

function readEnumArg<T extends string>(args: Record<string, unknown>, key: string, values: readonly T[]): T {
  const value = readStringArg(args, key);
  if (!values.includes(value as T)) {
    throw new Error(`invalid argument: ${key}=${value}`);
  }
  return value as T;
}
