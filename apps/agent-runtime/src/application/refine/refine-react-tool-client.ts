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

export interface RefineReactToolClientOptions {
  rawClient: ToolClient;
  session: RefineReactSession;
  hitlAnswerProvider?: HitlAnswerProvider;
}

export class RefineReactToolClient implements ToolClient {
  private readonly registry: RefineReactToolRegistry;
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
    return this.registry.listTools();
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
