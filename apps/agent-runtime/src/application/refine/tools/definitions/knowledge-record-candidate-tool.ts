import type { ToolCallResult } from "../../../../contracts/tool-client.js";
import type { RefineToolContext } from "../refine-tool-context.js";
import type { RefineToolDefinition } from "../refine-tool-definition.js";
import type { RefineRunService } from "../services/refine-run-service.js";

const KNOWLEDGE_RECORD_CANDIDATE_DESCRIPTION = "Record a page-level retrieval cue with provenance references.";
const KNOWLEDGE_RECORD_CANDIDATE_SCHEMA = {
  type: "object",
  properties: {
    page: {
      type: "object",
      properties: {
        origin: { type: "string" },
        normalizedPath: { type: "string" },
      },
      required: ["origin", "normalizedPath"],
      additionalProperties: false,
    },
    guide: { type: "string" },
    keywords: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 3,
    },
    rationale: { type: "string" },
    sourceObservationRef: { type: "string" },
    sourceActionRef: { type: "string" },
  },
  required: ["page", "guide", "keywords", "sourceObservationRef"],
  additionalProperties: false,
} as const;

export const knowledgeRecordCandidateTool: RefineToolDefinition = {
  name: "knowledge.record_candidate",
  description: KNOWLEDGE_RECORD_CANDIDATE_DESCRIPTION,
  inputSchema: KNOWLEDGE_RECORD_CANDIDATE_SCHEMA,
  async invoke(args, context) {
    return (await readRunService(context).recordKnowledgeCandidate({
      page: readPageArg(args),
      guide: readStringArg(args, "guide"),
      keywords: readStringArrayArg(args, "keywords"),
      rationale: readOptionalStringArg(args, "rationale"),
      sourceObservationRef: readStringArg(args, "sourceObservationRef"),
      sourceActionRef: readOptionalStringArg(args, "sourceActionRef"),
    })) as unknown as ToolCallResult;
  },
};

function readRunService(context: RefineToolContext): RefineRunService {
  const runService = context.runService;
  if (
    !runService ||
    typeof runService !== "object" ||
    typeof (runService as RefineRunService).recordKnowledgeCandidate !== "function"
  ) {
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

function readOptionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readStringArrayArg(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value)) {
    throw new Error(`missing required argument: ${key}`);
  }
  if (value.length < 1 || value.length > 3) {
    throw new Error(`invalid argument: ${key}`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new Error(`invalid argument: ${key}[${index}]`);
    }
    return entry.trim();
  });
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
