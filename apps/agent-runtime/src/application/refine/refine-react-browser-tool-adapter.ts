/**
 * Deps: contracts/tool-client.ts, domain/refine-react.ts, application/refine/refine-browser-tools.ts, application/refine/refine-react-tool-registry.ts
 * Used By: application/refine/refine-react-tool-client.ts
 * Last Updated: 2026-03-22
 */
import type { ToolCallResult, ToolClient, ToolDefinition } from "../../contracts/tool-client.js";
import type { ObserveQueryRequest } from "../../domain/refine-react.js";
import { RefineBrowserTools } from "./refine-browser-tools.js";
import type { RefineReactSession } from "./refine-react-session.js";
import type { RefineReactToolAdapter } from "./refine-react-tool-registry.js";

const OBSERVE_QUERY_MODES = ["search", "inspect"] as const;

const BROWSER_TOOL_NAMES = [
  "observe.page",
  "observe.query",
  "act.click",
  "act.type",
  "act.press",
  "act.navigate",
  "act.select_tab",
  "act.screenshot",
  "act.file_upload",
] as const;

const BROWSER_TOOL_DESCRIPTIONS: Record<(typeof BROWSER_TOOL_NAMES)[number], string> = {
  "observe.page": "Capture the latest page snapshot with page identity and tab metadata.",
  "observe.query": "Find elements in the latest snapshot by deterministic structural filters.",
  "act.click": "Click a UI element from a specific source observation.",
  "act.type": "Type text into a UI element from a specific source observation.",
  "act.press": "Press a keyboard key on the active page from a specific source observation.",
  "act.navigate": "Navigate the active tab to a URL from a specific source observation.",
  "act.select_tab": "Switch active browser tab using a source observation for provenance.",
  "act.screenshot": "Capture a screenshot and optionally write it to a file path.",
  "act.file_upload": "Upload file paths to the active file chooser or close chooser when no paths are provided.",
};

const BROWSER_TOOL_SCHEMAS: Record<(typeof BROWSER_TOOL_NAMES)[number], Record<string, unknown>> = {
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
  "act.file_upload": {
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
  },
};

export interface RefineReactBrowserToolAdapterOptions {
  rawClient: ToolClient;
  session: RefineReactSession;
}

export class RefineReactBrowserToolAdapter implements RefineReactToolAdapter {
  private readonly rawClient: ToolClient;
  private readonly browserTools: RefineBrowserTools;

  constructor(options: RefineReactBrowserToolAdapterOptions) {
    this.rawClient = options.rawClient;
    this.browserTools = new RefineBrowserTools({
      rawClient: this.rawClient,
      session: options.session,
    });
  }

  async connect(): Promise<void> {
    await this.rawClient.connect();
  }

  async disconnect(): Promise<void> {
    await this.rawClient.disconnect();
  }

  setSession(session: RefineReactSession): void {
    this.browserTools.setSession(session);
  }

  listTools(): ToolDefinition[] {
    return BROWSER_TOOL_NAMES.map((name) => ({
      name,
      description: BROWSER_TOOL_DESCRIPTIONS[name],
      inputSchema: BROWSER_TOOL_SCHEMAS[name],
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult | undefined> {
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
      case "act.file_upload":
        return this.browserTools.actFileUpload({
          sourceObservationRef: this.readStringArg(args, "sourceObservationRef"),
          paths: this.readStringArrayArg(args, "paths"),
        });
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

  private readStringArrayArg(args: Record<string, unknown>, key: string): string[] | undefined {
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
}
