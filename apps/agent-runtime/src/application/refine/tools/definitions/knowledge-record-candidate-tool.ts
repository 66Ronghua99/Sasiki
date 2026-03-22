import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import {
  ATTENTION_KNOWLEDGE_CATEGORIES,
  type AttentionKnowledgeCategory,
} from "../../../../domain/attention-knowledge.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineRuntimeProvider } from "../providers/refine-runtime-provider.js";

const KNOWLEDGE_RECORD_CANDIDATE_DESCRIPTION =
  "Record reusable attention knowledge candidate with provenance references.";
const KNOWLEDGE_RECORD_CANDIDATE_SCHEMA = {
  type: "object",
  properties: {
    taskScope: { type: "string" },
    page: {
      type: "object",
      properties: {
        origin: { type: "string" },
        normalizedPath: { type: "string" },
      },
      required: ["origin", "normalizedPath"],
      additionalProperties: false,
    },
    category: {
      type: "string",
      enum: ATTENTION_KNOWLEDGE_CATEGORIES,
    },
    cue: { type: "string" },
    rationale: { type: "string" },
    sourceObservationRef: { type: "string" },
    sourceActionRef: { type: "string" },
  },
  required: ["taskScope", "page", "category", "cue", "sourceObservationRef"],
  additionalProperties: false,
} as const;

export const knowledgeRecordCandidateTool: RefineToolDefinition = {
  name: "knowledge.record_candidate",
  description: KNOWLEDGE_RECORD_CANDIDATE_DESCRIPTION,
  inputSchema: KNOWLEDGE_RECORD_CANDIDATE_SCHEMA,
  async invoke(args, context) {
    return (await readRuntimeProvider(context).recordKnowledgeCandidate({
      taskScope: readStringArg(args, "taskScope"),
      page: readPageArg(args),
      category: readEnumArg(args, "category", ATTENTION_KNOWLEDGE_CATEGORIES),
      cue: readStringArg(args, "cue"),
      rationale: readOptionalStringArg(args, "rationale"),
      sourceObservationRef: readStringArg(args, "sourceObservationRef"),
      sourceActionRef: readOptionalStringArg(args, "sourceActionRef"),
    })) as unknown as ToolCallResult;
  },
};

function readRuntimeProvider(context: RefineToolContext): RefineRuntimeProvider {
  const runtime = context.runtime;
  if (
    !runtime ||
    typeof runtime !== "object" ||
    typeof (runtime as RefineRuntimeProvider).recordKnowledgeCandidate !== "function"
  ) {
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

function readEnumArg<T extends string>(args: Record<string, unknown>, key: string, values: readonly T[]): T {
  const value = readStringArg(args, key);
  if (!values.includes(value as T)) {
    throw new Error(`invalid argument: ${key}=${value}`);
  }
  return value as T;
}

function readPageArg(args: Record<string, unknown>): { origin: string; normalizedPath: string } {
  const value = args.page;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("missing required argument: page");
  }
  const page = value as Record<string, unknown>;
  const origin = page.origin;
  const normalizedPath = page.normalizedPath;
  if (typeof origin !== "string" || !origin.trim()) {
    throw new Error("missing required argument: page.origin");
  }
  if (typeof normalizedPath !== "string" || !normalizedPath.trim()) {
    throw new Error("missing required argument: page.normalizedPath");
  }
  return {
    origin: origin.trim(),
    normalizedPath: normalizedPath.trim(),
  };
}
