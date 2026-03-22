/**
 * Deps: contracts/tool-client.ts, application/refine/refine-react-session.ts, application/refine/refine-runtime-tools.ts
 * Used By: application/refine/refine-react-tool-client.ts
 * Last Updated: 2026-03-22
 */
import type { ToolCallResult, ToolDefinition } from "../../contracts/tool-client.js";
import type { RefineReactSession } from "./refine-react-session.js";
import type { HitlAnswerProvider } from "./refine-runtime-tools.js";

export interface RefineReactToolAdapter {
  listTools(): ToolDefinition[];
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult | undefined>;
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  setSession?(session: RefineReactSession): void;
  setHitlAnswerProvider?(provider?: HitlAnswerProvider): void;
}

export interface RefineReactToolRegistryOptions {
  adapters: RefineReactToolAdapter[];
  orderedToolNames: readonly string[];
}

export class RefineReactToolRegistry {
  private readonly adapters: RefineReactToolAdapter[];
  private readonly orderedToolNames: readonly string[];
  private readonly ownerByToolName = new Map<string, RefineReactToolAdapter>();
  private readonly definitionByToolName = new Map<string, ToolDefinition>();

  constructor(options: RefineReactToolRegistryOptions) {
    this.adapters = options.adapters;
    this.orderedToolNames = options.orderedToolNames;
    this.registerDefinitions();
  }

  async connect(): Promise<void> {
    const connected: RefineReactToolAdapter[] = [];
    try {
      for (const adapter of this.adapters) {
        if (!adapter.connect) {
          continue;
        }
        await adapter.connect();
        connected.push(adapter);
      }
    } catch (error) {
      for (const adapter of [...connected].reverse()) {
        if (!adapter.disconnect) {
          continue;
        }
        try {
          await adapter.disconnect();
        } catch {
          // ignore rollback errors to preserve original connect error
        }
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    for (const adapter of [...this.adapters].reverse()) {
      if (!adapter.disconnect) {
        continue;
      }
      await adapter.disconnect();
    }
  }

  setSession(session: RefineReactSession): void {
    for (const adapter of this.adapters) {
      adapter.setSession?.(session);
    }
  }

  setHitlAnswerProvider(provider?: HitlAnswerProvider): void {
    for (const adapter of this.adapters) {
      adapter.setHitlAnswerProvider?.(provider);
    }
  }

  async listTools(): Promise<ToolDefinition[]> {
    return this.orderedToolNames.map((name) => {
      const definition = this.definitionByToolName.get(name);
      if (!definition) {
        throw new Error(`tool definition missing: ${name}`);
      }
      return definition;
    });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const owner = this.ownerByToolName.get(name);
    if (!owner) {
      throw new Error(`unknown refine-react tool: ${name}`);
    }
    const result = await owner.callTool(name, args);
    if (result === undefined) {
      throw new Error(`refine-react tool adapter returned no result: ${name}`);
    }
    return result;
  }

  private registerDefinitions(): void {
    for (const adapter of this.adapters) {
      for (const definition of adapter.listTools()) {
        if (!definition.name.trim()) {
          throw new Error("tool definition must include non-empty name");
        }
        if (this.ownerByToolName.has(definition.name)) {
          throw new Error(`duplicate refine-react tool definition: ${definition.name}`);
        }
        this.ownerByToolName.set(definition.name, adapter);
        this.definitionByToolName.set(definition.name, definition);
      }
    }
    for (const name of this.orderedToolNames) {
      if (!this.ownerByToolName.has(name)) {
        throw new Error(`missing refine-react tool adapter for: ${name}`);
      }
    }
  }
}
