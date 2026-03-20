/**
 * Deps: contracts/tool-client.ts, domain/refine-react.ts, runtime/replay-refinement/refine-browser-tools.ts, runtime/replay-refinement/refine-runtime-tools.ts
 * Used By: runtime/replay-refinement/react-refinement-run-executor.ts
 * Last Updated: 2026-03-20
 */
import type { ToolCallResult, ToolClient, ToolDefinition } from "../../contracts/tool-client.js";
import { ATTENTION_KNOWLEDGE_CATEGORIES } from "../../domain/attention-knowledge.js";
import type { ObserveQueryRequest, RefineFinishReason } from "../../domain/refine-react.js";
import { REFINE_REACT_TOOL_NAMES } from "../../domain/refine-react.js";
import type { RefineReactSession } from "./refine-react-session.js";
import { RefineBrowserTools } from "./refine-browser-tools.js";
import { RefineRuntimeTools, type HitlAnswerProvider } from "./refine-runtime-tools.js";

export interface RefineReactToolClientOptions {
  rawClient: ToolClient;
  session: RefineReactSession;
  hitlAnswerProvider?: HitlAnswerProvider;
}

const OBSERVE_QUERY_MODES = ["search", "inspect"] as const;
const RUN_FINISH_REASONS: readonly RefineFinishReason[] = ["goal_achieved", "hard_failure"] as const;

const REFINE_REACT_TOOL_SCHEMAS: Record<(typeof REFINE_REACT_TOOL_NAMES)[number], Record<string, unknown>> = {
  "observe.page": {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  "observe.query": {
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
  },
  "act.click": {
    type: "object",
    properties: {
      elementRef: { type: "string" },
      sourceObservationRef: { type: "string" },
    },
    required: ["elementRef", "sourceObservationRef"],
    additionalProperties: false,
  },
  "act.type": {
    type: "object",
    properties: {
      elementRef: { type: "string" },
      sourceObservationRef: { type: "string" },
      text: { type: "string" },
      submit: { type: "boolean" },
    },
    required: ["elementRef", "sourceObservationRef", "text"],
    additionalProperties: false,
  },
  "act.press": {
    type: "object",
    properties: {
      key: { type: "string" },
      sourceObservationRef: { type: "string" },
    },
    required: ["key", "sourceObservationRef"],
    additionalProperties: false,
  },
  "act.navigate": {
    type: "object",
    properties: {
      url: { type: "string" },
      sourceObservationRef: { type: "string" },
    },
    required: ["url", "sourceObservationRef"],
    additionalProperties: false,
  },
  "act.select_tab": {
    type: "object",
    properties: {
      tabIndex: { type: "integer", minimum: 0 },
      sourceObservationRef: { type: "string" },
    },
    required: ["tabIndex", "sourceObservationRef"],
    additionalProperties: false,
  },
  "act.screenshot": {
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
  },
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

export class RefineReactToolClient implements ToolClient {
  private readonly rawClient: ToolClient;
  private readonly browserTools: RefineBrowserTools;
  private readonly runtimeTools: RefineRuntimeTools;
  private session: RefineReactSession;
  private connected = false;

  constructor(options: RefineReactToolClientOptions) {
    this.rawClient = options.rawClient;
    this.session = options.session;
    this.browserTools = new RefineBrowserTools({
      rawClient: this.rawClient,
      session: this.session,
    });
    this.runtimeTools = new RefineRuntimeTools({
      session: this.session,
      hitlAnswerProvider: options.hitlAnswerProvider,
    });
  }

  setSession(session: RefineReactSession): void {
    this.session = session;
    this.browserTools.setSession(session);
    this.runtimeTools.setSession(session);
  }

  setHitlAnswerProvider(provider?: HitlAnswerProvider): void {
    this.runtimeTools.setHitlAnswerProvider(provider);
  }

  getSession(): RefineReactSession {
    return this.session;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }
    await this.rawClient.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }
    await this.rawClient.disconnect();
    this.connected = false;
  }

  async listTools(): Promise<ToolDefinition[]> {
    return REFINE_REACT_TOOL_NAMES.map((name) => ({
      name,
      description: `refine-react tool: ${name}`,
      inputSchema: REFINE_REACT_TOOL_SCHEMAS[name],
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    switch (name) {
      case "observe.page":
        return (await this.browserTools.observePage()) as unknown as ToolCallResult;
      case "observe.query":
        return (await this.browserTools.observeQuery({
          mode: this.readEnumArg(args, "mode", OBSERVE_QUERY_MODES),
          intent: this.readOptionalStringArg(args, "intent"),
          text: this.readOptionalStringArg(args, "text"),
          role: this.readOptionalStringArg(args, "role"),
          elementRef: this.readOptionalStringArg(args, "elementRef"),
          limit: this.readPositiveIntegerArg(args, "limit"),
        } as ObserveQueryRequest)) as unknown as ToolCallResult;
      case "act.click":
        return this.browserTools.actClick({
          elementRef: this.readStringArg(args, "elementRef"),
          sourceObservationRef: this.readStringArg(args, "sourceObservationRef"),
        });
      case "act.type":
        return this.browserTools.actType({
          elementRef: this.readStringArg(args, "elementRef"),
          sourceObservationRef: this.readStringArg(args, "sourceObservationRef"),
          text: this.readStringArg(args, "text"),
          submit: this.readBooleanArg(args, "submit"),
        });
      case "act.press":
        return this.browserTools.actPress({
          key: this.readStringArg(args, "key"),
          sourceObservationRef: this.readStringArg(args, "sourceObservationRef"),
        });
      case "act.navigate":
        return this.browserTools.actNavigate({
          url: this.readStringArg(args, "url"),
          sourceObservationRef: this.readStringArg(args, "sourceObservationRef"),
        });
      case "act.select_tab":
        return this.browserTools.actSelectTab({
          tabIndex: this.readRequiredNonNegativeIntegerArg(args, "tabIndex"),
          sourceObservationRef: this.readStringArg(args, "sourceObservationRef"),
        });
      case "act.screenshot":
        return this.browserTools.actScreenshot({
          sourceObservationRef: this.readStringArg(args, "sourceObservationRef"),
          fullPage: this.readBooleanArg(args, "fullPage"),
          filename: this.readScreenshotOutputArg(args),
        });
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
        throw new Error(`unknown refine-react tool: ${name}`);
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

  private readBooleanArg(args: Record<string, unknown>, key: string): boolean | undefined {
    const value = args[key];
    return typeof value === "boolean" ? value : undefined;
  }

  private readPositiveIntegerArg(args: Record<string, unknown>, key: string): number | undefined {
    const value = args[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return undefined;
    }
    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : undefined;
  }

  private readRequiredNonNegativeIntegerArg(args: Record<string, unknown>, key: string): number {
    const value = args[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`missing required argument: ${key}`);
    }
    const normalized = Math.floor(value);
    if (normalized < 0) {
      throw new Error(`invalid argument: ${key}=${value}`);
    }
    return normalized;
  }

  private readEnumArg<T extends string>(args: Record<string, unknown>, key: string, values: readonly T[]): T {
    const value = this.readStringArg(args, key);
    if (!values.includes(value as T)) {
      throw new Error(`invalid argument: ${key}=${value}`);
    }
    return value as T;
  }

  private readScreenshotOutputArg(args: Record<string, unknown>): string | undefined {
    return (
      this.readOptionalStringArg(args, "filename") ??
      this.readOptionalStringArg(args, "path") ??
      this.readOptionalStringArg(args, "filePath")
    );
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
