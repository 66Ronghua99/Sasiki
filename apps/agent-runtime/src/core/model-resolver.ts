/**
 * Deps: @mariozechner/pi-ai
 * Used By: core/pi-agent-core-loop.ts
 * Last Updated: 2026-03-04
 */
import { getModel, type KnownProvider, type Model } from "@mariozechner/pi-ai";

export interface ModelResolverConfig {
  model: string;
  baseUrl?: string;
}

export class ModelResolver {
  static resolve(config: ModelResolverConfig): Model<any> {
    const parsed = this.parseModel(config.model);
    const resolved = getModel(parsed.provider as KnownProvider, parsed.model as never);
    if (!config.baseUrl) {
      return resolved;
    }
    return { ...resolved, baseUrl: config.baseUrl };
  }

  private static parseModel(model: string): { provider: string; model: string } {
    const value = model.trim();
    if (!value) {
      return { provider: "openai", model: "gpt-4o-mini" };
    }
    const slash = value.indexOf("/");
    if (slash > 0) {
      return { provider: value.slice(0, slash), model: value.slice(slash + 1) };
    }
    const colon = value.indexOf(":");
    if (colon > 0) {
      return { provider: value.slice(0, colon), model: value.slice(colon + 1) };
    }
    return { provider: "openai", model: value };
  }
}
