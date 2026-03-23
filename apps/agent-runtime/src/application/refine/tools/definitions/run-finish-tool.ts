import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineFinishReason } from "../../../../domain/refine-react.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineRunService } from "../services/refine-run-service.js";

const RUN_FINISH_REASONS: readonly RefineFinishReason[] = ["goal_achieved", "hard_failure"] as const;
const RUN_FINISH_DESCRIPTION = "Explicitly mark refine run completion or hard failure with a summary.";
const RUN_FINISH_SCHEMA = {
  type: "object",
  properties: {
    reason: {
      type: "string",
      enum: RUN_FINISH_REASONS,
    },
    summary: { type: "string" },
  },
  required: ["reason", "summary"],
  additionalProperties: false,
} as const;

export const runFinishTool: RefineToolDefinition = {
  name: "run.finish",
  description: RUN_FINISH_DESCRIPTION,
  inputSchema: RUN_FINISH_SCHEMA,
  async invoke(args, context) {
    return (await readRunService(context).finishRun({
      reason: readEnumArg(args, "reason", RUN_FINISH_REASONS),
      summary: readStringArg(args, "summary"),
    })) as unknown as ToolCallResult;
  },
};

function readRunService(context: RefineToolContext): RefineRunService {
  const runService = context.runService;
  if (!runService || typeof runService !== "object" || typeof (runService as RefineRunService).finishRun !== "function") {
    throw new Error("refine run service is required");
  }
  return runService as RefineRunService;
}

function readStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`missing required argument: ${key}`);
  }
  return value.trim();
}

function readEnumArg<T extends string>(args: Record<string, unknown>, key: string, values: readonly T[]): T {
  const value = readStringArg(args, key);
  if (!values.includes(value as T)) {
    throw new Error(`invalid argument: ${key}=${value}`);
  }
  return value as T;
}
