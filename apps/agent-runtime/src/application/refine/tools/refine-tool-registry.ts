import type { RefineToolDefinition } from "./refine-tool-definition.js";

export interface RefineToolRegistryOptions<TDefinition extends RefineToolDefinition = RefineToolDefinition> {
  definitions: readonly TDefinition[];
}

export class RefineToolRegistry<TDefinition extends RefineToolDefinition = RefineToolDefinition> {
  private readonly definitions: TDefinition[] = [];
  private readonly definitionByName = new Map<string, TDefinition>();

  constructor(options: RefineToolRegistryOptions<TDefinition>) {
    this.registerDefinitions(options.definitions);
  }

  listDefinitions(): TDefinition[] {
    return [...this.definitions];
  }

  getDefinition(name: string): TDefinition {
    const definition = this.definitionByName.get(name);
    if (!definition) {
      throw new Error(`unknown refine tool: ${name}`);
    }
    return definition;
  }

  private registerDefinitions(definitions: readonly TDefinition[]): void {
    for (const definition of definitions) {
      if (!definition.name.trim()) {
        throw new Error("refine tool definition must include non-empty name");
      }
      if (this.definitionByName.has(definition.name)) {
        throw new Error(`duplicate refine tool definition: ${definition.name}`);
      }
      this.definitionByName.set(definition.name, definition);
      this.definitions.push(definition);
    }
  }
}
