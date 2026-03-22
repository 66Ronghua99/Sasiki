/**
 * Deps: contracts/tool-client.ts, domain/attention-knowledge.ts, domain/refine-react.ts, application/refine/refine-runtime-tools.ts, application/refine/refine-react-tool-registry.ts
 * Used By: application/refine/refine-react-tool-client.ts
 * Last Updated: 2026-03-22
 */
import type { ToolCallResult, ToolDefinition } from "../../contracts/tool-client.js";
import { ATTENTION_KNOWLEDGE_CATEGORIES } from "../../domain/attention-knowledge.js";
import type { RefineFinishReason } from "../../domain/refine-react.js";
import type { RefineReactSession } from "./refine-react-session.js";
import { RefineRuntimeTools, type HitlAnswerProvider } from "./refine-runtime-tools.js";
import type { RefineReactToolAdapter } from "./refine-react-tool-registry.js";

const RUN_FINISH_REASONS: readonly RefineFinishReason[] = ["goal_achieved", "hard_failure"] as const;

const RUNTIME_TOOL_NAMES = [
  "hitl.request",
  "knowledge.record_candidate",
  "run.finish",
] as const;

const RUNTIME_TOOL_DESCRIPTIONS: Record<(typeof RUNTIME_TOOL_NAMES)[number], string> = {
  "hitl.request": "Ask for human intervention when safe progress requires explicit human input.",
  "knowledge.record_candidate": "Record reusable attention knowledge candidate with provenance references.",
  "run.finish": "Explicitly mark refine run completion or hard failure with a summary.",
};

const RUNTIME_TOOL_SCHEMAS: Record<(typeof RUNTIME_TOOL_NAMES)[number], Record<string, unknown>> = {
  "hitl.request": {
    type: "object",
    properties: {
      prompt: { type: "string" },
      context: { type: "string" },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  "knowledge.record_candidate": {
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
  },
  "run.finish": {
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
  },
};

export interface RefineReactRuntimeToolAdapterOptions {
  session: RefineReactSession;
  hitlAnswerProvider?: HitlAnswerProvider;
}

export class RefineReactRuntimeToolAdapter implements RefineReactToolAdapter {
  private readonly runtimeTools: RefineRuntimeTools;

  constructor(options: RefineReactRuntimeToolAdapterOptions) {
    this.runtimeTools = new RefineRuntimeTools({
      session: options.session,
      hitlAnswerProvider: options.hitlAnswerProvider,
    });
  }

  setSession(session: RefineReactSession): void {
    this.runtimeTools.setSession(session);
  }

  setHitlAnswerProvider(provider?: HitlAnswerProvider): void {
    this.runtimeTools.setHitlAnswerProvider(provider);
  }

  listTools(): ToolDefinition[] {
    return RUNTIME_TOOL_NAMES.map((name) => ({
      name,
      description: RUNTIME_TOOL_DESCRIPTIONS[name],
      inputSchema: RUNTIME_TOOL_SCHEMAS[name],
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult | undefined> {
    switch (name) {
      case "hitl.request":
        return (await this.runtimeTools.requestHitl({
          prompt: this.readStringArg(args, "prompt"),
          context: this.readOptionalStringArg(args, "context"),
        })) as unknown as ToolCallResult;
      case "knowledge.record_candidate":
        return (await this.runtimeTools.recordCandidate({
          taskScope: this.readStringArg(args, "taskScope"),
          page: this.readPageArg(args),
          category: this.readStringArg(args, "category") as never,
          cue: this.readStringArg(args, "cue"),
          rationale: this.readOptionalStringArg(args, "rationale"),
          sourceObservationRef: this.readStringArg(args, "sourceObservationRef"),
          sourceActionRef: this.readOptionalStringArg(args, "sourceActionRef"),
        })) as unknown as ToolCallResult;
      case "run.finish":
        return (await this.runtimeTools.finishRun({
          reason: this.readEnumArg(args, "reason", RUN_FINISH_REASONS),
          summary: this.readStringArg(args, "summary"),
        })) as unknown as ToolCallResult;
      default:
        return undefined;
    }
  }

  private readStringArg(args: Record<string, unknown>, key: string): string {
    const value = args[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`missing required argument: ${key}`);
    }
    return value.trim();
  }

  private readOptionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
    const value = args[key];
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private readEnumArg<T extends string>(args: Record<string, unknown>, key: string, values: readonly T[]): T {
    const value = this.readStringArg(args, key);
    if (!values.includes(value as T)) {
      throw new Error(`invalid argument: ${key}=${value}`);
    }
    return value as T;
  }

  private readPageArg(args: Record<string, unknown>): { origin: string; normalizedPath: string } {
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
}
