/**
 * Deps: contracts/tool-client.ts, domain/refine-react.ts, application/refine/refine-react-tool-registry.ts
 * Used By: runtime/replay-refinement/react-refinement-run-executor.ts
 * Last Updated: 2026-03-22
 */
import type { ToolCallResult, ToolClient, ToolDefinition } from "../../contracts/tool-client.js";
import { createRefineReactSession, type RefineReactSession } from "./refine-react-session.js";
import { type HitlAnswerProvider } from "./refine-runtime-tools.js";
import { RefineReactToolRegistry } from "./refine-react-tool-registry.js";
import { RefineReactBrowserToolAdapter } from "./refine-react-browser-tool-adapter.js";
import { RefineReactRuntimeToolAdapter } from "./refine-react-runtime-tool-adapter.js";
import { REFINE_TOOL_ORDER } from "./tools/refine-tool-order.js";
import { createRefineBrowserToolRegistry } from "./tools/refine-browser-tool-registry.js";
import { createRefineRuntimeToolRegistry } from "./tools/refine-runtime-tool-registry.js";
import { toToolDefinition } from "./tools/refine-tool-definition.js";

export interface RefineReactToolClientOptions {
  rawClient: ToolClient;
  session: RefineReactSession;
  hitlAnswerProvider?: HitlAnswerProvider;
}

export class RefineReactToolClient implements ToolClient {
  private readonly registry: RefineReactToolRegistry;
  private readonly orderedToolDefinitions: ToolDefinition[];
  private session: RefineReactSession;
  private connected = false;

  constructor(options: RefineReactToolClientOptions) {
    this.session = options.session;
    const browserAdapter = new RefineReactBrowserToolAdapter({
      rawClient: options.rawClient,
      session: this.session,
    });
    const runtimeAdapter = new RefineReactRuntimeToolAdapter({
      session: this.session,
      hitlAnswerProvider: options.hitlAnswerProvider,
    });
    this.registry = new RefineReactToolRegistry({
      adapters: [browserAdapter, runtimeAdapter],
      orderedToolNames: REFINE_TOOL_ORDER,
    });
    this.orderedToolDefinitions = buildOrderedToolDefinitions({
      browserAdapter,
      runtimeAdapter,
    });
  }

  setSession(session: RefineReactSession): void {
    this.session = session;
    this.registry.setSession(session);
  }

  setHitlAnswerProvider(provider?: HitlAnswerProvider): void {
    this.registry.setHitlAnswerProvider(provider);
  }

  getSession(): RefineReactSession {
    return this.session;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }
    await this.registry.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }
    await this.registry.disconnect();
    this.connected = false;
  }

  async listTools(): Promise<ToolDefinition[]> {
    return [...this.orderedToolDefinitions];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    return this.registry.callTool(name, args);
  }
}

export function createBootstrapRefineReactToolClient(rawClient: ToolClient): RefineReactToolClient {
  return new RefineReactToolClient({
    rawClient,
    session: createRefineReactSession("bootstrap", "bootstrap", { taskScope: "bootstrap" }),
  });
}

function buildOrderedToolDefinitions(options: {
  browserAdapter: RefineReactBrowserToolAdapter;
  runtimeAdapter: RefineReactRuntimeToolAdapter;
}): ToolDefinition[] {
  const migratedDefinitions = [
    ...createRefineBrowserToolRegistry().listDefinitions().map((definition) => toToolDefinition(definition)),
    ...createRefineRuntimeToolRegistry().listDefinitions().map((definition) => toToolDefinition(definition)),
  ];
  const migratedDefinitionByName = new Map(migratedDefinitions.map((definition) => [definition.name, definition]));
  const legacyDefinitions = [...options.browserAdapter.listTools(), ...options.runtimeAdapter.listTools()];
  const legacyDefinitionByName = new Map(legacyDefinitions.map((definition) => [definition.name, definition]));

  return REFINE_TOOL_ORDER.map((name) => {
    const definition = migratedDefinitionByName.get(name) ?? legacyDefinitionByName.get(name);
    if (!definition) {
      throw new Error(`tool definition missing: ${name}`);
    }
    return definition;
  });
}
